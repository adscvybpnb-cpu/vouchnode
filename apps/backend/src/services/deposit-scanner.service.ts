import { Prisma, DepositSessionNetwork } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { WalletRepository } from '../repositories/wallet.repository';
import { NotificationService } from './notification.service';
import { OrderService } from './order.service';
import { scheduleConfirmation } from '../jobs/queue';
import { getTokenDeployment, isAutomatedTokenNetwork } from '../config/blockchain';
import { requiresManualReview } from '../config/blockchain';
import { BlockchainConfirmationService } from './blockchain-confirmation.service';
import { amountMatchesTolerance, normalizeCryptoAmount } from '../utils/crypto-amount';

const SUPPORTED_NETWORKS = new Set<DepositSessionNetwork>([
  'BTC', 'BCH', 'LTC', 'TRC20', 'BEP20', 'ERC20', 'POLYGON',
  'ARBITRUM_ONE', 'BASE', 'OPTIMISM', 'SOLANA', 'TON',
]);

export class DepositScannerService {
  private static pendingEvmScan?: Promise<number>;
  private static readonly pendingCheckoutScans = new Map<string, Promise<number>>();
  private static readonly checkoutScanStartedAt = new Map<string, number>();
  private static readonly CHECKOUT_SCAN_COOLDOWN_MS = 15_000;

  static scanPendingEvmDeposits(options: { blockLookback?: number } = {}) {
    if (this.pendingEvmScan) return this.pendingEvmScan;
    this.pendingEvmScan = this.scanPendingEvmDepositsOnce(options).finally(() => {
      this.pendingEvmScan = undefined;
    });
    return this.pendingEvmScan;
  }

  static async scanCheckoutSession(sessionId: string) {
    const inFlight = this.pendingCheckoutScans.get(sessionId);
    if (inFlight) return inFlight;
    if ((this.checkoutScanStartedAt.get(sessionId) ?? 0) + this.CHECKOUT_SCAN_COOLDOWN_MS > Date.now()) return 0;

    const scan = (async () => {
      const now = new Date();
      const session = await prisma.depositSession.findFirst({
        where: {
          id: sessionId,
          orderId: { not: null },
          status: 'PENDING',
          transactionHash: null,
          expiresAt: { gt: now },
          currency: { in: ['USDT', 'USDC'] },
          network: { in: ['ERC20', 'BEP20', 'POLYGON', 'ARBITRUM_ONE', 'BASE', 'OPTIMISM'] },
        },
        select: { id: true, userId: true, orderId: true, assignedAddress: true, currency: true, network: true, amount: true },
      });
      if (!session || !isAutomatedTokenNetwork(session.currency, session.network)) return 0;
      this.checkoutScanStartedAt.set(sessionId, Date.now());
      return this.scanSessions([session], 500, true);
    })().finally(() => {
      this.pendingCheckoutScans.delete(sessionId);
      if (this.checkoutScanStartedAt.size > 1_000) {
        const oldest = [...this.checkoutScanStartedAt.entries()].sort((a, b) => a[1] - b[1]).slice(0, 500);
        for (const [id] of oldest) this.checkoutScanStartedAt.delete(id);
      }
    });
    this.pendingCheckoutScans.set(sessionId, scan);
    return scan;
  }

  private static async scanPendingEvmDepositsOnce({ blockLookback = 500 }: { blockLookback?: number }) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 60 * 60 * 1000);
    const sessions = await prisma.depositSession.findMany({
      where: {
        status: 'PENDING',
        transactionHash: null,
        createdAt: { gte: windowStart },
        expiresAt: { gt: now },
        currency: { in: ['USDT', 'USDC'] },
        network: { in: ['ERC20', 'BEP20', 'POLYGON', 'ARBITRUM_ONE', 'BASE', 'OPTIMISM'] },
      },
      select: { id: true, userId: true, orderId: true, assignedAddress: true, currency: true, network: true, amount: true },
      take: 500,
    });
    return this.scanSessions(sessions, blockLookback, false);
  }

  private static async scanSessions(
    sessions: Array<{
      id: string;
      userId: string;
      orderId: string | null;
      assignedAddress: string;
      currency: string;
      network: DepositSessionNetwork;
      amount: Prisma.Decimal;
    }>,
    blockLookback: number,
    freshHeight: boolean,
  ) {
    const grouped = new Map<string, typeof sessions>();
    for (const session of sessions) {
      if (!isAutomatedTokenNetwork(session.currency, session.network)) continue;
      const key = `${session.network}:${session.currency}`;
      const group = grouped.get(key) ?? [];
      group.push(session);
      grouped.set(key, group);
    }
    let discovered = 0;
    for (const [key, group] of grouped) {
      const [network, asset] = key.split(':');
      const deployment = getTokenDeployment(asset, network);
      if (!deployment) continue;
      try {
        const latest = await BlockchainConfirmationService.currentHeight(network, { fresh: freshHeight });
        const fromBlock = latest > BigInt(blockLookback) ? latest - BigInt(blockLookback) : 0n;
        const destinations = group.map((session) => session.assignedAddress);
        const logs: Array<{ topics?: string[]; data?: string; transactionHash?: string; blockNumber?: string }> = [];
        for (let offset = 0; offset < destinations.length; offset += 50) {
          logs.push(...await BlockchainConfirmationService.tokenTransfersSince(
            network,
            deployment.contract,
            fromBlock,
            latest,
            destinations.slice(offset, offset + 50),
          ));
        }
        const byAddress = new Map(group.map((session) => [session.assignedAddress.toLowerCase(), session]));
        for (const log of logs) {
          const destinationTopic = log.topics?.[2];
          const transactionHash = log.transactionHash;
          if (!destinationTopic || !transactionHash) continue;
          const address = `0x${destinationTopic.slice(-40)}`.toLowerCase();
          const session = byAddress.get(address);
          if (!session) continue;
          await this.processAlchemyActivities([{
            toAddress: session.assignedAddress,
            hash: transactionHash,
            network,
            asset,
            contractAddress: deployment.contract,
            blockNumber: Number(BigInt(log.blockNumber ?? '0x0')),
            rawContract: { value: log.data, decimals: deployment.decimals },
          }]);
          discovered += 1;
        }
      } catch (error) {
        console.error(JSON.stringify({
          event: 'deposit_scan_network_failed',
          network,
          asset,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }
    return discovered;
  }

  static async processAlchemyActivities(activities: unknown[]) {
    const settled: string[] = [];
    const skipped: string[] = [];
    for (const activity of activities) {
      if (!activity || typeof activity !== 'object') {
        skipped.push('invalid activity');
        continue;
      }
      const item = activity as Record<string, unknown>;
      const toAddress = String(item.toAddress || item.to || '').toLowerCase();
      const transactionHash = String(item.hash || item.transactionHash || '');
      if (!toAddress || !transactionHash) {
        skipped.push('missing destination or transaction hash');
        continue;
      }

      const reportedNetwork = String(item.network || item.networkId || '').trim().toUpperCase();
      const session = await prisma.depositSession.findFirst({
        where: {
          status: 'PENDING',
          ...(SUPPORTED_NETWORKS.has(reportedNetwork as DepositSessionNetwork)
            ? { network: reportedNetwork as DepositSessionNetwork }
            : {}),
          assignedAddress: { equals: toAddress, mode: 'insensitive' },
        },
        select: { id: true, userId: true, orderId: true, assignedAddress: true, currency: true, network: true, amount: true }
      });
      if (!session) {
        skipped.push(`unmatched destination ${toAddress}`);
        continue;
      }

      const asset = String(item.asset || item.symbol || '').toUpperCase();
      if (asset && asset !== session.currency.toUpperCase()) {
        skipped.push(`asset mismatch for ${session.id}: ${asset}`);
        continue;
      }
      if (session.currency === 'USDT' || session.currency === 'USDC') {
        const rawContract = item.rawContract && typeof item.rawContract === 'object'
          ? item.rawContract as Record<string, unknown>
          : undefined;
        const contract = String(item.contractAddress || item.contract || rawContract?.address || '').trim();
        const deployment = getTokenDeployment(session.currency, session.network);
        if (!deployment || !contract || contract.toLowerCase() !== deployment.contract.toLowerCase()) {
          skipped.push(`token contract mismatch for ${session.id}`);
          continue;
        }
      }
      const amount = this.parseAlchemyAmount(item);
      if (!Number.isFinite(amount) || amount <= 0) {
        skipped.push(`non-positive amount for ${session.id}`);
        continue;
      }
      const normalizedSessionAmount = normalizeCryptoAmount(session.amount, session.currency, session.network);
      const normalizedAmount = normalizeCryptoAmount(amount, session.currency, session.network);

      if (session.orderId) {
        const order = await prisma.order.findUnique({
          where: { id: session.orderId },
          select: { totalAmount: true, status: true }
        });
        if (!order || !['PAYMENT_PENDING', 'PENDING_MANUAL_REVIEW'].includes(order.status)) {
          skipped.push(`order is not awaiting payment for ${session.id}`);
          continue;
        }
        if (requiresManualReview(session.currency, session.network)) {
          await OrderService.markManualPaymentReview(session.orderId, transactionHash, session.currency, session.network);
          settled.push(session.id);
          continue;
        }
        const verified = await BlockchainConfirmationService.verifyTransaction({
          txHash: transactionHash,
          asset: session.currency,
          network: session.network,
          destination: session.assignedAddress,
          expectedAmount: Number(normalizedSessionAmount),
        });
        const orderId = session.orderId;
        if (!orderId) throw new Error(`Order is missing for deposit session ${session.id}`);
        try {
          await OrderService.processPaymentConfirmed(
            orderId,
            transactionHash,
            Number(order.totalAmount),
            undefined,
            {
              blockNumber: verified.blockNumber,
              network: session.network,
              depositAmount: Number(normalizedAmount),
            },
          );
        } catch (error) {
          console.error(JSON.stringify({
            event: 'direct_checkout_payment_processing_failed',
            orderId,
            sessionId: session.id,
            txHash: transactionHash,
            network: session.network,
            asset: session.currency,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          }));
          throw error;
        }
        await scheduleConfirmation({
          orderId,
          txHash: transactionHash,
          amount: Number(order.totalAmount),
          asset: session.currency,
          network: session.network,
          blockNumber: verified.blockNumber,
          destination: session.assignedAddress,
          expectedAmount: verified.amount,
        });
        settled.push(session.id);
        continue;
      } else {
        const verified = await BlockchainConfirmationService.verifyTransaction({
          txHash: transactionHash,
          asset: session.currency,
          network: session.network,
          destination: session.assignedAddress,
          expectedAmount: Number(normalizedSessionAmount),
        });
        await this.settlePayment(session.userId, session.id, verified.amount, transactionHash);
        settled.push(session.id);
        continue;
      }

    }
    return { settled: settled.length, skipped: skipped.length };
  }

  private static parseAlchemyAmount(item: Record<string, unknown>) {
    const rawContract = item.rawContract as Record<string, unknown> | undefined;
    const raw = item.value ?? rawContract?.value ?? rawContract?.rawValue;
    if (typeof raw === 'number') return raw;
    if (typeof raw !== 'string' || !raw.trim()) return 0;
    if (!raw.startsWith('0x')) return Number(raw);
    const decimals = Number(rawContract?.decimal ?? rawContract?.decimals ?? 18);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return 0;
    return Number(BigInt(raw)) / 10 ** decimals;
  }

  static async scanPendingSessions({ batchSize = 100 }: { batchSize?: number } = {}) {
    const expiredCheckoutOrders = await prisma.depositSession.findMany({
      where: {
        status: { in: ['PENDING', 'EXPIRED', 'CANCELLED'] },
        expiresAt: { lte: new Date() },
        orderId: { not: null },
        transactionHash: null,
        detectedDeposits: {
          none: { status: { in: ['DETECTED', 'CONFIRMING', 'CONFIRMED', 'SETTLING', 'MANUAL_REVIEW'] } },
        },
      },
      select: { orderId: true },
      take: batchSize,
    });
    for (const { orderId } of expiredCheckoutOrders) {
      if (orderId) await OrderService.releaseUnpaidOrder(orderId, 'Checkout invoice expired');
    }

    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const expiredAddresses = await tx.staticAddressPool.findMany({
        where: { status: 'BUSY', orderId: null, expiresAt: { lte: now } },
        select: { address: true },
        take: batchSize,
      });
      const expiredSessions = await tx.depositSession.findMany({
        where: {
          status: 'PENDING',
          expiresAt: { lte: now },
          orderId: null,
          transactionHash: null,
          detectedDeposits: {
            none: { status: { in: ['DETECTED', 'CONFIRMING', 'CONFIRMED', 'SETTLING', 'MANUAL_REVIEW'] } },
          },
        },
        select: { id: true, assignedAddress: true, network: true },
        take: batchSize,
      });
      const addressesToRelease = new Set([
        ...expiredAddresses.map(({ address }) => address),
        ...expiredSessions.map(({ assignedAddress }) => assignedAddress)
      ]);

      for (const session of expiredSessions) {
        await tx.depositSession.update({
          where: { id: session.id },
          data: { status: 'CANCELLED', updatedAt: now }
        });
        await tx.ledgerEntry.updateMany({
          where: { referenceId: session.id, type: 'DEPOSIT', status: 'PENDING' },
          data: { status: 'CANCELLED', completedAt: now }
        });
        await tx.cryptoDeposit.updateMany({
          where: { address: session.assignedAddress, network: session.network, status: 'PENDING' },
          data: { status: 'CANCELLED' }
        });
      }

      for (const address of addressesToRelease) {
        await tx.staticAddressPool.updateMany({
          where: { address, status: 'BUSY' },
          data: { status: 'AVAILABLE', orderId: null, expiresAt: null }
        });
        const sessions = await tx.depositSession.findMany({
          where: {
            assignedAddress: address,
            status: 'PENDING',
            orderId: null,
            transactionHash: null,
            detectedDeposits: {
              none: { status: { in: ['DETECTED', 'CONFIRMING', 'CONFIRMED', 'SETTLING', 'MANUAL_REVIEW'] } },
            },
          },
          select: { id: true, network: true }
        });
        for (const session of sessions) {
          await tx.depositSession.update({
            where: { id: session.id },
            data: { status: 'CANCELLED', updatedAt: now }
          });
          await tx.ledgerEntry.updateMany({
            where: { referenceId: session.id, type: 'DEPOSIT', status: 'PENDING' },
            data: { status: 'CANCELLED', completedAt: now }
          });
          await tx.cryptoDeposit.updateMany({
            where: { address, network: session.network, status: 'PENDING' },
            data: { status: 'CANCELLED' }
          });
        }
      }

      return {
        expired: expiredSessions.length,
        releasedStaticAddresses: addressesToRelease.size
      };
    });
    return result;
  }

  private static parseBlockNumber(item: Record<string, unknown>) {
    const raw = item.blockNum ?? item.blockNumber ?? item.blockHeight ?? item.slot;
    if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) return raw;
    if (typeof raw === 'string' && /^\d+$/.test(raw)) {
      const parsed = Number(raw);
      return Number.isSafeInteger(parsed) ? parsed : null;
    }
    return null;
  }

  static async simulatePayment(userId: string, sessionId: string, amount: number, transactionHash: string) {
    return this.settlePayment(userId, sessionId, amount, transactionHash);
  }

  static async simulateCheckoutPayment(userId: string, sessionId: string, amount: number, transactionHash: string) {
    const session = await prisma.depositSession.findFirst({
      where: { id: sessionId, userId, orderId: { not: null } },
      select: { id: true, orderId: true, status: true, amount: true, currency: true, assignedAddress: true, network: true }
    });
    if (!session?.orderId) throw new Error('Checkout payment session not found.');
    if (session.status !== 'PENDING') throw new Error('This checkout payment session is no longer active.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be greater than zero.');
    const order = await prisma.order.findUnique({
      where: { id: session.orderId },
      select: { totalAmount: true, status: true }
    });
    if (!order || order.status !== 'PAYMENT_PENDING') throw new Error('Checkout order is no longer awaiting payment.');
    const normalizedExpected = normalizeCryptoAmount(session.amount, session.network === 'SOLANA' ? 'SOL' : session.currency, session.network);
    const normalizedActual = normalizeCryptoAmount(amount, session.network === 'SOLANA' ? 'SOL' : session.currency, session.network);
    if (!amountMatchesTolerance(normalizedActual, normalizedExpected, session.network === 'SOLANA' ? 'SOL' : session.currency, session.network)) {
      throw new Error('Payment amount does not match the locked checkout quote.');
    }

    await OrderService.processPaymentConfirmed(
      session.orderId,
      transactionHash,
      Number(order.totalAmount),
      undefined,
      { depositAmount: amount },
    );
    return prisma.depositSession.findUniqueOrThrow({ where: { id: session.id } });
  }

  private static async settlePayment(userId: string, sessionId: string, amount: number, transactionHash: string) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Deposit amount must be greater than zero.');
    }

    try {
      const completed = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const session = await tx.depositSession.findFirst({ where: { id: sessionId, userId } });
        if (!session) throw new Error('Deposit session not found.');
        if (session.status !== 'PENDING') {
          throw new Error('This deposit session is no longer active.');
        }

        const normalizedAmount = normalizeCryptoAmount(amount, session.currency, session.network);
        const claimed = await tx.depositSession.updateMany({
          where: { id: sessionId, status: 'PENDING' },
          data: {
            status: 'COMPLETED',
            amount: normalizedAmount,
            transactionHash,
            completedAt: now
          }
        });
        if (claimed.count !== 1) throw new Error('This deposit session is no longer active.');
        await tx.cryptoDeposit.updateMany({
          where: { address: session.assignedAddress, network: session.network, status: 'PENDING' },
          data: { status: 'SUCCESS' }
        });
        await tx.staticAddressPool.updateMany({
          where: { address: session.assignedAddress, status: 'BUSY' },
          data: { status: 'AVAILABLE', orderId: null, expiresAt: null }
        });

        const wallet = await tx.wallet.upsert({
          where: { userId_currency: { userId: session.userId, currency: session.currency } },
          update: {},
          create: { userId: session.userId, currency: session.currency, walletType: 'INTERNAL' }
        });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { availableBalance: { increment: new Prisma.Decimal(amount) } }
        });
        const pendingLedger = await tx.ledgerEntry.updateMany({
          where: { referenceId: session.id, walletId: wallet.id, type: 'DEPOSIT', status: 'PENDING' },
          data: {
            amount: new Prisma.Decimal(amount),
            status: 'COMPLETED',
            completedAt: now,
            description: `Confirmed ${session.network} deposit (${transactionHash})`
          }
        });
        if (pendingLedger.count === 0) {
          await WalletRepository.createLedgerEntry(tx, {
            walletId: wallet.id,
            type: 'DEPOSIT',
            amount: new Prisma.Decimal(amount),
            currency: session.currency,
            direction: 'CREDIT',
            status: 'COMPLETED',
            referenceId: session.id,
            description: `Confirmed ${session.network} deposit (${transactionHash})`
          });
        }

        return tx.depositSession.findUniqueOrThrow({ where: { id: sessionId } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      await NotificationService.createNotification({
        userId, type: 'DEPOSIT_CONFIRMED', title: 'Deposit Credited',
        message: `Your automated deposit of ${amount} ${completed.currency} has been successfully processed.`,
        data: { depositSessionId: completed.id, amount, currency: completed.currency },
        link: '/dashboard/wallet',
      });
      return completed;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Error('This transaction has already been processed.');
      }
      throw error;
    }
  }
}
