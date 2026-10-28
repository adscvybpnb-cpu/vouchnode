import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { WalletRepository } from '../repositories/wallet.repository';

export const FIRST_DEPOSIT_BONUS_MINIMUM_USD = new Prisma.Decimal(50);
export const FIRST_DEPOSIT_BONUS_AMOUNT_USDT = new Prisma.Decimal(10);

export function qualifiesForFirstDepositBonus(depositUsdValue: Prisma.Decimal) {
  return depositUsdValue.gte(FIRST_DEPOSIT_BONUS_MINIMUM_USD);
}

export class FirstDepositBonusService {
  static async isEligible(userId: string) {
    const [existingBonus, completedWalletDeposit, confirmedLegacyDeposit] = await Promise.all([
      prisma.firstDepositBonus.findUnique({ where: { userId }, select: { id: true } }),
      prisma.depositSession.findFirst({
        where: { userId, orderId: null, status: 'COMPLETED' },
        select: { id: true },
      }),
      prisma.deposit.findFirst({
        where: { status: 'CONFIRMED', wallet: { userId } },
        select: { id: true },
      }),
    ]);

    return !existingBonus && !completedWalletDeposit && !confirmedLegacyDeposit;
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
    if (!qualifiesForFirstDepositBonus(input.depositUsdValue)) return false;

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

    const [priorWalletDeposit, priorLegacyDeposit] = await Promise.all([
      tx.depositSession.findFirst({
        where: {
          userId: input.userId,
          orderId: null,
          status: 'COMPLETED',
          id: { not: input.depositSessionId },
        },
        select: { id: true },
      }),
      tx.deposit.findFirst({
        where: { status: 'CONFIRMED', wallet: { userId: input.userId } },
        select: { id: true },
      }),
    ]);
    if (priorWalletDeposit || priorLegacyDeposit) return false;

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
