import { Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { createEmailProvider } from '../integrations/email/email.provider';
import { renderNotificationEmail, resolveNotificationEmailRole } from '../integrations/email/email.templates';
import { renderWelcomeEmail } from '../integrations/email/email.templates';
import { logger } from '../lib/logger';
import { config } from '../config';
import { TelegramBotService } from '../integrations/telegram/telegram.bot';
import { getTelegramNotificationText } from './notification-message';

export const notificationWorker = new Worker('NOTIFICATION_QUEUE', async (job) => {
  const notificationId = job.data.notificationId;
  if (typeof notificationId !== 'string' || !notificationId) {
    throw new Error('Notification delivery job is missing notificationId');
  }

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      user: {
        select: {
          email: true,
          telegramChatId: true,
          profile: { select: { displayName: true } },
          roles: { select: { role: { select: { name: true } } } },
        },
      },
    },
  });
  if (!notification) {
    logger.warn({ notificationId }, 'Notification delivery skipped because its notification no longer exists');
    return;
  }

  if (notification.user.telegramChatId) {
    await TelegramBotService.sendMessage(
      notification.user.telegramChatId,
      getTelegramNotificationText(notification),
    );
    logger.info({ notificationId, userId: notification.userId }, 'Private Telegram notification delivered');
    return;
  }

  if (config.app.env !== 'production' && config.telegram.botToken) {
    logger.info({ notificationId, userId: notification.userId }, 'Telegram notification skipped because the user has not linked a private chat');
    return;
  }

  if (job.data.sendEmail === false) {
    logger.info({ notificationId, userId: notification.userId }, 'External notification skipped because no private Telegram chat is linked');
    return;
  }

  const data = notification.data;
  const isWelcomeEmail = data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'emailTemplate' in data &&
    data.emailTemplate === 'welcome';
  if (isWelcomeEmail) {
    if (config.email.provider !== 'smtp') {
      throw new Error('Welcome email delivery requires EMAIL_PROVIDER=smtp; mock delivery is disabled');
    }
    const [categories, products] = await Promise.all([
      prisma.category.findMany({
        where: { isActive: true, products: { some: { status: 'ACTIVE', stock: { gt: 0 } } } },
        select: { name: true },
        orderBy: { sortOrder: 'asc' },
        take: 4,
      }),
      prisma.product.findMany({
        where: { status: 'ACTIVE', stock: { gt: 0 }, discountPercent: { gt: 0 } },
        select: {
          name: true,
          discountPercent: true,
          currency: true,
          currentPrice: true,
          category: { select: { name: true } },
        },
        orderBy: { discountPercent: 'desc' },
        take: 3,
      }),
    ]);
    const email = renderWelcomeEmail(
      notification.user.profile?.displayName || 'there',
      config.app.frontendUrl,
      categories.map(({ name }) => name),
      products.map((product) => ({
        productName: product.name,
        categoryName: product.category.name,
        discountPercent: product.discountPercent.toString(),
        currency: product.currency,
        currentPrice: product.currentPrice.toString(),
      })),
    );
    await createEmailProvider().sendEmail(
      notification.user.email,
      email.subject,
      email.html,
      email.text,
    );
    logger.info({ notificationId, userId: notification.userId }, 'Welcome email delivered');
    return;
  }

  const roleNames = notification.user.roles.map(({ role }) => role.name);
  const role = resolveNotificationEmailRole(
    notification.type,
    notification.link,
    roleNames,
    notification.title,
  );
  const email = renderNotificationEmail({
    title: notification.title,
    message: notification.body || notification.message,
    recipientName: notification.user.profile?.displayName || (role === 'seller' ? 'Seller' : 'Buyer'),
    type: notification.type,
    link: notification.link,
    role,
    frontendUrl: config.app.frontendUrl,
  });
  await createEmailProvider().sendEmail(
    notification.user.email,
    email.subject,
    email.html,
    email.text,
  );
  logger.info({ notificationId, role }, 'Notification email sent');
}, {
  connection: redis,
  concurrency: 5,
});

notificationWorker.on('failed', (job, error) => {
  logger.error({
    jobId: job?.id,
    error: error.message,
  }, 'Notification delivery failed');
});
