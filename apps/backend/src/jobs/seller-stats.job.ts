import { Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { SellerRepository } from '../repositories/seller.repository';

export const sellerStatsWorker = new Worker('SELLER_STATS_QUEUE', async job => {
  const { sellerId } = job.data;
  await SellerRepository.updateStats(sellerId);
}, { connection: redis });
