import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { WalletRepository } from '../repositories/wallet.repository';

export const FIRST_DEPOSIT_BONUS_MINIMUM_USD = new Prisma.Decimal(50);
export const FIRST_DEPOSIT_BONUS_AMOUNT_USDT = new Prisma.Decimal(10);

export function meetsFirstDepositBonusThreshold(totalDepositedUsd: Prisma.Decimal) {
  return totalDepositedUsd.gte(FIRST_DEPOSIT_BONUS_MINIMUM_USD);
}

export class FirstDepositBonusService {
  static async getEligibility(userId: string) {
    const [claimedBonus, priorLegacyDeposit, depositTotals] = await Promise.all([
      prisma.firstDepositBonus.findUnique({
        where: { userId },
        select: {
          id: true,
          depositSessionId: true,
          depositCurrency: true,
          depositUsdValue: true,
          bonusAmount: true,
          createdAt: true,
        },
      }),
      prisma.deposit.findFirst({
        where: { status: 'CONFIRMED', wallet: { userId } },
        select: { id: true, currency: true, amount: true, confirmedAt: true },
      }),
      prisma.depositSession.aggregate({
        where: { userId, orderId: null, status: 'COMPLETED' },
        _sum: { usdAmount: true },
      }),
    ]);
    const qualifyingDeposit = await prisma.depositSession.findFirst({
      where: claimedBonus
        ? { id: claimedBonus.depositSessionId, userId, orderId: null, status: 'COMPLETED' }
        : {
          userId,
          orderId: null,
          status: 'COMPLETED',
          usdAmount: { gte: FIRST_DEPOSIT_BONUS_MINIMUM_USD },
        },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        currency: true,
        network: true,
        amount: true,
        usdAmount: true,
        completedAt: true,
      },
    });
    const totalDepositedUsd = new Prisma.Decimal(depositTotals._sum.usdAmount?.toString() ?? '0');
    const claimed = Boolean(claimedBonus);
    return {
      eligible: !claimed && !priorLegacyDeposit,
      claimed,
      totalDepositedUsd: Number(totalDepositedUsd.toString()),
      status: claimed
        ? 'BONUS_CLAIMED'
        : priorLegacyDeposit
          ? 'LEGACY_DEPOSIT_BLOCKER'
          : totalDepositedUsd.gte(FIRST_DEPOSIT_BONUS_MINIMUM_USD)
            ? 'QUALIFIED_BUT_NOT_CLAIMED'
            : 'DEPOSIT_PROGRESS',
      minimumUsd: Number(FIRST_DEPOSIT_BONUS_MINIMUM_USD.toString()),
      bonusAmountUsdt: Number(FIRST_DEPOSIT_BONUS_AMOUNT_USDT.toString()),
      claim: claimedBonus ? {
        depositSessionId: claimedBonus.depositSessionId,
        depositCurrency: claimedBonus.depositCurrency,
        depositUsdValue: Number(claimedBonus.depositUsdValue.toString()),
        bonusAmount: Number(claimedBonus.bonusAmount.toString()),
        createdAt: claimedBonus.createdAt.toISOString(),
      } : null,
      qualifyingDeposit: qualifyingDeposit ? {
        id: qualifyingDeposit.id,
        status: qualifyingDeposit.status,
        currency: qualifyingDeposit.currency,
        network: qualifyingDeposit.network,
        amount: Number(qualifyingDeposit.amount.toString()),
        usdAmount: Number(qualifyingDeposit.usdAmount.toString()),
        completedAt: qualifyingDeposit.completedAt?.toISOString() ?? null,
      } : null,
      hasConfirmedLegacyDeposit: Boolean(priorLegacyDeposit),
      confirmedLegacyDeposit: priorLegacyDeposit ? {
        currency: priorLegacyDeposit.currency,
        amount: priorLegacyDeposit.amount === null ? null : Number(priorLegacyDeposit.amount.toString()),
        confirmedAt: priorLegacyDeposit.confirmedAt?.toISOString() ?? null,
      } : null,
    };
  }

  static async isEligible(userId: string) {
    return (await this.getEligibility(userId)).eligible;
  }

  static async grantForCompletedWalletDeposit(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      depositSessionId: string;
      depositCurrency: string;
      depositAmount: Prisma.Decimal;
      depositUsdValue: Prisma.Decimal;
      completedAt: Date;
    },
  ) {
    const session = await tx.depositSession.findFirst({
      where: {
        id: input.depositSessionId,
        userId: input.userId,
        orderId: null,
        status: 'COMPLETED',
      },
      select: { id: true },
    });
    if (!session) return false;

    const [priorLegacyDeposit, deposits] = await Promise.all([
      tx.deposit.findFirst({
        where: { status: 'CONFIRMED', wallet: { userId: input.userId } },
        select: { id: true },
      }),
      tx.depositSession.aggregate({
        where: {
          userId: input.userId,
          orderId: null,
          status: 'COMPLETED',
          id: { not: input.depositSessionId },
        },
        _sum: { usdAmount: true },
      }),
    ]);
    const priorDepositsUsd = new Prisma.Decimal(deposits._sum.usdAmount?.toString() ?? '0');
    const totalDepositedUsd = priorDepositsUsd.add(input.depositUsdValue);
    if (priorLegacyDeposit || !meetsFirstDepositBonusThreshold(totalDepositedUsd)) return false;

    const claim = await tx.firstDepositBonus.createMany({
      data: [{
        userId: input.userId,
        depositSessionId: input.depositSessionId,
        depositCurrency: input.depositCurrency,
        depositAmount: input.depositAmount,
        depositUsdValue: input.depositUsdValue,
        bonusAmount: FIRST_DEPOSIT_BONUS_AMOUNT_USDT,
        createdAt: input.completedAt,
      }],
      skipDuplicates: true,
    });
    if (claim.count !== 1) return false;

    const bonusWallet = await WalletRepository.getOrCreate(input.userId, 'USDT', tx);
    await WalletRepository.addToAvailable(
      tx,
      bonusWallet.id,
      FIRST_DEPOSIT_BONUS_AMOUNT_USDT,
      'USDT',
    );
    await WalletRepository.createLedgerEntry(tx, {
      walletId: bonusWallet.id,
      type: 'ADJUSTMENT',
      amount: FIRST_DEPOSIT_BONUS_AMOUNT_USDT,
      currency: 'USDT',
      direction: 'CREDIT',
      status: 'COMPLETED',
      referenceId: input.depositSessionId,
      description: 'First deposit promotion bonus',
      metadata: {
        promotion: 'FIRST_DEPOSIT_BONUS',
        depositSessionId: input.depositSessionId,
        depositCurrency: input.depositCurrency,
        depositAmount: input.depositAmount.toString(),
        depositUsdValue: input.depositUsdValue.toString(),
      },
      completedAt: input.completedAt,
    });

    return true;
  }
}
