import { Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { FraudEngine } from '../fraud/fraud.engine';

export const fraudWorker = new Worker('FRAUD_CHECK_QUEUE', async job => {
  const { type, data } = job.data;
  if (type === 'EVALUATE_LOGIN') {
    await FraudEngine.evaluateLogin(data.userId, data.ipAddress, data.userAgent);
  } else if (type === 'EVALUATE_TRANSACTION') {
    await FraudEngine.evaluateTransaction(data.userId, data.amount, data.currency);
  }
}, { connection: redis });
