import { randomUUID } from 'node:crypto';
import { DepositSessionNetwork, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { NotificationService } from './notification.service';
import { WalletRepository } from '../repositories/wallet.repository';
import { BlockchainAdapter } from './blockchain-adapter';
import { createBlockchainAdapters } from './native-blockchain-adapters';
import { PushNotificationService } from './push-notification.service';
import { Worker as BullWorker } from 'bullmq';
import { redis } from '../lib/redis';
import { blockchainSettlementQueue } from '../jobs/queue';
import { OrderService } from './order.service';
import { emitMarketplaceOrderEvent } from '../websocket/socket.server';
import { amountMatchesTolerance } from '../utils/crypto-amount';
import { RpcPoolExhaustedError } from './rpc-endpoint-pool';

const MIN_INTERVAL_MS = 30_000;
const INTERVAL_RANGE_MS = 10_000;
const BATCH_SIZE = 100;
const MAX_CONFIRMATION_RETRIES = 3;
const STALE_SETTLEMENT_MS = 10 * 60 * 1000;

type Candidate = {
  id: string;
  network: DepositSessionNetwork;
  blockNumber: bigint | null;
  slot: bigint | null;
  requiredConfirmations: number;
  status: string;
};

export class BlockchainSettlementWorker {
  private readonly owner = randomUUID();
  private readonly adaptersByNetwork: ReadonlyMap<DepositSessionNetwork, BlockchainAdapter>;
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = false;
  private readonly queueWorker: BullWorker<{ depositId: string }>;

  constructor(adapters: BlockchainAdapter[] = createBlockchainAdapters()) {
    this.adaptersByNetwork = new Map(adapters.map((adapter) => [adapter.network, adapter]));
    this.queueWorker = new BullWorker(
      blockchainSettlementQueue.name,
      async (job) => {
        await this.processDepositById(job.data.depositId);
      },
      { connection: redis, concurrency: 1 },
    );
    this.queueWorker.on('failed', (job, error) => {
      logger.error({ depositId: job?.data.depositId, error: error.message }, 'Blockchain settlement queue job failed');
    });
  }

  async start() {
    await this.runOnce();
    this.scheduleNextCycle();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    void this.queueWorker.close();
  }

  private scheduleNextCycle() {
    if (this.stopped) return;
    const delayMs = MIN_INTERVAL_MS + Math.floor(Math.random() * INTERVAL_RANGE_MS);
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch((error) => logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Unexpected blockchain settlement cycle failure',
        ))
        .finally(() => this.scheduleNextCycle());
    }, delayMs);
    this.timer.unref();
  }

  private async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      const staleBefore = new Date(Date.now() - STALE_SETTLEMENT_MS);
      const recovered = await prisma.detectedDeposit.updateMany({
        where: { status: 'SETTLING', updatedAt: { lt: staleBefore } },
        data: { status: 'CONFIRMED', lastCheckedAt: new Date() },
      });
      if (recovered.count > 0) {
        logger.warn({ deposits: recovered.count }, 'Recovered stale blockchain settlement claims for retry');
      }
      await this.reconcileManualReviewOrders();
      const candidates = await prisma.detectedDeposit.findMany({
        where: { status: { in: ['DETECTED', 'CONFIRMING', 'CONFIRMED'] } },
        orderBy: { detectedAt: 'asc' },
        take: BATCH_SIZE,
        select: {
          id: true,
          network: true,
          blockNumber: true,
          slot: true,
          requiredConfirmations: true,
          status: true,
        },
      });

      for (const candidate of candidates) {
        try {
          await this.processCandidate(candidate);
        } catch (error) {
          const isRpcExhaustion = error instanceof RpcPoolExhaustedError;
          const logContext = {
            worker: this.owner,
            depositId: candidate.id,
            error: error instanceof Error ? error.message : String(error),
          };
          if (isRpcExhaustion) {
            logger.warn(logContext, 'RPC pool temporarily unavailable for deposit; it will be retried');
          } else {
            logger.error(logContext, 'Unable to process blockchain deposit; it will be retried');
          }
        }
      }
    } catch (error) {
      logger.error(
        { worker: this.owner, error: error instanceof Error ? error.message : String(error) },
        'Blockchain settlement cycle failed',
      );
    } finally {
      this.running = false;
    }
  }

  private async reconcileManualReviewOrders() {
    const deposits = await prisma.detectedDeposit.findMany({
      where: {
        status: 'MANUAL_REVIEW',
        depositSession: { is: { orderId: { not: null } } },
      },
      orderBy: { detectedAt: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        asset: true,
        network: true,
        transactionHash: true,
        depositSession: {
          select: {
            id: true,
            orderId: true,
            order: { select: { status: true } },
          },
        },
      },
    });

    for (const deposit of deposits) {
      const { depositSession } = deposit;
      const orderId = depositSession?.orderId;
      if (!orderId || depositSession?.order?.status !== 'PAYMENT_PENDING') continue;
      try {
        const flagged = await prisma.$transaction((tx) =>
          OrderService.flagDepositForManualReviewInTransaction(tx, {
            orderId,
            sessionId: depositSession.id,
            txHash: deposit.transactionHash,
            asset: deposit.asset,
            network: deposit.network,
            reason: 'Detected deposit requires manual verification',
          }),
        );
        if (flagged) {
          emitMarketplaceOrderEvent(orderId, 'order_updated', {
            orderId,
            status: 'PENDING_MANUAL_REVIEW',
            paymentStatus: 'PENDING',
            reason: 'DEPOSIT_REQUIRES_MANUAL_REVIEW',
          });
        }
      } catch (error) {
        logger.error(
          { depositId: deposit.id, orderId, error: error instanceof Error ? error.message : String(error) },
          'Unable to move order with a manual-review deposit into review state',
        );
      }
    }
  }

  private async processCandidate(candidate: Candidate) {
    try {
      if (candidate.status === 'CONFIRMED') {
        await this.settle(candidate.id);
        return;
      }
      const adapter = this.adaptersByNetwork.get(candidate.network);
      if (!adapter) throw new Error(`No blockchain adapter configured for ${candidate.network}`);

      const tip = await adapter.getTip();
      const safeTip = await adapter.getSafeTip();
      const height = candidate.blockNumber ?? candidate.slot;
      if (height === null) {
        throw new Error('Detected deposit has no block number or slot');
      }

      const confirmations = tip >= height ? Number(tip - height + 1n) : 0;
      const hasFinality = safeTip >= height;
      const isConfirmed = confirmations >= candidate.requiredConfirmations && hasFinality;

      await prisma.detectedDeposit.updateMany({
        where: { id: candidate.id, status: { in: ['DETECTED', 'CONFIRMING'] } },
        data: {
          status: isConfirmed ? 'CONFIRMED' : 'CONFIRMING',
          confirmations,
          lastCheckedAt: new Date(),
          lastError: null,
          confirmedAt: isConfirmed ? new Date() : undefined,
        },
      });

      if (!isConfirmed) return;
      await this.settle(candidate.id);
    } catch (error) {
      await this.recordFailure(candidate.id, error instanceof Error ? error.message : String(error));
      logger.error(
        { worker: this.owner, depositId: candidate.id, network: candidate.network, error: error instanceof Error ? error.message : String(error) },
        'Blockchain deposit confirmation failed',
      );
      throw error;
    }
  }

  private async processDepositById(depositId: string) {
    const candidate = await prisma.detectedDeposit.findUnique({
      where: { id: depositId },
      select: { id: true, network: true, blockNumber: true, slot: true, requiredConfirmations: true, status: true },
    });
    if (!candidate || !['DETECTED', 'CONFIRMING', 'CONFIRMED'].includes(candidate.status)) return;
    await this.processCandidate(candidate);
  }

  private async settle(depositId: string) {
    for (let attempt = 1; attempt <= MAX_CONFIRMATION_RETRIES; attempt += 1) {
      try {
        const orderSettlement = await prisma.detectedDeposit.findUnique({
          where: { id: depositId },
          select: {
            id: true,
            status: true,
            transactionHash: true,
            amount: true,
            depositSession: {
              select: {
                id: true,
                orderId: true,
                status: true,
                assignedAddress: true,
                network: true,
                currency: true,
                amount: true,
              },
            },
          },
        });
        if (orderSettlement?.depositSession?.orderId) {
          await this.settleOrderDeposit(orderSettlement);
          return;
        }

        const notification = await prisma.$transaction(async (tx) => {
          const claimed = await tx.detectedDeposit.updateMany({
            where: { id: depositId, status: 'CONFIRMED' },
            data: { status: 'SETTLING', lastError: null },
          });
          if (claimed.count !== 1) return null;

          const detected = await tx.detectedDeposit.findUniqueOrThrow({ where: { id: depositId } });
          if (!detected.depositSessionId) {
            throw new Error(`Detected deposit ${depositId} is not linked to a deposit session`);
          }

          const session = await tx.depositSession.findUnique({ where: { id: detected.depositSessionId } });
          if (!session) throw new Error(`Deposit session ${detected.depositSessionId} was not found`);
          if (session.status !== 'PENDING') {
            throw new Error(`Deposit session ${session.id} is ${session.status}, not PENDING`);
          }

          const wallet = await tx.wallet.upsert({
            where: { userId_currency: { userId: session.userId, currency: session.currency } },
            update: {},
            create: { userId: session.userId, currency: session.currency, walletType: 'INTERNAL' },
          });
          const now = new Date();
          const amount = detected.amount;

          await tx.depositSession.update({
            where: { id: session.id },
            data: {
              status: 'COMPLETED',
              amount,
              transactionHash: detected.transactionHash,
              completedAt: now,
            },
          });
          await tx.cryptoDeposit.updateMany({
            where: { address: session.assignedAddress, network: session.network, status: 'PENDING' },
            data: { status: 'SUCCESS' },
          });
          await tx.staticAddressPool.updateMany({
            where: { address: session.assignedAddress, status: 'BUSY' },
            data: { status: 'AVAILABLE', orderId: null, expiresAt: null },
          });
          await WalletRepository.addToAvailable(tx, wallet.id, amount, session.currency);

          const pendingLedger = await tx.ledgerEntry.updateMany({
            where: { referenceId: session.id, walletId: wallet.id, type: 'DEPOSIT', status: 'PENDING' },
            data: {
              amount,
              status: 'COMPLETED',
              completedAt: now,
              description: `Confirmed ${session.network} deposit (${detected.transactionHash})`,
            },
          });
          if (pendingLedger.count === 0) {
            await WalletRepository.createLedgerEntry(tx, {
              walletId: wallet.id,
              type: 'DEPOSIT',
              amount,
              currency: session.currency,
              direction: 'CREDIT',
              status: 'COMPLETED',
              referenceId: session.id,
              description: `Confirmed ${session.network} deposit (${detected.transactionHash})`,
              completedAt: now,
            });
          }

          await tx.detectedDeposit.update({
            where: { id: detected.id },
            data: { status: 'SETTLED', walletId: wallet.id, settledAt: now, lastCheckedAt: now },
          });
          return { userId: session.userId, amount: amount.toString(), currency: session.currency };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        if (notification) {
          try {
            await NotificationService.createNotification({
              userId: notification.userId,
              type: 'DEPOSIT_CONFIRMED',
              title: 'Deposit Credited',
              message: `Your automated deposit of ${notification.amount} ${notification.currency} has been successfully processed.`,
              data: { depositId, amount: notification.amount, currency: notification.currency },
              link: '/dashboard/wallet',
            });
          } catch (error) {
            logger.warn(
              { depositId, error: error instanceof Error ? error.message : String(error) },
              'Deposit settled but confirmation notification failed',
            );
          }
          try {
            await PushNotificationService.sendToUser(notification.userId, {
              title: 'Deposit credited',
              message: 'YOUR AUTOMATED DEPOSIT HAS BEEN SUCCESSFULLY PROCESSED.',
              link: '/dashboard/wallet',
              data: { depositId, currency: notification.currency, amount: notification.amount },
            });
          } catch (error) {
            logger.warn(
              { depositId, error: error instanceof Error ? error.message : String(error) },
              'Deposit settled but push notification failed',
            );
          }
        }

        return;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < MAX_CONFIRMATION_RETRIES) {
          continue;
        }
        throw error;
      }
    }
  }

  private async settleOrderDeposit(settlement: {
    id: string;
    status: string;
    transactionHash: string;
    amount: Prisma.Decimal;
    depositSession: {
      id: string;
      orderId: string | null;
      status: string;
      assignedAddress: string;
      network: DepositSessionNetwork;
      currency: string;
      amount: Prisma.Decimal;
    } | null;
    }) {
      const session = settlement.depositSession;
      if (session?.orderId && !amountMatchesTolerance(settlement.amount, session.amount, session.currency, session.network)) {
        const flagged = await prisma.$transaction(async (tx) => {
          const claim = await tx.detectedDeposit.updateMany({
            where: { id: settlement.id, status: 'CONFIRMED' },
            data: {
              status: 'MANUAL_REVIEW',
              lastCheckedAt: new Date(),
              lastError: `Deposit amount ${settlement.amount.toString()} does not match expected ${session.amount.toString()}`,
            },
          });
          if (claim.count !== 1) return false;
          return OrderService.flagDepositForManualReviewInTransaction(tx, {
            orderId: session.orderId!,
            sessionId: session.id,
            txHash: settlement.transactionHash,
            asset: session.currency,
            network: session.network,
            reason: 'Detected deposit amount differs from the invoice amount',
          });
        });
        if (flagged && session.orderId) {
          emitMarketplaceOrderEvent(session.orderId, 'order_updated', {
            orderId: session.orderId,
            status: 'PENDING_MANUAL_REVIEW',
            paymentStatus: 'PENDING',
            reason: 'DEPOSIT_AMOUNT_REQUIRES_REVIEW',
          });
        }
        return;
      }

      const claimed = await prisma.detectedDeposit.updateMany({
      where: { id: settlement.id, status: 'CONFIRMED' },
      data: { status: 'SETTLING', lastError: null },
    });
    if (claimed.count !== 1) return;

    try {
      if (!settlement.depositSession?.orderId) {
        throw new Error(`Order-linked settlement ${settlement.id} has no order ID`);
      }
      await OrderService.processPaymentConfirmed(
        settlement.depositSession.orderId,
        settlement.transactionHash,
        Number(settlement.amount),
      );
      await prisma.$transaction(async (tx) => {
        const session = await tx.depositSession.findUniqueOrThrow({
          where: { id: settlement.depositSession!.id },
        });
        if (!['PENDING', 'COMPLETED'].includes(session.status)) {
          throw new Error(`Order payment session ${session.id} is ${session.status}`);
        }
        const now = new Date();
        await tx.depositSession.update({
          where: { id: session.id },
          data: {
            status: 'COMPLETED',
            amount: settlement.amount,
            transactionHash: settlement.transactionHash,
            completedAt: session.completedAt ?? now,
          },
        });
        await tx.cryptoDeposit.updateMany({
          where: { address: session.assignedAddress, network: session.network, status: 'PENDING' },
          data: { status: 'SUCCESS' },
        });
        await tx.staticAddressPool.updateMany({
          where: { address: session.assignedAddress, status: 'BUSY' },
          data: { status: 'AVAILABLE', orderId: null, expiresAt: null },
        });
        await tx.detectedDeposit.update({
          where: { id: settlement.id },
          data: { status: 'SETTLED', settledAt: now, lastCheckedAt: now },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      await prisma.detectedDeposit.updateMany({
        where: { id: settlement.id, status: 'SETTLING' },
        data: {
          status: 'CONFIRMED',
          lastCheckedAt: new Date(),
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  private async recordFailure(depositId: string, message: string) {
    await prisma.detectedDeposit.updateMany({
      where: { id: depositId, status: { in: ['DETECTED', 'CONFIRMING', 'CONFIRMED'] } },
      data: { lastCheckedAt: new Date(), lastError: message },
    }).catch((error) => {
      logger.error({ depositId, error: error instanceof Error ? error.message : String(error) }, 'Unable to record settlement error');
    });
  }
}
