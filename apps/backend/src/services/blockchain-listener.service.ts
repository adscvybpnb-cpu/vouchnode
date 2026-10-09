import { prisma } from '../lib/prisma';
import { NotificationService } from './notification.service';

/**
 * Provider-neutral deposit listener seam. A chain adapter can call
 * creditConfirmedDeposit once a transaction reaches the required confirmations.
 */
export class BlockchainListenerService {
  static async creditConfirmedDeposit(depositId: string, amount: number, txHash: string, confirmations: number) {
    const result = await prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
      if (!deposit || deposit.status === 'CONFIRMED') return deposit;
      if (confirmations < deposit.requiredConfirmations) return deposit;

      const updated = await tx.deposit.update({
        where: { id: depositId },
        data: { amount, cryptoTxHash: txHash, confirmations, status: 'CONFIRMED', confirmedAt: new Date() }
      });
      await tx.wallet.update({
        where: { id: deposit.walletId },
        data: { availableBalance: { increment: amount } }
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: deposit.walletId,
          type: 'DEPOSIT',
          amount,
          currency: deposit.currency,
          direction: 'CREDIT',
          status: 'COMPLETED',
          referenceId: deposit.id,
          description: 'Confirmed on-chain deposit'
        }
      });
      return updated;
    });
    if (result) {
      const wallet = await prisma.wallet.findUnique({ where: { id: result.walletId }, select: { userId: true } });
      if (wallet) {
        await NotificationService.createNotification({
          userId: wallet.userId, type: 'DEPOSIT_CONFIRMED', title: 'Deposit Credited',
          message: `Your automated deposit of ${amount} ${result.currency} has been successfully processed.`,
          data: { depositId: result.id, amount, currency: result.currency }, link: '/dashboard/wallet',
        });
      }
    }
    return result;
  }
}
