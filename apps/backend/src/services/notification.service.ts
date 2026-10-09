import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getSocketServer } from '../websocket/socket.server';
import { logger } from '../lib/logger';
import { scheduleNotificationDelivery } from '../jobs/queue';
import { config } from '../config';

type NotificationClient = Prisma.TransactionClient | typeof prisma;

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType | string;
  title: string;
  message?: string;
  body?: string;
  data?: Prisma.InputJsonValue;
  link?: string;
  dedupeKey?: string;
  expiresAt?: Date;
  sendEmail?: boolean;
}

const toNotificationType = (type: NotificationType | string) =>
  Object.values(NotificationType).includes(type as NotificationType)
    ? type as NotificationType
    : NotificationType.SYSTEM;

const emailNotificationTypes = new Set<NotificationType>([
  NotificationType.ORDER_NEW,
  NotificationType.SALE_NEW,
  NotificationType.ORDER_COMPLETED,
  NotificationType.PAYMENT_RECEIVED,
  NotificationType.DISPUTE_OPENED,
  NotificationType.DISPUTE_UPDATE,
  NotificationType.DISPUTE_RESOLVED,
  NotificationType.REFERRAL_COMMISSION,
]);

/** Central notification boundary. All persisted notifications should use this service. */
export class NotificationService {
  static async createNotification(input: CreateNotificationInput): Promise<any>;
  static async createNotification(userId: string, type: NotificationType | string, title: string, body: string, data?: Prisma.InputJsonValue): Promise<any>;
  static async createNotification(
    inputOrUserId: CreateNotificationInput | string,
    type?: NotificationType | string,
    title?: string,
    body?: string,
    data: Prisma.InputJsonValue = {},
  ) {
    const input: CreateNotificationInput = typeof inputOrUserId === 'string'
      ? { userId: inputOrUserId, type: type || NotificationType.SYSTEM, title: title || '', message: body || '', data }
      : inputOrUserId;
    const message = input.message ?? input.body ?? '';
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: toNotificationType(input.type),
        title: input.title,
        message,
        body: input.body ?? message,
        data: input.data ?? {},
        link: input.link,
        dedupeKey: input.dedupeKey,
        expiresAt: input.expiresAt,
      },
    });
    const sendEmail = Boolean(input.sendEmail || emailNotificationTypes.has(notification.type));
    this.emit(notification, sendEmail);
    return notification;
  }

  static async createInTransaction(client: NotificationClient, input: CreateNotificationInput) {
    const message = input.message ?? input.body ?? '';
    return client.notification.create({
      data: {
        userId: input.userId,
        type: toNotificationType(input.type),
        title: input.title,
        message,
        body: input.body ?? message,
        data: input.data ?? {},
        link: input.link,
        dedupeKey: input.dedupeKey,
        expiresAt: input.expiresAt,
      },
    });
  }

  static emit(notification: any, sendEmail = false) {
    if (sendEmail || config.telegram.botToken) {
      void scheduleNotificationDelivery(notification.id, sendEmail).catch((error: unknown) => {
        logger.error({
          notificationId: notification.id,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unable to queue notification delivery');
      });
    }
    getSocketServer()?.of('/notifications').to(`user:${notification.userId}`).emit('new_notification', notification);
  }

  static async sendNotification(userId: string, title: string, message: string, type: string, data: Prisma.InputJsonValue = {}) {
    return this.createNotification({ userId, type, title, message, data });
  }

  static async getNotificationPage(userId: string, options: { page?: number; limit?: number; unreadOnly?: boolean } = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 25));
    const where = {
      userId,
      ...(options.unreadOnly ? { isRead: false } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };
    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
    ]);
    return { items, page, limit, total, unreadCount, totalPages: Math.ceil(total / limit) };
  }

  static async getNotifications(userId: string) {
    return (await this.getNotificationPage(userId, { limit: 50 })).items;
  }

  static async markRead(id: string, userId: string) {
    const result = await prisma.notification.updateMany({
      where: { id, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  static async markAllRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  static async broadcast(input: Omit<CreateNotificationInput, 'userId'> & { userIds?: string[] }) {
    const userIds = input.userIds?.length
      ? input.userIds
      : (await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })).map((user) => user.id);
    if (!userIds.length) return { sent: 0 };
    const message = input.message ?? input.body ?? '';
    const created = await prisma.$transaction(async (tx) => {
      await tx.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          type: toNotificationType(input.type),
          title: input.title,
          message,
          body: input.body ?? message,
          data: input.data ?? {},
          link: input.link,
          dedupeKey: input.dedupeKey,
          expiresAt: input.expiresAt,
        })),
      });
      return tx.notification.findMany({
        where: { userId: { in: userIds }, title: input.title, createdAt: { gte: new Date(Date.now() - 5000) } },
        orderBy: { createdAt: 'desc' },
        take: userIds.length,
      });
    });
    created.forEach((notification) => this.emit(notification));
    return { sent: created.length };
  }
}

export function sendNotification(userId: string, title: string, message: string, type: string, data: Prisma.InputJsonValue = {}) {
  return NotificationService.sendNotification(userId, title, message, type, data);
}
