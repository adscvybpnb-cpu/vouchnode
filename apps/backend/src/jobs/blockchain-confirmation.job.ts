import { Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { BlockchainConfirmationService } from '../services/blockchain-confirmation.service';
import { OrderService } from '../services/order.service';
import { confirmationQueue } from './queue';
import { isAutomatedTokenNetwork } from '../config/blockchain';
import { DepositScannerService } from '../services/deposit-scanner.service';

const BATCH_SIZE = 100;

export const confirmationWorker = new Worker('CONFIRMATION_QUEUE', async (job) => {
  if (job.name === 'confirm-payment') {
    const data = job.data as {
      orderId: string;
      txHash: string;
      amount: number;
      asset: string;
      network: string;
      blockNumber: number;
      destination: string;
      expectedAmount: number;
      requiredConfirmations?: number;
    };
    if (!isAutomatedTokenNetwork(data.asset, data.network)) {
      throw new Error(`Only USDT/USDC token deposits are automated: ${data.asset}/${data.network}`);
    }
    const session = await prisma.depositSession.findFirst({
      where: { orderId: data.orderId, status: { in: ['PENDING', 'COMPLETED'] } },
      select: { assignedAddress: true, amount: true },
    });
    const destination = data.destination || session?.assignedAddress;
    if (!destination) throw new Error(`No deposit destination is associated with order ${data.orderId}`);
    const verified = await BlockchainConfirmationService.verifyTransaction({
      txHash: data.txHash,
      asset: data.asset,
      network: data.network,
      destination,
      expectedAmount: data.expectedAmount || Number(session?.amount ?? 0),
    });
    if (verified.blockNumber !== data.blockNumber) {
      throw new Error(`Transaction block changed for ${data.txHash}`);
    }
    const currentHeight = await BlockchainConfirmationService.currentHeight(data.network);
    const confirmations = Number(currentHeight - BigInt(data.blockNumber) + 1n);
    const required = data.requiredConfirmations ?? (data.network.toUpperCase() === 'SOLANA' ? 1 : 3);
    await prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({
        where: { orderId: data.orderId, status: 'PENDING' },
        data: {
          cryptoTxHash: data.txHash,
          confirmationBlock: BigInt(data.blockNumber),
          confirmationNetwork: data.network,
          confirmations: Math.max(0, confirmations),
          requiredConfirmations: required,
        },
      });
    });
    if (confirmations >= required) {
      console.info(JSON.stringify({
        event: 'blockchain.confirmations_reached',
        orderId: data.orderId,
        txHash: data.txHash,
        network: data.network,
        confirmations,
        requiredConfirmations: required,
      }));
      await OrderService.processPaymentConfirmed(data.orderId, data.txHash, data.amount);
    } else {
      await confirmationQueue.add('confirm-payment', data, {
        // A retry cannot reuse the currently active job ID; BullMQ deduplicates it.
        jobId: `confirm-payment-${data.network}-${data.txHash}-retry-${Date.now()}`,
        delay: 60_000,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 8,
        backoff: { type: 'exponential', delay: 5000 },
      });
    }
    return;
  }

  await DepositScannerService.scanPendingEvmDeposits();
  const candidates = await prisma.transaction.findMany({
    where: {
      status: 'PENDING',
      confirmationBlock: { not: null },
      cryptoTxHash: { not: null },
    },
    select: { orderId: true, cryptoTxHash: true, amount: true, currency: true, confirmationNetwork: true, confirmationBlock: true, requiredConfirmations: true },
    orderBy: { updatedAt: 'asc' },
    take: BATCH_SIZE,
  });
  for (const candidate of candidates) {
    if (!candidate.cryptoTxHash || !candidate.confirmationNetwork || candidate.confirmationBlock === null) continue;
    await confirmationQueue.add('confirm-payment', {
      orderId: candidate.orderId,
      txHash: candidate.cryptoTxHash,
      amount: Number(candidate.amount),
      asset: candidate.currency,
      network: candidate.confirmationNetwork,
      blockNumber: Number(candidate.confirmationBlock),
      destination: '',
      expectedAmount: 0,
      requiredConfirmations: candidate.requiredConfirmations,
    }, {
      jobId: `confirm-payment-${candidate.confirmationNetwork}-${candidate.cryptoTxHash}`,
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 8,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}, { connection: redis, concurrency: 10 });

confirmationWorker.on('completed', (job) => {
  console.info(JSON.stringify({
    event: 'blockchain.confirmation_job_completed',
    jobId: job.id,
    name: job.name,
  }));
});

confirmationWorker.on('failed', (job, error) => {
  console.error(JSON.stringify({
    event: 'blockchain.confirmation_job_failed',
    jobId: job?.id,
    name: job?.name,
    error: error.message,
    stack: error.stack,
  }));
});
