import { PrismaClient } from '@prisma/client';
import { config } from '../config';

const databaseUrl = new URL(config.db.url);
databaseUrl.searchParams.set('connection_limit', String(config.db.connectionLimit));
databaseUrl.searchParams.set('pool_timeout', String(config.db.poolTimeout));
databaseUrl.searchParams.set('connect_timeout', String(config.db.connectTimeout));

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    datasourceUrl: databaseUrl.toString(),
    log: config.app.env === 'development' ? ['error', 'warn'] : ['error'],
  });

if (config.app.env !== 'production') global.prisma = prisma;
