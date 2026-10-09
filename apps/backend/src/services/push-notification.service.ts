import webpush from 'web-push';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { logger } from '../lib/logger';

export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const configured = Boolean(config.push.publicKey && config.push.privateKey);

if (configured) {
  webpush.setVapidDetails(config.push.subject, config.push.publicKey!, config.push.privateKey!);
}

export class PushNotificationService {
  static isConfigured() {
    return configured;
  }

  static async upsertSubscription(userId: string, input: PushSubscriptionInput, userAgent?: string) {
    if (!input.endpoint || !input.keys?.p256dh || !input.keys?.auth) {
      throw new Error('Invalid push subscription payload');
    }
    return prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      update: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent, lastUsedAt: new Date() },
      create: { userId, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent, lastUsedAt: new Date() },
    });
  }

  static async removeSubscription(userId: string, endpoint: string) {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  static async sendToUser(userId: string, payload: { title: string; message: string; link?: string; data?: Record<string, unknown> }) {
    if (!configured) return { sent: 0, skipped: true };
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    let sent = 0;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify({ ...payload, tag: `deposit-${payload.data?.depositId ?? 'notification'}` }),
        );
        sent += 1;
        await prisma.pushSubscription.update({ where: { id: subscription.id }, data: { lastUsedAt: new Date() } });
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => undefined);
        } else {
          logger.warn({ userId, subscriptionId: subscription.id, error: error instanceof Error ? error.message : String(error) }, 'Web Push delivery failed');
        }
      }
    }
    return { sent, skipped: false };
  }
}
