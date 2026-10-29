import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { WalletRepository } from '../repositories/wallet.repository';

const REFERRAL_PLATFORM_FEE_SHARE = new Prisma.Decimal('0.5');

export function calculateReferralCommission(
  platformFee: Prisma.Decimal,
) {
  return platformFee.mul(REFERRAL_PLATFORM_FEE_SHARE);
}

export class ReferralService {
  static async getOverview(userId: string) {
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    if (!user.referralCode) {
      await prisma.user.updateMany({
        where: { id: userId, referralCode: null },
        data: { referralCode: randomBytes(8).toString('hex') },
      });
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });
    }
    if (!user?.referralCode) throw new Error('Unable to create a referral link');

    const [totalFriendsInvited, earnings] = await Promise.all([
      prisma.user.count({ where: { referredById: userId } }),
      prisma.referralCommission.aggregate({
        where: { referrerId: userId, currency: 'USDT' },
        _sum: { amount: true },
      }),
    ]);

    return {
      referralCode: user.referralCode,
      totalFriendsInvited,
      totalCommissionEarned: Number(earnings._sum.amount ?? 0),
      currency: 'USDT',
    };
  }

  static async creditCompletedOrder(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      buyerId: string;
      platformFee: Prisma.Decimal;
      currency: string;
      transaction?: { id: string } | null;
    },
  ): Promise<{ referrerId: string; amount: Prisma.Decimal; currency: string } | null> {
    const buyer = await tx.user.findUnique({
      where: { id: order.buyerId },
      select: { referredById: true },
    });
    if (!buyer?.referredById) return null;

    const commission = calculateReferralCommission(order.platformFee);
    if (!commission.gt(0)) return null;

    const created = await tx.referralCommission.createMany({
      data: [{
        orderId: order.id,
        referrerId: buyer.referredById,
        referredUserId: order.buyerId,
        amount: commission,
        currency: order.currency,
      }],
      skipDuplicates: true,
    });
    if (created.count !== 1) return null;

    const wallet = await WalletRepository.getOrCreate(buyer.referredById, order.currency, tx);
    await WalletRepository.addToAvailable(tx, wallet.id, commission, order.currency);
    await WalletRepository.createLedgerEntry(tx, {
      ...(order.transaction ? { transactionId: order.transaction.id } : {}),
      walletId: wallet.id,
      type: 'REFERRAL_COMMISSION',
      amount: commission,
      currency: order.currency,
      direction: 'CREDIT',
      status: 'COMPLETED',
      referenceId: order.id,
      description: `Referral commission for completed marketplace order ${order.id}`,
    });
    return { referrerId: buyer.referredById, amount: commission, currency: order.currency };
  }
}
