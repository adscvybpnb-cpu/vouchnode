import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class TradeService {
  private static error(message: string, code: string) {
    const error = new Error(message) as Error & { code?: string; statusCode?: number };
    error.code = code;
    error.statusCode = code === 'UNAUTHORIZED' ? 403 : 400;
    return error;
  }

  static async createTrade(
    buyerId: string,
    data: { sellerId: string; cryptoType: string; cryptoAmount: number; amountUSD: number }
  ) {
    const cryptoType = data.cryptoType.trim().toUpperCase();
    if (!data.sellerId || !Number.isFinite(data.cryptoAmount) || !Number.isFinite(data.amountUSD) ||
        data.cryptoAmount <= 0 || data.amountUSD <= 0) {
      throw this.error('Seller, crypto amount, and USD amount must be positive', 'INVALID_TRADE');
    }
    if (buyerId === data.sellerId) throw this.error('Cannot trade with yourself', 'INVALID_TRADE');
    const cryptoAmount = new Prisma.Decimal(data.cryptoAmount);
    const amountUSD = new Prisma.Decimal(data.amountUSD);

    return prisma.$transaction(async (tx) => {
      const seller = await tx.user.findUnique({ where: { id: data.sellerId }, select: { id: true } });
      if (!seller) throw this.error('Seller not found', 'SELLER_NOT_FOUND');

      const wallet = await tx.wallet.findUnique({
        where: { userId_currency: { userId: buyerId, currency: cryptoType } }
      });
      if (!wallet) throw this.error(`Buyer wallet not found for ${cryptoType}`, 'WALLET_NOT_FOUND');

      const locked = await tx.wallet.updateMany({
        where: { id: wallet.id, availableBalance: { gte: cryptoAmount } },
        data: {
          availableBalance: { decrement: cryptoAmount },
          escrowBalance: { increment: cryptoAmount }
        }
      });
      if (locked.count !== 1) throw this.error(`Insufficient funds for ${cryptoType}`, 'INSUFFICIENT_FUNDS');

      const now = new Date();
      const trade = await tx.trade.create({
        data: {
          buyerId,
          sellerId: data.sellerId,
          cryptoType,
          cryptoAmount,
          amountUSD,
          status: 'PENDING',
          lockedAt: now,
          escrowUnlockAt: new Date(now.getTime() + 48 * 60 * 60 * 1000)
        }
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: 'ESCROW_HOLD',
          amount: cryptoAmount,
          currency: cryptoType,
          direction: 'DEBIT',
          status: 'COMPLETED',
          referenceId: trade.id,
          description: 'Buyer funds locked in trade escrow',
          completedAt: now
        }
      });
      return trade;
    });
  }

  static async openDispute(tradeId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findUnique({ where: { id: tradeId } });
      if (!trade) throw this.error('Trade not found', 'TRADE_NOT_FOUND');
      if (trade.buyerId !== userId && trade.sellerId !== userId) {
        throw this.error('You are not a participant in this trade', 'UNAUTHORIZED');
      }
      if (!['PENDING', 'ESCROW_LOCKED', 'PAID', 'SUCCESS'].includes(trade.status)) {
        throw this.error('This trade cannot be disputed', 'INVALID_TRADE_STATE');
      }
      const canEscalateAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      return tx.trade.update({
        where: { id: tradeId },
        data: { status: 'DISPUTED', escrowUnlockAt: null, canEscalateAt }
      });
    });
  }

  static async escalateDispute(tradeId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findUnique({ where: { id: tradeId } });
      if (!trade) throw this.error('Trade not found', 'TRADE_NOT_FOUND');
      if (trade.buyerId !== userId && trade.sellerId !== userId) {
        throw this.error('You are not a participant in this trade', 'UNAUTHORIZED');
      }
      if (trade.status !== 'DISPUTED' || !trade.canEscalateAt) {
        throw this.error('Trade is not awaiting escalation', 'INVALID_DISPUTE_STATE');
      }
      const remainingMs = trade.canEscalateAt.getTime() - Date.now();
      if (remainingMs > 0) {
        const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
        throw this.error(`You can escalate this dispute in ${remainingHours} hour(s)`, 'ESCALATION_TOO_EARLY');
      }
      return tx.trade.update({
        where: { id: tradeId },
        data: { status: 'ESCALATED', canEscalateAt: null }
      });
    });
  }

  static async completeExpiredTrades(now = new Date(), batchSize = 100) {
    const candidates = await prisma.trade.findMany({
      where: { status: 'PENDING', escrowUnlockAt: { lte: now } },
      select: { id: true },
      take: batchSize,
    });
    let completed = 0;
    for (const candidate of candidates) {
      const didComplete = await prisma.$transaction(async (tx) => {
        const trade = await tx.trade.findUnique({ where: { id: candidate.id } });
        if (!trade || trade.status !== 'PENDING' || !trade.escrowUnlockAt || trade.escrowUnlockAt > now) return false;
        const buyerWallet = await tx.wallet.findUnique({
          where: { userId_currency: { userId: trade.buyerId, currency: trade.cryptoType } }
        });
        if (!buyerWallet) throw this.error(`Buyer wallet not found for ${trade.cryptoType}`, 'WALLET_NOT_FOUND');
        const released = await tx.wallet.updateMany({
          where: { id: buyerWallet.id, escrowBalance: { gte: trade.cryptoAmount } },
          data: { escrowBalance: { decrement: trade.cryptoAmount } }
        });
        if (released.count !== 1) throw this.error('Escrow balance is inconsistent', 'ESCROW_INTEGRITY_ERROR');
        const sellerWallet = await tx.wallet.findUnique({
          where: { userId_currency: { userId: trade.sellerId, currency: trade.cryptoType } }
        });
        if (!sellerWallet) throw this.error(`Seller wallet not found for ${trade.cryptoType}`, 'WALLET_NOT_FOUND');
        await tx.wallet.update({
          where: { id: sellerWallet.id },
          data: { availableBalance: { increment: trade.cryptoAmount } }
        });
        const completedAt = new Date();
        await tx.trade.update({
          where: { id: trade.id },
          data: { status: 'COMPLETED', completedAt, escrowUnlockAt: null }
        });
        await tx.ledgerEntry.create({
          data: {
            walletId: sellerWallet.id,
            type: 'ESCROW_RELEASE',
            amount: trade.cryptoAmount,
            currency: trade.cryptoType,
            direction: 'CREDIT',
            status: 'COMPLETED',
            referenceId: trade.id,
            description: 'Escrow automatically released after 48 hours',
            completedAt
          }
        });
        return true;
      });
      if (didComplete) completed += 1;
    }
    return completed;
  }

  static async lockFundsInEscrow(tradeId: string) {
    return prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findUnique({
        where: { id: tradeId }
      });

      if (!trade) {
        const error = new Error('Trade not found');
        (error as any).code = 'TRADE_NOT_FOUND';
        throw error;
      }

      const supportedAssets = ['BTC', 'BNB', 'ETH', 'BCH', 'SOL', 'LTC', 'TRX', 'GRAM', 'USDT', 'USDC'];
      if (!supportedAssets.includes(trade.cryptoType)) {
        const error = new Error(`Unsupported crypto type: ${trade.cryptoType}`);
        (error as any).code = 'UNSUPPORTED_CRYPTO_TYPE';
        throw error;
      }

      const wallet = await tx.wallet.findFirst({
        where: {
          userId: trade.sellerId,
          currency: trade.cryptoType
        }
      });

      if (!wallet) {
        const error = new Error(`Seller wallet not found for ${trade.cryptoType}`);
        (error as any).code = 'WALLET_NOT_FOUND';
        throw error;
      }

      const requiredAmount = new Prisma.Decimal(trade.cryptoAmount.toString());
      const availableAmount = new Prisma.Decimal(wallet.availableBalance.toString());

      if (availableAmount.lt(requiredAmount)) {
        const error = new Error(`Insufficient funds for ${trade.cryptoType}`);
        (error as any).code = 'INSUFFICIENT_FUNDS';
        throw error;
      }

      const updatePayload: Record<string, any> = {
        availableBalance: { decrement: requiredAmount },
        pendingBalance: { increment: requiredAmount },
        escrowBalance: { increment: requiredAmount }
      };

      await tx.wallet.update({
        where: { id: wallet.id },
        data: updatePayload
      });

      const updatedTrade = await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: 'ESCROW_LOCKED',
          lockedAt: new Date()
        }
      });

      return {
        tradeId: updatedTrade.id,
        status: updatedTrade.status,
        cryptoType: updatedTrade.cryptoType,
        cryptoAmount: updatedTrade.cryptoAmount.toString(),
        lockedAt: updatedTrade.lockedAt
      };
    });
  }
}
