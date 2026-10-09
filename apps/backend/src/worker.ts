import { initializeQueues } from './jobs/queue';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import './jobs/order.job';
import './jobs/dispute.job';
import './jobs/kyc.job';
import './jobs/blockchain-confirmation.job';
import './jobs/expiration.job';
import './jobs/notification.job';
import { BlockchainObservationWorker } from './services/blockchain-observation-worker';
import { BlockchainSettlementWorker } from './services/blockchain-settlement-worker';
import { validateRpcNodes } from './config/rpc-health';
import { startRpcEndpointEnvWatcher } from './config/rpc-endpoint-pools';

let blockchainObservationWorker: BlockchainObservationWorker | undefined;
let blockchainSettlementWorker: BlockchainSettlementWorker | undefined;
let stopRpcEndpointEnvWatcher: (() => void) | undefined;

void (async () => {
  await validateRpcNodes();
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
  initializeQueues();
  blockchainObservationWorker = new BlockchainObservationWorker();
  blockchainSettlementWorker = new BlockchainSettlementWorker();
  await blockchainObservationWorker.start();
  await blockchainSettlementWorker.start();
})().catch((error) => {
  console.error('Failed to start blockchain workers:', error);
  process.exitCode = 1;
});

const shutdown = async () => {
  stopRpcEndpointEnvWatcher?.();
  blockchainObservationWorker?.stop();
  blockchainSettlementWorker?.stop();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
