import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { logger } from './lib/logger';
import { redis } from './lib/redis';
import { ZodError } from 'zod';
import jwt from 'jsonwebtoken';
import { FastifyRequest } from 'fastify';
import { UserRole } from '@vouchnode/shared';

// Route imports
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import productRoutes from './routes/product.routes';
import sellerRoutes from './routes/seller.routes';
import orderRoutes from './routes/order.routes';
import walletRoutes from './routes/wallet.routes';
import webhookRoutes from './routes/webhook.routes';
import telegramWebhookRoutes from './routes/telegram-webhook.routes';
import disputeRoutes from './routes/dispute.routes';
import messageRoutes from './routes/message.routes';
import notificationRoutes from './routes/notification.routes';
import pushRoutes from './routes/push.routes';
import reviewRoutes from './routes/review.routes';
import reportRoutes from './routes/report.routes';
import adminRoutes from './routes/admin.routes';
import configRoutes from './routes/config.routes';
import { PriceService } from './services/price.service';
import { PriceSyncService } from './services/price-sync.service';
import p2pRoutes from './routes/p2p.routes';
import p2pProfileRoutes from './routes/p2p-profile.routes';
import tradeRoutes from './routes/trade.routes';
import favoriteRoutes from './routes/favorite.routes';
import supportRoutes from './routes/support.routes';
import financeRoutes from './routes/finance.routes';

function getVerifiedRateLimitUser(request: FastifyRequest): { id: string; roles: string[] } | undefined {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return undefined;

  try {
    const payload = jwt.verify(authorization.slice(7), config.jwt.accessSecret);
    if (typeof payload !== 'object' || payload === null || typeof payload.id !== 'string') return undefined;
    return {
      id: payload.id,
      roles: Array.isArray(payload.roles)
        ? payload.roles.filter((role): role is string => typeof role === 'string')
        : [],
    };
  } catch {
    return undefined;
  }
}

export const buildApp = async () => {
  const app = fastify({
    logger,
    genReqId: () => uuidv4(),
    bodyLimit: 50 * 1024 * 1024
  });
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request: any, body: Buffer, done) => {
    request.rawBody = body.toString('utf8');
    try {
      done(null, JSON.parse(request.rawBody));
    } catch {
      done(new Error('Invalid JSON payload'));
    }
  });

  // Security headers
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: (origin, callback) => {
      // Admin HTTP requests may originate from either configured frontend
      // hostname during local development; credentials remain enabled.
      const allowedOrigins = new Set(config.app.env === 'production'
        ? [config.app.frontendUrl]
        : [config.app.frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000']);
      callback(null, !origin || allowedOrigins.has(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400
  });
  await app.register(cookie, {
    secret: config.jwt.refreshSecret
  });

  // File uploads
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 3, fields: 10 } // KYC files plus seller application fields
  });
  const localUploadRoot = config.storage.local.path;
  await app.register(fastifyStatic, {
    root: localUploadRoot,
    prefix: '/uploads/',
    setHeaders: (response) => {
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      response.setHeader('Access-Control-Allow-Origin', config.app.frontendUrl);
    }
  });

  // Global rate limiting must remain distributed; never silently fall back to process memory.
  const rateLimitConfig = {
    max: (request: FastifyRequest) => {
      const user = getVerifiedRateLimitUser(request);
      return user?.roles.includes(UserRole.SELLER)
        ? config.rateLimit.seller.max
        : config.rateLimit.global.max;
    },
    timeWindow: config.rateLimit.global.windowMs,
    standardHeaders: true,
    legacyHeaders: false,
    skipOnError: false,
    errorResponseBuilder: (_request: any, context: { after: string; max: number }) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Request limit reached. Please retry in ${context.after}.`,
      retryAfter: context.after,
      limit: context.max
    }),
    allowList: (request: any) => {
      const pathname = request.raw.url?.split('?')[0];
      return pathname === `/api/${config.app.version}/webhooks/alchemy-webhook`;
    },
    keyGenerator: (request: FastifyRequest) => {
      const user = getVerifiedRateLimitUser(request);
      return user ? `user:${user.id}` : `ip:${request.ip || 'unknown'}`;
    }
  } as const;

  try {
    await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Redis ping timed out')), 5000);
      })
    ]);
  } catch (error) {
    app.log.error({ error }, 'Redis is required for distributed rate limiting; refusing startup');
    throw new Error('Redis is unavailable; refusing to start without distributed rate limiting', { cause: error });
  }
  await app.register(rateLimit, {
    ...rateLimitConfig,
    redis: redis as any
  });
  app.log.info('Redis-backed rate limiting enabled');

  // Unified error handler
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(422).send({
        statusCode: 422,
        error: 'Validation Error',
        message: 'Request validation failed',
        details: error.errors.reduce((acc, e) => {
          const key = e.path.join('.');
          acc[key] = e.message;
          return acc;
        }, {} as Record<string, string>)
      });
    }

    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message
      });
    }

    request.log.error(error, 'Unhandled error');
    reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred'
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`
    });
  });

  const apiPrefix = `/api/${config.app.version}`;

  // Health check (unauthenticated)
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: config.app.version
  }));
  app.get('/api/prices', async (_request, reply) => {
    try {
      const prices = await PriceService.getUsdPrices();
      return reply.send({
        prices,
        cachedForSeconds: 60,
        snapshot: PriceSyncService.getSnapshotMetadata(),
      });
    } catch (error) {
      app.log.error(error, 'Unable to load live crypto prices');
      return reply.status(503).send({ statusCode: 503, error: 'Price Feed Unavailable', message: 'Live crypto prices are temporarily unavailable' });
    }
  });

  // All API routes
  await app.register(authRoutes,         { prefix: `${apiPrefix}/auth` });
  await app.register(userRoutes,         { prefix: `${apiPrefix}/users` });
  await app.register(productRoutes,      { prefix: `${apiPrefix}` });         // registers /products + /categories internally
  await app.register(sellerRoutes,       { prefix: `${apiPrefix}/sellers` });
  await app.register(orderRoutes,        { prefix: `${apiPrefix}/orders` });
  await app.register(walletRoutes,       { prefix: `${apiPrefix}/wallet` });
  await app.register(financeRoutes,      { prefix: `${apiPrefix}/finance` });
  await app.register(webhookRoutes,      { prefix: '/api/payments' });
  await app.register(p2pRoutes,          { prefix: `${apiPrefix}/p2p` });
  await app.register(p2pProfileRoutes,  { prefix: `${apiPrefix}/p2p` });
  await app.register(tradeRoutes,        { prefix: `${apiPrefix}/trades` });
  await app.register(favoriteRoutes,     { prefix: `${apiPrefix}` });
  await app.register(supportRoutes,      { prefix: `${apiPrefix}/support` });
  await app.register(webhookRoutes,      { prefix: `${apiPrefix}/webhooks` });
  await app.register(telegramWebhookRoutes);
  await app.register(disputeRoutes,      { prefix: `${apiPrefix}/disputes` });
  await app.register(messageRoutes,      { prefix: `${apiPrefix}/messages` });
  await app.register(notificationRoutes, { prefix: `${apiPrefix}/notifications` });
  await app.register(pushRoutes,         { prefix: `${apiPrefix}/push` });
  await app.register(reviewRoutes,       { prefix: `${apiPrefix}/reviews` });
  await app.register(reportRoutes,       { prefix: `${apiPrefix}/reports` });
  await app.register(adminRoutes,        { prefix: `${apiPrefix}/admin` });
  await app.register(configRoutes,        { prefix: `${apiPrefix}` });

  return app;
};
