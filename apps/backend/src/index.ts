import { buildApp } from './app';
import { config } from './config';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { schedulePresenceExpiry, setupSocketServer } from './websocket/socket.server';
import { P2POrderService } from './services/p2p-order.service';
import { PriceSyncService } from './services/price-sync.service';
import { startRpcRefreshScheduler, validateRpcNodes } from './config/rpc-health';
import { startRpcEndpointEnvWatcher } from './config/rpc-endpoint-pools';
import { BlockchainObservationWorker } from './services/blockchain-observation-worker';
import { BlockchainSettlementWorker } from './services/blockchain-settlement-worker';
import { initializeQueues } from './jobs/queue';
import { TelegramBotService } from './integrations/telegram/telegram.bot';

let blockchainObservationWorker: BlockchainObservationWorker | undefined;
let blockchainSettlementWorker: BlockchainSettlementWorker | undefined;
let stopRpcRefreshScheduler: (() => void) | undefined;
let stopRpcEndpointEnvWatcher: (() => void) | undefined;
let stopPricePolling: (() => void) | undefined;

const connectToDatabase = async () => {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      await prisma.$connect();
      console.log('PostgreSQL connection established');
      return;
    } catch (error) {
      if (attempt === 60) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`PostgreSQL connection failed after 60 attempts: ${message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
};

const start = async () => {
  try {
    await validateRpcNodes();
    stopRpcRefreshScheduler = startRpcRefreshScheduler();
    stopRpcEndpointEnvWatcher = startRpcEndpointEnvWatcher((networks) => {
      console.info(JSON.stringify({ event: 'rpc_endpoint_env_changed', networks }));
      void validateRpcNodes().catch((error) => {
        console.error(JSON.stringify({
          event: 'rpc_endpoint_env_validation_failed',
          networks,
          error: error instanceof Error ? error.message : String(error),
        }));
      });
    });
    await connectToDatabase();
    if (config.telegram.botToken) await TelegramBotService.start();
    stopPricePolling = PriceSyncService.startPolling();
    const app = await buildApp();
    await setupSocketServer(app.server);
    await app.listen({ port: Number(process.env.PORT) || 10000, host: '0.0.0.0' });
    app.log.info(`VouchNode API running on ${config.app.host}:${config.app.port}`);
    if (config.app.env !== 'production') {
      await Promise.all([
        import('./jobs/order.job.js'),
        import('./jobs/dispute.job.js'),
        import('./jobs/kyc.job.js'),
        import('./jobs/blockchain-confirmation.job.js'),
        import('./jobs/expiration.job.js'),
        import('./jobs/notification.job.js'),
      ]);
      initializeQueues();
      blockchainObservationWorker = new BlockchainObservationWorker();
      blockchainSettlementWorker = new BlockchainSettlementWorker();
      await blockchainObservationWorker.start();
      await blockchainSettlementWorker.start();
      app.log.info('Development blockchain observation and settlement workers started');
    }
    const pendingUnpaidCount = await P2POrderService.schedulePendingUnpaidExpiries();
    const pendingDisputeCount = await P2POrderService.schedulePendingDisputeExpiries();
    app.log.info({ pendingUnpaidCount, pendingDisputeCount }, 'P2P expiry jobs scheduled');

    const timedPresenceUsers = await prisma.user.findMany({
      where: { isOnline: true, onlineUntil: { gt: new Date() } },
      select: { id: true, onlineUntil: true },
    });
    for (const user of timedPresenceUsers) schedulePresenceExpiry(user.id, user.onlineUntil);
  } catch (error) {
    console.error('Failed to start server:', error);
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(1);
  }
};

const shutdown = async () => {
  TelegramBotService.stop();
  stopRpcRefreshScheduler?.();
  stopRpcEndpointEnvWatcher?.();
  stopPricePolling?.();
  blockchainObservationWorker?.stop();
  blockchainSettlementWorker?.stop();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
void start();
