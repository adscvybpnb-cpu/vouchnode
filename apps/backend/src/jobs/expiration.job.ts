import { Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { DepositScannerService } from '../services/deposit-scanner.service';
import { OrderService } from '../services/order.service';
import { TradeService } from '../services/trade.service';

export const expirationWorker = new Worker('EXPIRATION_QUEUE', async () => {
  await DepositScannerService.scanPendingSessions({ batchSize: 100 });
  await OrderService.completeExpiredBuyerConfirmations(new Date(), 100);
  await OrderService.completeExpiredDisputeResponses(new Date(), 100);
  await OrderService.completeExpiredBuyerDisputeResponses(new Date(), 100);
  await TradeService.completeExpiredTrades(new Date(), 100);
}, { connection: redis, concurrency: 1 });
