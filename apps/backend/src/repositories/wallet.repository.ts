import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { assetToUsd, INTERNAL_PRIMARY_ASSET_CODES, INTERNAL_SUPPORTED_ASSET_CODES, normalizeAssetCode } from '../lib/internal-wallet';

export class WalletRepository {
  static async getOrCreate(userId: string, currency: string, client: PrismaClient | Prisma.TransactionClient = prisma) {
    const normalized = normalizeAssetCode(currency) || 'USD';
    const where = { userId_currency: { userId, currency: normalized } };
    await client.wallet.createMany({
      data: { userId, currency: normalized, walletType: 'INTERNAL', isPrimary: normalized === 'USD' },
      skipDuplicates: true,
    });
    return client.wallet.findUniqueOrThrow({ where });
  }

  static async initializeUserWallets(userId: string) {
    const assetCodes = [...INTERNAL_SUPPORTED_ASSET_CODES];
    const wallets = await Promise.all(assetCodes.map((currency) => this.getOrCreate(userId, currency)));
    return wallets;
  }

  static async getByUserId(userId: string) {
    return prisma.wallet.findMany({ where: { userId }, include: { currency_rel: true } });
  }

  static async getAssetBreakdown(userId: string) {
    const wallets = await prisma.wallet.findMany({
      where: { userId },
      include: { currency_rel: true },
      orderBy: { currency: 'asc' }
    });

    return wallets.map((wallet) => ({
      id: wallet.id,
      currency: wallet.currency,
      walletType: wallet.walletType,
      availableBalance: Number(wallet.availableBalance),
      pendingBalance: Number(wallet.pendingBalance),
      frozenBalance: Number(wallet.frozenBalance),
      totalBalance: Number(wallet.availableBalance) + Number(wallet.pendingBalance) + Number(wallet.frozenBalance),
      usdValue: assetToUsd(Number(wallet.availableBalance), wallet.currency),
      isPrimary: wallet.isPrimary,
      network: wallet.network || null
    }));
  }

  static async getBalanceSummary(userId: string) {
    const wallets = await prisma.wallet.findMany({ where: { userId } });

    const availableBalance = wallets.reduce((sum, wallet) => sum + assetToUsd(Number(wallet.availableBalance), wallet.currency), 0);
    const pendingBalance = wallets.reduce((sum, wallet) => sum + assetToUsd(Number(wallet.pendingBalance), wallet.currency), 0);
    const frozenBalance = wallets.reduce((sum, wallet) => sum + assetToUsd(Number(wallet.frozenBalance), wallet.currency), 0);
    const baseWallet = wallets.find((wallet) => wallet.currency === 'USD') ?? wallets[0];

    return {
      availableBalance: Number(availableBalance.toFixed(8)),
      pendingBalance: Number(pendingBalance.toFixed(8)),
      frozenBalance: Number(frozenBalance.toFixed(8)),
      totalUsdBalance: Number((availableBalance + pendingBalance + frozenBalance).toFixed(8)),
      currency: baseWallet?.currency ?? 'USD'
    };
  }

  static async getLedgerHistory(userId: string, currency?: string) {
    return prisma.ledgerEntry.findMany({
      where: { wallet: { userId }, ...(currency ? { currency } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        walletId: true,
        amount: true,
        type: true,
        currency: true,
        direction: true,
        status: true,
        description: true,
        createdAt: true
      }
    });
  }

  static async addToAvailable(tx: Prisma.TransactionClient, walletId: string, amount: Prisma.Decimal | number, currency: string) {
    return tx.wallet.update({
      where: { id: walletId },
      data: { availableBalance: { increment: amount } }
    });
  }

  static async addToPending(tx: Prisma.TransactionClient, walletId: string, amount: Prisma.Decimal | number, currency: string) {
    return tx.wallet.update({
      where: { id: walletId },
      data: { pendingBalance: { increment: amount } }
    });
  }

  static async moveFromPendingToAvailable(tx: Prisma.TransactionClient, walletId: string, amount: Prisma.Decimal | number, currency: string) {
    return tx.wallet.update({
      where: { id: walletId },
      data: {
        pendingBalance: { decrement: amount },
        availableBalance: { increment: amount }
      }
    });
  }

  static async freezeAmount(tx: Prisma.TransactionClient, walletId: string, amount: Prisma.Decimal | number, currency: string) {
    return tx.wallet.update({
      where: { id: walletId },
      data: {
        pendingBalance: { decrement: amount },
        frozenBalance: { increment: amount }
      }
    });
  }

  static async unfreezeToAvailable(tx: Prisma.TransactionClient, walletId: string, amount: Prisma.Decimal | number, currency: string) {
    return tx.wallet.update({
      where: { id: walletId },
      data: {
        frozenBalance: { decrement: amount },
        availableBalance: { increment: amount }
      }
    });
  }

  static async unfreezeToRefund(tx: Prisma.TransactionClient, sourceWalletId: string, targetWalletId: string, amount: Prisma.Decimal | number, currency: string) {
    await tx.wallet.update({
      where: { id: sourceWalletId },
      data: { frozenBalance: { decrement: amount } }
    });
    return tx.wallet.update({
      where: { id: targetWalletId },
      data: { availableBalance: { increment: amount } }
    });
  }

  static async deductFromAvailable(tx: Prisma.TransactionClient, walletId: string, amount: Prisma.Decimal | number, currency: string) {
    const result = await tx.wallet.updateMany({
      where: { id: walletId, availableBalance: { gte: amount } },
      data: { availableBalance: { decrement: amount } }
    });
    if (result.count !== 1) {
      throw new Error('Insufficient funds');
    }
    return tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
  }

  static async createLedgerEntry(tx: Prisma.TransactionClient, data: Prisma.LedgerEntryUncheckedCreateInput) {
    return tx.ledgerEntry.create({ data });
  }

  static async createAddress(walletId: string, currency: string, network: string, address: string) {
    return prisma.walletAddress.create({
      data: { walletId, currency, network, address }
    });
  }
}
