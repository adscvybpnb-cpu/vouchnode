import { prisma } from '../src/lib/prisma';
import { BlockchainConfirmationService } from '../src/services/blockchain-confirmation.service';
import { DepositScannerService } from '../src/services/deposit-scanner.service';
import { OrderService } from '../src/services/order.service';
import { redis } from '../src/lib/redis';

const lookback = Number(process.argv.find((arg) => arg.startsWith('--lookback='))?.split('=')[1] ?? 500);
if (!Number.isInteger(lookback) || lookback <= 0) {
  throw new Error('--lookback must be a positive integer');
}

const requiredConfirmations = 3;

async function reconcilePendingOrderPayments() {
  const candidates = await prisma.transaction.findMany({
    where: {
      status: 'PENDING',
      cryptoTxHash: { not: null },
      confirmationBlock: { not: null },
      confirmationNetwork: { not: null },
    },
    select: {
      orderId: true,
      cryptoTxHash: true,
      amount: true,
      currency: true,
      confirmationNetwork: true,
      confirmationBlock: true,
      requiredConfirmations: true,
    },
    orderBy: { updatedAt: 'asc' },
  });

  let settled = 0;
  let waiting = 0;
  let rejected = 0;

  for (const candidate of candidates) {
    if (!candidate.cryptoTxHash || !candidate.confirmationNetwork || candidate.confirmationBlock === null) {
      continue;
    }

    try {
      const session = await prisma.depositSession.findUnique({
        where: { orderId: candidate.orderId },
        select: { assignedAddress: true, amount: true, status: true },
      });
      if (!session || !['PENDING', 'COMPLETED'].includes(session.status)) {
        rejected += 1;
        console.info(JSON.stringify({
          event: 'deposit_reconciliation_rejected',
          orderId: candidate.orderId,
          reason: 'active deposit session not found',
        }));
        continue;
      }

      const verified = await BlockchainConfirmationService.verifyTransaction({
        txHash: candidate.cryptoTxHash,
        asset: candidate.currency,
        network: candidate.confirmationNetwork,
        destination: session.assignedAddress,
        expectedAmount: Number(session.amount),
      });
      if (verified.blockNumber !== Number(candidate.confirmationBlock)) {
        throw new Error('receipt block changed');
      }

      const currentHeight = await BlockchainConfirmationService.currentHeight(candidate.confirmationNetwork);
      const confirmations = Number(currentHeight - candidate.confirmationBlock + 1n);
      const required = candidate.requiredConfirmations || requiredConfirmations;

      await prisma.transaction.updateMany({
        where: { orderId: candidate.orderId, status: 'PENDING' },
        data: { confirmations, requiredConfirmations: required },
      });

      if (confirmations < required) {
        waiting += 1;
        console.info(JSON.stringify({
          event: 'deposit_reconciliation_waiting',
          orderId: candidate.orderId,
          txHash: candidate.cryptoTxHash,
          network: candidate.confirmationNetwork,
          confirmations,
          requiredConfirmations: required,
        }));
        continue;
      }

      await OrderService.processPaymentConfirmed(candidate.orderId, candidate.cryptoTxHash, Number(candidate.amount));
      settled += 1;
      console.info(JSON.stringify({
        event: 'deposit_reconciliation_settled',
        orderId: candidate.orderId,
        txHash: candidate.cryptoTxHash,
        confirmations,
        requiredConfirmations: required,
      }));
    } catch (error) {
      rejected += 1;
      console.error(JSON.stringify({
        event: 'deposit_reconciliation_rejected',
        orderId: candidate.orderId,
        txHash: candidate.cryptoTxHash,
        reason: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return { settled, waiting, rejected };
}

async function main() {
  const activeSessions = await prisma.depositSession.findMany({
    where: {
      status: 'PENDING',
      transactionHash: null,
      expiresAt: { gt: new Date() },
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
    select: { id: true, userId: true, orderId: true, currency: true, network: true, amount: true, assignedAddress: true, transactionHash: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.info(JSON.stringify({
    event: 'deposit_reconciliation_candidates',
    count: activeSessions.length,
    sessions: activeSessions.map((session) => ({
      id: session.id,
      userId: session.userId,
      orderId: session.orderId,
      currency: session.currency,
      network: session.network,
      amount: session.amount.toString(),
      assignedAddress: session.assignedAddress,
      transactionHash: session.transactionHash,
      createdAt: session.createdAt.toISOString(),
    })),
  }));

  console.info(JSON.stringify({
    event: 'deposit_reconciliation_started',
    lookback,
    requiredConfirmations,
  }));

  let discovered = 0;
  try {
    discovered = await DepositScannerService.scanPendingEvmDeposits({ blockLookback: lookback });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'deposit_reconciliation_scan_failed',
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  const orders = await reconcilePendingOrderPayments();
  const pendingDetails = await prisma.depositSession.findMany({
    where: { status: 'PENDING' },
    select: {
      id: true,
      orderId: true,
      currency: true,
      network: true,
      amount: true,
      transactionHash: true,
      order: {
        select: {
          status: true,
          transaction: { select: { status: true, cryptoTxHash: true, confirmations: true, requiredConfirmations: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  const remainingPending = await prisma.depositSession.count({ where: { status: 'PENDING' } });

  console.info(JSON.stringify({
    event: 'deposit_reconciliation_completed',
    discovered,
    ...orders,
    remainingPending,
    pendingDetails: pendingDetails.map((session) => ({
      ...session,
      amount: session.amount.toString(),
    })),
  }));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      event: 'deposit_reconciliation_failed',
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });
