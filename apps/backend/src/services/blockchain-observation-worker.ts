import { randomUUID } from 'node:crypto';
import { DepositSessionNetwork, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { BlockchainAdapter } from './blockchain-adapter';
import { createBlockchainAdapters } from './native-blockchain-adapters';
import { scheduleBlockchainSettlement } from '../jobs/queue';
import { requiresManualReview } from '../config/blockchain';
import { emitMarketplaceOrderEvent } from '../websocket/socket.server';
import { OrderService } from './order.service';
import { RpcPoolExhaustedError } from './rpc-endpoint-pool';

const MIN_INTERVAL_MS = 30_000;
const INTERVAL_RANGE_MS = 10_000;
const MAX_CATCHUP_BLOCKS = 5_000n;
const MAX_BLOCKS_PER_RUN = 50n;
const LEASE_MS = 40_000;
const DEPOSIT_DISCOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export class BlockchainObservationWorker {
  private readonly owner = randomUUID();
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = false;

  constructor(private readonly adapters: BlockchainAdapter[] = createBlockchainAdapters()) {}

  async start() {
    await this.runOnce();
    this.scheduleNextCycle();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNextCycle() {
    if (this.stopped) return;
    const delayMs = MIN_INTERVAL_MS + Math.floor(Math.random() * INTERVAL_RANGE_MS);
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch((error) => logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Unexpected blockchain observation cycle failure',
        ))
        .finally(() => this.scheduleNextCycle());
    }, delayMs);
    this.timer.unref();
  }

  private async initializeMissingCursors() {
    let existingNetworks: Set<DepositSessionNetwork>;
    try {
      const existing = await prisma.blockCursor.findMany({ select: { network: true } });
      existingNetworks = new Set(existing.map(({ network }) => network));
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Unable to load blockchain cursors; initialization will be retried',
      );
      return;
    }

    for (const adapter of this.adapters) {
      if (existingNetworks.has(adapter.network)) continue;
      try {
        const tip = await adapter.getSafeTip();
        await prisma.blockCursor.upsert({
          where: { network: adapter.network },
          create: { network: adapter.network, nextBlock: tip, observedTip: tip, status: 'ACTIVE' },
          update: {},
        });
        existingNetworks.add(adapter.network);
        logger.info({ network: adapter.network, nextBlock: tip.toString() }, 'Blockchain cursor initialized');
      } catch (error) {
        logger.warn(
          { network: adapter.network, error: error instanceof Error ? error.message : String(error) },
          'Blockchain cursor initialization skipped; it will be retried',
        );
      }
    }
  }

  private async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      await this.initializeMissingCursors();
      const results = await Promise.allSettled(
        this.adapters.map(async (adapter, index) => {
          const staggerMs = (index * 1_000) % 10_000;
          if (staggerMs) await new Promise((resolve) => setTimeout(resolve, staggerMs));
          return this.processNetwork(adapter);
        }),
      );
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const isRpcExhaustion = result.reason instanceof RpcPoolExhaustedError;
          const logContext = {
            network: this.adapters[index].network,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          };
          if (isRpcExhaustion) {
            logger.warn(logContext, 'RPC pool temporarily unavailable; blockchain cursor will retry on the next cycle');
          } else {
            logger.error(logContext, 'Blockchain network cycle failed');
          }
        }
      });
    } finally {
      this.running = false;
    }
  }

  private async processNetwork(adapter: BlockchainAdapter) {
    const cursor = await prisma.blockCursor.findUnique({ where: { network: adapter.network } });
    if (!cursor) return;
    const lease = await prisma.blockCursor.updateMany({
      where: { id: cursor.id, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }] },
      data: { leaseOwner: this.owner, leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
    });
    if (lease.count !== 1) return;
    try {
      const safeTip = await adapter.getSafeTip();
      if (cursor.nextBlock > safeTip) {
        await prisma.blockCursor.update({
          where: { id: cursor.id },
          data: {
            observedTip: safeTip,
            status: 'ACTIVE',
            lastSuccessAt: new Date(),
            lastError: null,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        return;
      }
      const targets = await this.activeTargets(adapter.network);
      const hasNativeTarget = targets.some((target) =>
        ['BTC', 'BCH', 'LTC', 'TRX', 'SOL', 'BNB', 'ETH'].includes(target.asset.toUpperCase()),
      );
      const maxBlocksPerRun = adapter.network === 'ERC20' ||
        adapter.network === 'BEP20' ||
        adapter.network === 'ARBITRUM_ONE' ||
        adapter.network === 'POLYGON' ||
        adapter.network === 'BASE' ||
        adapter.network === 'OPTIMISM'
        ? (hasNativeTarget ? 50n : MAX_CATCHUP_BLOCKS)
        : 50n;
      const scanStart = cursor.nextBlock;
      const boundedCatchup = safeTip - scanStart > MAX_CATCHUP_BLOCKS;
      const maxBlocks = boundedCatchup && hasNativeTarget ? MAX_BLOCKS_PER_RUN : maxBlocksPerRun;
      const scanEnd = scanStart + maxBlocks - 1n < safeTip ? scanStart + maxBlocks - 1n : safeTip;
      const observations = await adapter.observeRange({ from: scanStart, to: scanEnd }, targets);
      const detectedDepositIds: string[] = [];
      const manualReviewOrderIds = new Set<string>();
      await prisma.$transaction(async (tx) => {
        for (const observation of observations) {
          const now = new Date();
          const claimedSession = await tx.depositSession.updateMany({
            where: {
              id: observation.sessionId,
              status: 'PENDING',
              OR: [
                { transactionHash: null, expiresAt: { gt: now } },
                { transactionHash: observation.transactionHash },
              ],
            },
            data: { transactionHash: observation.transactionHash },
          });
          const detected = await tx.detectedDeposit.upsert({
            where: { eventKey: observation.eventKey },
            create: {
              eventKey: observation.eventKey,
              network: observation.network,
              chainId: observation.chainId,
              asset: observation.asset,
              tokenContract: observation.tokenContract,
              tokenDecimals: observation.tokenDecimals,
              transactionHash: observation.transactionHash,
              eventIndex: observation.eventIndex,
              blockNumber: observation.blockNumber,
              blockHash: observation.blockHash,
              slot: observation.slot,
              destination: observation.destination,
              amount: new Prisma.Decimal(observation.amount),
              expectedAmount: observation.expectedAmount ? new Prisma.Decimal(observation.expectedAmount) : undefined,
              status: claimedSession.count === 1 && !requiresManualReview(observation.asset, observation.network)
                ? 'DETECTED'
                : 'MANUAL_REVIEW',
              depositSessionId: observation.sessionId,
              metadata: observation.metadata,
            },
            update: {},
          });
          if (detected.status === 'DETECTED') detectedDepositIds.push(detected.id);
          if (detected.status === 'MANUAL_REVIEW') {
            const session = await tx.depositSession.findUnique({
              where: { id: observation.sessionId },
              select: { orderId: true },
            });
            if (session?.orderId) {
              const flagged = await OrderService.flagDepositForManualReviewInTransaction(tx, {
                orderId: session.orderId,
                sessionId: observation.sessionId,
                txHash: observation.transactionHash,
                asset: observation.asset,
                network: observation.network,
                reason: 'Detected deposit requires manual verification',
              });
              if (flagged) manualReviewOrderIds.add(session.orderId);
            }
          }
        }
        await tx.blockCursor.update({
          where: { id: cursor.id },
          data: {
            nextBlock: scanEnd + 1n,
            lastProcessedBlock: scanEnd,
            observedTip: safeTip,
            status: 'ACTIVE',
            lastSuccessAt: new Date(),
            lastError: null,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
      });
      await Promise.all(detectedDepositIds.map((depositId) => scheduleBlockchainSettlement(depositId)));
      for (const orderId of manualReviewOrderIds) {
        emitMarketplaceOrderEvent(orderId, 'order_updated', {
          orderId,
          status: 'PENDING_MANUAL_REVIEW',
          paymentStatus: 'PENDING',
          reason: 'DEPOSIT_REQUIRES_MANUAL_REVIEW',
        });
      }
      logger.info({
        network: adapter.network,
        fromBlock: scanStart.toString(),
        toBlock: scanEnd.toString(),
        safeTip: safeTip.toString(),
        activeTargets: targets.length,
        observations: observations.length,
      }, 'Blockchain observation range completed');
    } catch (error) {
      await prisma.blockCursor.update({
        where: { id: cursor.id },
        data: {
          status: 'ERROR',
          lastErrorAt: new Date(),
          lastError: error instanceof Error ? error.message : String(error),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      }).catch((updateError) => {
        logger.error({
          network: adapter.network,
          error: updateError instanceof Error ? updateError.message : String(updateError),
        }, 'Unable to persist blockchain cursor failure');
      });
      const isRpcExhaustion = error instanceof RpcPoolExhaustedError;
      const logContext = { network: adapter.network, error: error instanceof Error ? error.message : String(error) };
      if (isRpcExhaustion) {
        logger.warn(logContext, 'RPC pool temporarily unavailable; blockchain cursor retained for retry');
      } else {
        logger.error(logContext, 'Blockchain observation failed');
      }
    }
  }

  private activeTargets(network: DepositSessionNetwork) {
    const discoverySince = new Date(Date.now() - DEPOSIT_DISCOVERY_WINDOW_MS);
    return prisma.depositSession.findMany({
      where: {
        network,
        OR: [
          { status: 'PENDING', expiresAt: { gt: discoverySince } },
          { status: { in: ['EXPIRED', 'CANCELLED'] }, expiresAt: { gt: discoverySince } },
        ],
      },
      select: { id: true, userId: true, assignedAddress: true, currency: true, amount: true, status: true },
    }).then((sessions) => sessions.map((session) => ({
      sessionId: session.id,
      userId: session.userId,
      address: session.assignedAddress,
      asset: session.currency,
      expectedAmount: session.amount.toString(),
      sessionStatus: session.status,
    })));
  }
}
