import { Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { KycService } from '../services/kyc.service';

export const kycVerificationWorker = new Worker('KYC_VERIFICATION_QUEUE', async (job) => {
  await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
  await KycService.processRequest(String(job.data.requestId));
}, {
  connection: redis,
  concurrency: 1,
  lockDuration: 10 * 60 * 1000,
});
