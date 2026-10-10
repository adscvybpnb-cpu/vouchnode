import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

const redisUrl = new URL(config.redis.url);

export const redis = new Redis({
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  password: redisUrl.password || undefined,
  family: 4,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: {
    rejectUnauthorized: false
  },
  retryStrategy: (attempt) => Math.min(attempt * 250, 5000),
  reconnectOnError: (error) => /READONLY|ECONNRESET|ETIMEDOUT/i.test(error.message),
});

let lastRedisErrorLog = 0;
redis.on('error', (err) => {
  const now = Date.now();
  if (now - lastRedisErrorLog < 30_000) return;
  lastRedisErrorLog = now;
  logger.warn({ error: err.message }, 'Redis unavailable; retrying connection');
});

redis.on('connect', () => {
  logger.info('Connected to Redis successfully');
});

redis.on('reconnecting', (delay: number) => {
  logger.info({ delay }, 'Redis reconnecting');
});
