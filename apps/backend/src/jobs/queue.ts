import { Queue } from 'bullmq';
import { redis } from '../lib/redis';

export const disputeTimerQueue = new Queue('DISPUTE_TIMER_QUEUE', { connection: redis });
export const buyerConfirmationQueue = new Queue('BUYER_CONFIRMATION_QUEUE', { connection: redis });
export const orderExpiryQueue = new Queue('ORDER_EXPIRY_QUEUE', { connection: redis });
export const notificationQueue = new Queue('NOTIFICATION_QUEUE', { connection: redis });
export const fraudCheckQueue = new Queue('FRAUD_CHECK_QUEUE', { connection: redis });
export const sellerStatsQueue = new Queue('SELLER_STATS_QUEUE', { connection: redis });
export const withdrawalQueue = new Queue('WITHDRAWAL_QUEUE', { connection: redis });
export const escrowReleaseQueue = new Queue('ESCROW_RELEASE_QUEUE', { connection: redis });
export const swapQueue = new Queue('SWAP_QUEUE', { connection: redis });
export const kycVerificationQueue = new Queue('KYC_VERIFICATION_QUEUE', { connection: redis });
export const expirationQueue = new Queue('EXPIRATION_QUEUE', { connection: redis });
export const confirmationQueue = new Queue('CONFIRMATION_QUEUE', { connection: redis });
export const blockchainSettlementQueue = new Queue('BLOCKCHAIN_SETTLEMENT_QUEUE', { connection: redis });

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
    removeOnComplete: true,
    removeOnFail: false,
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
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 8,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

export async function scheduleBlockchainSettlement(depositId: string) {
  return blockchainSettlementQueue.add('settle-detected-deposit', { depositId }, {
    jobId: `settle-detected-deposit-${depositId}`,
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 8,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

export async function scheduleNotificationDelivery(notificationId: string, sendEmail: boolean) {
  return notificationQueue.add('deliver', { notificationId, sendEmail }, {
    jobId: `notification-delivery-${notificationId}`,
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
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
    removeOnComplete: true,
    removeOnFail: false,
  });
  void confirmationQueue.add('reconcile-confirmations', {}, {
    jobId: 'reconcile-confirmations-repeat',
    repeat: { every: 35_000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
}
