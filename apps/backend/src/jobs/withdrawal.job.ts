import { Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { createCryptoProvider } from '../integrations/crypto/crypto.provider';
import { config } from '../config';
import { NotificationService } from '../services/notification.service';

export const withdrawalWorker = new Worker('WITHDRAWAL_QUEUE', async job => {
  const { withdrawalId } = job.data;
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
  
  if (!withdrawal || withdrawal.status !== 'PROCESSING') return;

  const cryptoProvider = createCryptoProvider(config.crypto.provider);

  try {
    const result = await cryptoProvider.initiateWithdrawal({
      currency: withdrawal.currency,
      network: withdrawal.network || undefined,
      amount: withdrawal.netAmount,
      destinationAddress: withdrawal.destinationAddress,
      reference: `W-${withdrawal.id}`
    });

    await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: { status: 'COMPLETED', providerRef: result.providerRef, cryptoTxHash: result.txHash, processedAt: new Date() }
    });

    await prisma.ledgerEntry.updateMany({
      where: { referenceId: withdrawalId, type: 'WITHDRAWAL' },
      data: { status: 'COMPLETED', completedAt: new Date() }
    });
    const wallet = await prisma.wallet.findUnique({ where: { id: withdrawal.walletId }, select: { userId: true } });
    if (wallet) {
      await NotificationService.createNotification({
        userId: wallet.userId, type: 'WITHDRAWAL_PROCESSED', title: 'Withdrawal completed',
        message: `${withdrawal.currency} withdrawal completed successfully.`,
        data: { withdrawalId, txHash: result.txHash }, link: '/dashboard/wallet',
      });
    }
  } catch (err: any) {
    await prisma.$transaction(async (tx) => {
      await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: { status: 'FAILED', adminNote: err.message }
      });
      // Refund wallet
      await tx.wallet.update({
        where: { id: withdrawal.walletId },
        data: { availableBalance: { increment: withdrawal.amount } }
      });
      await tx.ledgerEntry.updateMany({
        where: { referenceId: withdrawalId, type: 'WITHDRAWAL' },
        data: { status: 'CANCELLED' }
      });
    });
    const wallet = await prisma.wallet.findUnique({ where: { id: withdrawal.walletId }, select: { userId: true } });
    if (wallet) {
      await NotificationService.createNotification({
        userId: wallet.userId, type: 'WITHDRAWAL_FAILED', title: 'Withdrawal failed',
        message: `Your ${withdrawal.currency} withdrawal failed and the funds were returned.`,
        data: { withdrawalId }, link: '/dashboard/wallet',
      });
    }
  }
}, { connection: redis });
