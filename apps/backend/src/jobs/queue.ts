import { Queue, type JobsOptions } from 'bullmq';
import { redis } from '../lib/redis';

export const JOB_RETENTION = {
  completed: { age: 30 * 60, count: 5 },
  failed: { age: 60 * 60, count: 10 },
} as const;

const defaultJobOptions: JobsOptions = {
  removeOnComplete: { ...JOB_RETENTION.completed },
  removeOnFail: { ...JOB_RETENTION.failed },
};

function createQueue(name: string) {
  return new Queue(name, {
    connection: redis,
    defaultJobOptions: {
      ...defaultJobOptions,
      removeOnComplete: { ...JOB_RETENTION.completed },
      removeOnFail: { ...JOB_RETENTION.failed },
    },
  });
}

export const disputeTimerQueue = createQueue('DISPUTE_TIMER_QUEUE');
export const buyerConfirmationQueue = createQueue('BUYER_CONFIRMATION_QUEUE');
export const orderExpiryQueue = createQueue('ORDER_EXPIRY_QUEUE');
export const notificationQueue = createQueue('NOTIFICATION_QUEUE');
export const fraudCheckQueue = createQueue('FRAUD_CHECK_QUEUE');
export const sellerStatsQueue = createQueue('SELLER_STATS_QUEUE');
export const withdrawalQueue = createQueue('WITHDRAWAL_QUEUE');
export const escrowReleaseQueue = createQueue('ESCROW_RELEASE_QUEUE');
export const swapQueue = createQueue('SWAP_QUEUE');
export const kycVerificationQueue = createQueue('KYC_VERIFICATION_QUEUE');
export const expirationQueue = createQueue('EXPIRATION_QUEUE');
export const confirmationQueue = createQueue('CONFIRMATION_QUEUE');
export const blockchainSettlementQueue = createQueue('BLOCKCHAIN_SETTLEMENT_QUEUE');

export async function scheduleDisputeTimer(disputeId: string, delayMs: number) {
  return disputeTimerQueue.add('timeout', { disputeId }, { delay: delayMs, jobId: `dispute-${disputeId}` });
}

export async function scheduleOrderExpiry(orderId: string, delayMs: number) {
  return orderExpiryQueue.add('expire', { orderId }, { delay: delayMs, jobId: `order-expire-${orderId}` });
}

export async function scheduleBuyerConfirmation(orderId: string, delayMs: number) {
  return buyerConfirmationQueue.add('confirm', { orderId }, { delay: delayMs, jobId: `buyer-confirm-${orderId}` });
}

export async function scheduleEscrowRelease(transactionId: string, delayMs: number) {
  return escrowReleaseQueue.add('release', { transactionId }, { delay: delayMs, jobId: `escrow-release-${transactionId}` });
}

export async function scheduleSwap(swapId: string, delayMs = 60_000) {
  return swapQueue.add('complete', { swapId }, { delay: delayMs, jobId: `swap-${swapId}` });
}

export async function scheduleKycVerification(requestId: string, delayMs = 0) {
  return kycVerificationQueue.add('verify', { requestId }, {
    delay: delayMs,
    jobId: `kyc-verify-${requestId}`,
  });
}

export async function scheduleConfirmation(data: {
  orderId: string;
  txHash: string;
  amount: number;
  asset: string;
  network: string;
  blockNumber: number;
  destination: string;
  expectedAmount: number;
  requiredConfirmations?: number;
}) {
  return confirmationQueue.add('confirm-payment', data, {
    jobId: `confirm-payment-${data.network}-${data.txHash}`,
    attempts: 8,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

export async function scheduleBlockchainSettlement(depositId: string) {
  return blockchainSettlementQueue.add('settle-detected-deposit', { depositId }, {
    jobId: `settle-detected-deposit-${depositId}`,
    attempts: 8,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

export async function scheduleNotificationDelivery(notificationId: string, sendEmail: boolean) {
  return notificationQueue.add('deliver', { notificationId, sendEmail }, {
    jobId: `notification-delivery-${notificationId}`,
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

export async function cancelJob(queue: Queue, jobId: string) {
  const job = await queue.getJob(jobId);
  if (job) await job.remove();
}

export function initializeQueues() {
  void expirationQueue.add('expire-due-records', {}, {
    jobId: 'expire-due-records-repeat',
    repeat: { every: 60_000 },
  });
  void confirmationQueue.add('reconcile-confirmations', {}, {
    jobId: 'reconcile-confirmations-repeat',
    repeat: { every: 35_000 },
  });
}
