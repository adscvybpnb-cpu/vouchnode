import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';

export class SystemSettingsService {
  static async getSetting(key: string, defaultValue: any) {
    const cacheKey = `setting:${key}`;
    if (redis.status === 'ready') {
      try {
        const cached = await Promise.race([
          redis.get(cacheKey),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
        ]);
        if (cached) return JSON.parse(cached);
      } catch (error) {
        logger.warn({ error, key }, 'Unable to read system setting cache; using database');
      }
    }

    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) return defaultValue;

    let value: any = setting.value;
    if (setting.type === 'NUMBER') value = Number(value);
    if (setting.type === 'BOOLEAN') value = value === 'true';
    if (setting.type === 'JSON') value = JSON.parse(value);

    if (redis.status === 'ready') {
      void redis.set(cacheKey, JSON.stringify(value), 'EX', 3600).catch((error) => {
        logger.warn({ error, key }, 'Unable to update system setting cache');
      });
    }
    return value;
  }

  static async invalidate(key?: string) {
    if (redis.status !== 'ready') return;
    try {
      if (key) {
        await redis.del(`setting:${key}`);
      } else {
        const keys = await redis.keys('setting:*');
        if (keys.length > 0) await redis.del(...keys);
      }
    } catch (error) {
      logger.warn({ error, key }, 'Unable to invalidate system setting cache');
    }
  }
}
