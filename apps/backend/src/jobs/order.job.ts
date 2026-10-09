import { Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { OrderService } from '../services/order.service';
import { WalletRepository } from '../repositories/wallet.repository';
import { escrowReleaseQueue } from './queue';
import { swapQueue } from './queue';
import { convertAssetAmount } from '../lib/internal-wallet';
import { Decimal } from '@prisma/client/runtime/library';

export const orderExpiryWorker = new Worker('ORDER_EXPIRY_QUEUE', async job => {
  const { orderId } = job.data;
  await OrderService.releaseUnpaidOrder(orderId, 'Payment window expired');
}, { connection: redis });

export const buyerConfirmationWorker = new Worker('BUYER_CONFIRMATION_QUEUE', async job => {
  const { orderId } = job.data;
  await OrderService.autoCompleteExpiredBuyerConfirmation(orderId);
}, { connection: redis });

export const escrowReleaseWorker = new Worker('ESCROW_RELEASE_QUEUE', async job => {
  const transactionId = job.data.transactionId as string;
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({ where: { id: transactionId } });
    if (!transaction || !transaction.escrowReleaseAt || transaction.escrowReleaseAt > new Date()) return;
    const order = await tx.order.findUnique({
      where: { id: transaction.orderId },
      select: { status: true },
    });
    if (!order || ['DISPUTE_OPEN', 'DISPUTED_WAITING_SELLER', 'DISPUTED_WAITING_BUYER', 'ESCALATED_TO_ADMIN'].includes(order.status)) return;
    const wallet = await WalletRepository.getOrCreate(transaction.sellerId, transaction.currency, tx);
    await WalletRepository.moveFromPendingToAvailable(tx, wallet.id, transaction.amount, transaction.currency);
    await tx.ledgerEntry.updateMany({
      where: { transactionId, type: 'SALE', status: 'PENDING' },
      data: { status: 'COMPLETED', completedAt: new Date() }
    });
    await tx.ledgerEntry.create({
      data: {
        transactionId,
        walletId: wallet.id,
        type: 'ESCROW_RELEASE',
        amount: transaction.amount,
        currency: transaction.currency,
        direction: 'CREDIT',
        status: 'COMPLETED',
        referenceId: transaction.orderId,
        description: '24-hour escrow hold released'
      }
    });
    await tx.transaction.update({ where: { id: transactionId }, data: { escrowReleaseAt: null } });
  });
}, { connection: redis });

export const swapWorker = new Worker('SWAP_QUEUE', async job => {
  const swapId = job.data.swapId as string;
  await prisma.$transaction(async (tx) => {
    const swap = await tx.swapTransaction.findUnique({ where: { id: swapId } });
    if (!swap || swap.status !== 'PENDING' || swap.availableAt > new Date()) return;
    // Quotes created by the current swap flow are confirmed explicitly. Never
    // settle a quote by fetching a new market price after its lock expires.
    if (!swap.lockedFromRate || !swap.lockedToRate) {
      await tx.swapTransaction.update({ where: { id: swap.id }, data: { status: 'CANCELLED' } });
      return;
    }
    const [fromCurrency, toCurrency] = await Promise.all([
      tx.currency.findUnique({ where: { code: swap.fromCurrency } }),
      tx.currency.findUnique({ where: { code: swap.toCurrency } })
    ]);
    if (!fromCurrency || !toCurrency) throw new Error('Swap currency not found');
    const source = await tx.wallet.findFirst({ where: { userId: swap.userId, currency: fromCurrency.code } });
    const target = await tx.wallet.findFirst({ where: { userId: swap.userId, currency: toCurrency.code } });
    if (!source || !target) throw new Error('Swap wallet not found');
    const gross = new Decimal(swap.amount.toString()).mul(swap.lockedFromRate.toString()).div(swap.lockedToRate.toString());
    const fee = gross.mul(0.01);
    const received = gross.sub(fee);
    await tx.wallet.update({ where: { id: source.id }, data: { pendingBalance: { decrement: swap.amount }, escrowBalance: { decrement: swap.amount } } });
    await tx.wallet.update({ where: { id: target.id }, data: { availableBalance: { increment: received } } });
    await tx.swapTransaction.update({ where: { id: swap.id }, data: { status: 'COMPLETED', expectedAmount: received, feeAmount: fee, completedAt: new Date() } });
  });
}, { connection: redis });
