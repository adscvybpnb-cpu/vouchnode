import { FastifyInstance } from 'fastify';
import { UserService } from '../services/user.service';
import { createAuditLog } from '../middleware/audit.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { config } from '../config';
import { createStorageProvider } from '../integrations/storage/storage.provider';
import { emitPresenceUpdate, schedulePresenceExpiry } from '../websocket/socket.server';
import { randomUUID } from 'node:crypto';
import { ReferralService } from '../services/referral.service';
import { TelegramBotService } from '../integrations/telegram/telegram.bot';

const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(500).nullable().optional(),
  countryCode: z.string().trim().max(2).nullable().optional(),
  timezone: z.string().trim().max(100).nullable().optional(),
  language: z.string().trim().max(10).nullable().optional(),
  twitterUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
  linkedinUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
  githubUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
  websiteUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
  avatarUrl: z.string().max(2048).refine((value) => value.startsWith('/uploads/') || /^https?:\/\//.test(value), 'Invalid avatar URL').nullable().optional(),
});
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});
const emailUpdateSchema = z.object({ email: z.string().trim().email().max(254) });

export default async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/me/telegram/status', async (request: any, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { telegramChatId: true },
    });
    if (!user) return reply.status(404).send({ message: 'User not found' });
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    return reply.send({ data: { linked: Boolean(user.telegramChatId) } });
  });

  app.post('/me/telegram/link', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request: any, reply) => {
    try {
      return reply.send({ data: await TelegramBotService.createLink(request.user.id) });
    } catch (error) {
      if (error instanceof Error && error.message === 'TELEGRAM_NOT_CONFIGURED') {
        return reply.status(503).send({ message: 'Telegram linking is not configured on the server.' });
      }
      request.log.error({ error, userId: request.user.id }, 'Unable to create Telegram account link');
      return reply.status(503).send({ message: 'Unable to create a Telegram link right now. Please try again.' });
    }
  });

  const updateProfile = async (request: any, reply: any) => {
    const userId = request.user?.id;
    if (!userId) return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' });
    const parsed = profileUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ statusCode: 422, error: 'Validation Error', message: 'Invalid profile data', details: parsed.error.flatten().fieldErrors });
    }
    const { displayName, avatarUrl, ...rest } = parsed.data as {
      displayName: string;
      avatarUrl?: string | null;
      [key: string]: any;
    };
    const cleanData = {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      ...Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && v !== '')
      ),
    };
    const updated = await prisma.$transaction(async (tx) => {
      return tx.userProfile.update({ where: { userId }, data: cleanData });
    });
    return reply.send({ data: updated, message: 'Profile updated successfully' });
  };

  app.patch('/profile', updateProfile);

  app.patch('/me/presence', async (request: any, reply) => {
    const body = (request.body || {}) as { online?: boolean; onlineUntil?: string | null; durationHours?: 1 | 2 | 3 | 4 | null };
    const online = body.online;
    if (typeof online !== 'boolean') return reply.status(422).send({ message: 'online must be a boolean' });
    if (online && body.durationHours !== null && body.durationHours !== undefined && ![1, 2, 3, 4].includes(body.durationHours)) {
      return reply.status(422).send({ message: 'durationHours must be between 1 and 4, or null' });
    }
    const onlineUntil = online && body.durationHours
      ? new Date(Date.now() + body.durationHours * 60 * 60 * 1000)
      : null;
    const user = await prisma.user.update({
      where: { id: request.user.id },
      data: { isOnline: online, onlineUntil, lastActiveAt: new Date() },
      select: { isOnline: true, onlineUntil: true, lastActiveAt: true },
    });
    schedulePresenceExpiry(request.user.id, user.onlineUntil);
    emitPresenceUpdate(request.user.id, user.isOnline, user.onlineUntil);
    return reply.send({ data: user });
  });

  app.get('/me/referrals', async (request: any, reply) => {
    try {
      return reply.send({ data: await ReferralService.getOverview(request.user.id) });
    } catch (error: any) {
      request.log.error({ error, userId: request.user?.id }, 'Unable to load referral overview');
      return reply.status(error.statusCode || 500).send({
        statusCode: error.statusCode || 500,
        error: 'Referral Overview Failed',
        message: error.statusCode ? error.message : 'Unable to load referral information.',
      });
    }
  });

  app.patch('/me/email', async (request: any, reply: any) => {
    const parsed = emailUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(422).send({ statusCode: 422, error: 'Validation Error', message: 'A valid email address is required.' });
    try {
      return reply.send({ data: await UserService.updateEmail(request.user.id, parsed.data.email), message: 'Email updated. Verification is required.' });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({ statusCode: error.statusCode || 400, error: 'Email Update Failed', message: error.message });
    }
  });

  app.post('/profile/avatar', async (request: any, reply: any) => {
    const userId = request.user?.id;
    if (!userId) return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' });

    const storage = createStorageProvider(
      config.storage.provider,
      config.storage.local.path,
      '/uploads',
      config.storage.s3,
    );
    let uploadedKey: string | undefined;
    try {
      const part = await request.file({ limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
      if (!part || part.fieldname !== 'avatar') {
        return reply.status(400).send({ message: 'Please select a profile picture to upload.' });
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(part.mimetype)) {
        part.file.resume();
        return reply.status(415).send({ message: 'Please upload a JPG, PNG, or WEBP image.' });
      }
      let buffer: Buffer;
      try {
        buffer = await part.toBuffer();
      } catch (error) {
        part.file.resume();
        throw error;
      }
      const safeFilename = part.filename.replace(/[^a-zA-Z0-9._-]/g, '-');
      const uploaded = await storage.upload(
        buffer,
        `avatars/${userId}`,
        `${Date.now()}-${randomUUID()}-${safeFilename}`,
      );
      uploadedKey = uploaded.key;
      const publicUrl = new URL(
        uploaded.url,
        `${config.app.apiUrl.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '')}/`,
      ).toString();
      const profile = await UserService.uploadAvatar(userId, publicUrl);
      uploadedKey = undefined;
      return reply.send({
        data: { ...profile, avatarUrl: publicUrl },
        message: 'Avatar uploaded successfully',
      });
    } catch (error) {
      request.log.error(error, 'Profile avatar upload failed');
      if (uploadedKey) {
        try {
          await storage.delete(uploadedKey);
        } catch (cleanupError) {
          request.log.error(cleanupError, 'Failed to remove incomplete profile avatar upload');
        }
      }
      const isFileTooLarge = error instanceof Error && 'code' in error &&
        (error as NodeJS.ErrnoException).code === 'FST_REQ_FILE_TOO_LARGE';
      return reply.status(isFileTooLarge ? 413 : 500).send({
        message: isFileTooLarge
          ? 'Profile pictures must be 5MB or smaller.'
          : 'We could not upload your profile picture. Please try again.',
      });
    }
  });

  // GET /users/me
  app.get('/me', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' });
    try {
      const user = await UserService.getMe(userId);
      return reply.status(200).send({
        data: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          roles: user.roles,
          role: user.roles?.find((userRole: any) => userRole.role?.name)?.role?.name || 'BUYER',
          kycStatus: user.kycStatus,
          profile: user.profile,
          username: user.username,
          avatarUrl: user.avatarUrl,
          sellerStatus: user.sellerStatus,
        }
      });
    } catch (error: any) {
      request.log.error({ error, userId }, 'Current user lookup failed');
      const statusCode = error?.statusCode === 404 ? 404 : 503;
      return reply.status(statusCode).send({
        statusCode,
        error: statusCode === 404 ? 'Not Found' : 'Service Unavailable',
        message: statusCode === 404 ? 'User not found' : 'Unable to load the current user',
      });
    }
  });

  // PATCH /users/me
  app.patch('/me', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' });
    const profile = await UserService.updateProfile(userId, request.body as any);
    return reply.send({ data: profile, message: 'Profile updated successfully' });
  });

  // PATCH /users/me/password
  app.patch('/me/password', async (request, reply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' });
    try {
      const parsed = passwordChangeSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(422).send({ statusCode: 422, error: 'Validation Error', message: 'Password must be 8-128 characters.' });
      const { currentPassword, newPassword } = parsed.data;
      await UserService.changePassword(userId, currentPassword, newPassword);
      await createAuditLog({ actorId: userId, actorType: 'USER', action: 'user.password_changed', ipAddress: request.ip });
      return reply.send({ message: 'Password changed successfully. Please log in again.' });
    } catch (err: any) {
      return reply.status(err.statusCode || 400).send({ statusCode: err.statusCode || 400, error: 'Bad Request', message: err.message });
    }
  });
}
