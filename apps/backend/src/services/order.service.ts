import { randomUUID } from 'node:crypto';
import { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { transition } from '../state-machines/order.state-machine';
import { scheduleOrderExpiry, scheduleBuyerConfirmation, scheduleEscrowRelease, cancelJob, orderExpiryQueue, buyerConfirmationQueue } from '../jobs/queue';
import { SystemSettingsService } from '../services/system-settings.service';
import { Decimal } from '@prisma/client/runtime/library';
import { WalletRepository } from '../repositories/wallet.repository';
import { WalletService } from './wallet.service';
import { PriceService } from './price.service';
import { INTERNAL_SWAP_FEE_RATE } from '../lib/internal-wallet';
import { NotificationService } from './notification.service';
import { emitMarketplaceOrderEvent } from '../websocket/socket.server';
import { requiresManualReview } from '../config/blockchain';
import { ReferralService } from './referral.service';

const BUYER_CONFIRMATION_PERIOD_MS = 48 * 60 * 60 * 1000;

function createOrderNumber() {
  const month = new Date().toISOString().slice(0, 7).replace('-', '');
  return `GF-${month}-${randomUUID().replaceAll('-', '').toUpperCase()}`;
}

export class OrderService {
  private static async scheduleBuyerConfirmationForOrder(orderId: string, deadline: Date) {
    try {
      const timerJob = await scheduleBuyerConfirmation(
        orderId,
        Math.max(0, deadline.getTime() - Date.now()),
      );
      await prisma.order.updateMany({
        where: { id: orderId, status: 'PAID', escrowDeadline: deadline },
        data: { buyerTimerJobId: timerJob.id },
      });
    } catch (error) {
      console.error(`Unable to schedule buyer confirmation for order ${orderId}; deadline scanner remains authoritative:`, error);
    }
  }

  private static async holdSellerFunds(tx: any, orderId: string) {
    const transaction = await tx.transaction.findUnique({ where: { orderId } });
    if (!transaction) return;
    const wallet = await WalletRepository.getOrCreate(transaction.sellerId, transaction.currency);
    const releaseAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await WalletRepository.addToPending(tx, wallet.id, transaction.amount, transaction.currency);
    await WalletRepository.createLedgerEntry(tx, {
      transactionId: transaction.id, walletId: wallet.id, type: 'SALE',
      amount: transaction.amount, currency: transaction.currency, direction: 'CREDIT',
      status: 'PENDING', referenceId: orderId, description: 'Sale held in escrow for 24 hours'
    });
    await tx.transaction.update({ where: { id: transaction.id }, data: { escrowReleaseAt: releaseAt } });
    await scheduleEscrowRelease(transaction.id, 24 * 60 * 60 * 1000);
  }

  private static async completeDepositSession(
    tx: Prisma.TransactionClient,
    orderId: string,
    txHash: string,
    depositAmount?: number,
    required = false,
  ) {
    const session = await tx.depositSession.findFirst({
      where: { orderId },
      select: { id: true, userId: true, currency: true, status: true, transactionHash: true, assignedAddress: true, network: true },
    });
    if (!session) {
      if (required) throw new Error(`Direct invoice order ${orderId} has no linked deposit session`);
      return;
    }
    if (session.status !== 'COMPLETED') {
      if (session.status !== 'PENDING' || (session.transactionHash && session.transactionHash !== txHash)) {
        throw new Error(`Deposit session ${session.id} cannot be completed for transaction ${txHash}`);
      }
      const completed = await tx.depositSession.updateMany({
        where: {
          id: session.id,
          status: 'PENDING',
          ...(session.transactionHash ? { transactionHash: txHash } : { transactionHash: null }),
        },
        data: {
          status: 'COMPLETED',
          transactionHash: txHash,
          completedAt: new Date(),
          ...(depositAmount !== undefined ? { amount: new Prisma.Decimal(depositAmount) } : {}),
        },
      });
      if (completed.count !== 1) throw new Error(`Deposit session ${session.id} changed while payment was being confirmed`);
    } else if (session.transactionHash !== txHash) {
      throw new Error(`Deposit session ${session.id} was completed by a different transaction`);
    }

    await tx.cryptoDeposit.updateMany({
      where: { address: session.assignedAddress, network: session.network, status: 'PENDING' },
      data: { status: 'SUCCESS' },
    });
    await tx.staticAddressPool.updateMany({
      where: { address: session.assignedAddress, status: 'BUSY' },
      data: { status: 'AVAILABLE', orderId: null, expiresAt: null },
    });
    if (required) {
      const buyerWallet = await WalletRepository.getOrCreate(session.userId, session.currency, tx);
      await tx.ledgerEntry.updateMany({
        where: {
          referenceId: session.id,
          walletId: buyerWallet.id,
          type: { in: ['DEPOSIT', 'PURCHASE'] },
          status: { in: ['PENDING', 'COMPLETED'] },
        },
        data: {
          type: 'PURCHASE',
          amount: depositAmount !== undefined ? new Prisma.Decimal(depositAmount) : undefined,
          currency: session.currency,
          direction: 'DEBIT',
          status: 'COMPLETED',
          completedAt: new Date(),
          description: `Direct invoice order payment confirmed (${session.network}, ${txHash})`,
        },
      });
    }
  }

  static async ensureDirectInvoiceEscrow(tx: Prisma.TransactionClient, orderId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`direct-invoice-escrow:${orderId}`}))`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        sellerAmount: true,
        transaction: {
          select: { id: true, sellerId: true, currency: true, status: true, cryptoTxHash: true, metadata: true },
        },
      },
    });
    const transaction = order?.transaction;
    const paymentMethod = transaction?.metadata && typeof transaction.metadata === 'object'
      ? (transaction.metadata as { paymentMethod?: string }).paymentMethod
      : undefined;
    if (!order || !transaction || paymentMethod !== 'DIRECT_INVOICE') {
      throw new Error('Confirmed direct invoice transaction not found');
    }
    if (!transaction.cryptoTxHash) throw new Error('Direct invoice has no verified transaction hash');
    if (transaction.status !== 'COMPLETED') {
      const completed = await tx.transaction.updateMany({
        where: {
          id: transaction.id,
          status: { in: ['PENDING', 'CONFIRMING'] },
          cryptoTxHash: transaction.cryptoTxHash,
        },
        data: { status: 'COMPLETED', confirmedAt: new Date() },
      });
      if (completed.count !== 1) {
        throw Object.assign(new Error('Direct invoice transaction is not confirmed'), { statusCode: 409 });
      }
    }

    const sellerWallet = await WalletRepository.getOrCreate(transaction.sellerId, transaction.currency, tx);
    const activeSale = await tx.ledgerEntry.findFirst({
      where: { transactionId: transaction.id, walletId: sellerWallet.id, type: 'SALE', status: 'PENDING' },
      select: { id: true, amount: true },
    });
    if (activeSale) {
      const previousSales = await tx.ledgerEntry.aggregate({
        where: { walletId: sellerWallet.id, type: 'SALE', status: 'PENDING' },
        _sum: { amount: true },
      });
      const previousSalesTotal = previousSales._sum.amount ?? new Prisma.Decimal(0);
      const currentWallet = await tx.wallet.findUniqueOrThrow({
        where: { id: sellerWallet.id },
        select: { pendingBalance: true },
      });
      const nextSalesTotal = previousSalesTotal.sub(activeSale.amount).add(order.sellerAmount);
      const otherPendingBalance = Prisma.Decimal.max(
        currentWallet.pendingBalance.sub(previousSalesTotal),
        new Prisma.Decimal(0),
      );
      const targetPendingBalance = otherPendingBalance.add(nextSalesTotal);
      if (!targetPendingBalance.equals(currentWallet.pendingBalance)) {
        await tx.wallet.update({
          where: { id: sellerWallet.id },
          data: targetPendingBalance.gt(currentWallet.pendingBalance)
            ? { pendingBalance: { increment: targetPendingBalance.sub(currentWallet.pendingBalance) } }
            : { pendingBalance: { decrement: currentWallet.pendingBalance.sub(targetPendingBalance) } },
        });
      }
      await tx.ledgerEntry.update({
        where: { id: activeSale.id },
        data: {
          amount: order.sellerAmount,
          currency: transaction.currency,
          referenceId: order.id,
          description: 'Direct invoice payment held in escrow',
        },
      });
    } else {
      const priorSale = await tx.ledgerEntry.findFirst({
        where: { transactionId: transaction.id, type: 'SALE' },
        select: { status: true },
      });
      if (priorSale) {
        throw Object.assign(new Error('Direct invoice escrow was already settled'), { statusCode: 409 });
      }
      await WalletRepository.createLedgerEntry(tx, {
        transactionId: transaction.id,
        walletId: sellerWallet.id,
        type: 'SALE',
        amount: order.sellerAmount,
        currency: transaction.currency,
        direction: 'CREDIT',
        status: 'PENDING',
        referenceId: order.id,
        description: 'Direct invoice payment held in escrow',
      });
    }

    const pendingSales = await tx.ledgerEntry.aggregate({
      where: { walletId: sellerWallet.id, type: 'SALE', status: 'PENDING' },
      _sum: { amount: true },
    });
    const pendingSalesTotal = pendingSales._sum.amount ?? new Prisma.Decimal(0);
    const pendingBalance = await tx.wallet.findUniqueOrThrow({
      where: { id: sellerWallet.id },
      select: { pendingBalance: true },
    });
    if (pendingBalance.pendingBalance.lt(pendingSalesTotal)) {
      await tx.wallet.update({
        where: { id: sellerWallet.id },
        data: { pendingBalance: { increment: pendingSalesTotal.sub(pendingBalance.pendingBalance) } },
      });
    }
  }

  static async createOrder(buyerId: string, productId: string, quantity: number, paymentMethod?: 'DIRECT_INVOICE') {
    const product = await prisma.product.findUnique({ where: { id: productId }, include: { seller: true } });
    if (!product || product.status !== 'ACTIVE') throw new Error('Product not available');
    if (product.seller.userId === buyerId) throw new Error('Cannot buy your own product');

    const isDirectInvoice = paymentMethod === 'DIRECT_INVOICE';

    if (product.deliveryType === 'INSTANT') {
      const availableInv = await prisma.productInventory.count({
        where: { productId, isDelivered: false, orderId: null },
      });
      if (availableInv < quantity) throw new Error('Insufficient inventory');
    }

    const platformFeePercent = await SystemSettingsService.getSetting('platform_fee_percent', 2.5);
    const unitPrice = parseFloat(product.currentPrice.toString());
    const totalAmount = unitPrice * quantity;
    const platformFee = (totalAmount * platformFeePercent) / 100;
    const sellerAmount = totalAmount - platformFee;

    const paymentDeadlineHours = await SystemSettingsService.getSetting('order_payment_timeout_hours', 24);
    const paymentTimeoutMs = isDirectInvoice ? 60 * 60 * 1000 : paymentDeadlineHours * 3600000;
    const paymentDeadline = new Date(Date.now() + paymentTimeoutMs);

    const order = await prisma.$transaction(async (tx) => {
      const stockClaim = await tx.product.updateMany({
        where: { id: productId, status: 'ACTIVE', stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (stockClaim.count !== 1) throw new Error('Insufficient stock');

      const orderNumber = createOrderNumber();
      const order = await tx.order.create({
        data: {
          orderNumber,
          buyerId,
          sellerId: product.seller.userId,
          productId,
          quantity,
          unitPrice,
          totalAmount,
          platformFee,
          sellerAmount,
          currency: product.currency,
          status: 'PAYMENT_PENDING',
          paymentDeadline,
        },
      });

      if (isDirectInvoice && product.deliveryType === 'INSTANT') {
        const availableInventory = await tx.productInventory.findMany({
          where: { productId, isDelivered: false, orderId: null },
          orderBy: { createdAt: 'asc' },
          take: quantity,
          select: { id: true },
        });
        if (availableInventory.length !== quantity) throw new Error('Insufficient inventory');
        const reservations = await Promise.all(availableInventory.map(({ id }) =>
          tx.productInventory.updateMany({
            where: { id, isDelivered: false, orderId: null },
            data: { orderId: order.id },
          }),
        ));
        if (reservations.some(({ count }) => count !== 1)) {
          throw new Error('Inventory was reserved by another checkout; please try again');
        }
      }

      await tx.transaction.create({
        data: {
          orderId: order.id,
          buyerId,
          sellerId: product.seller.userId,
          amount: totalAmount,
          currency: product.currency,
          status: 'PENDING',
          metadata: paymentMethod ? { paymentMethod } : undefined
        }
      });

      if (!isDirectInvoice) {
        await tx.conversation.create({
          data: {
            orderId: order.id,
            productId,
            buyerId,
            sellerId: product.seller.userId,
            isActive: false
          }
        });
      }

      return order;
    }, { maxWait: 30_000, timeout: 60_000 });

    try {
      const job = await scheduleOrderExpiry(order.id, paymentTimeoutMs);
      const jobId = job.id ?? `order-expire-${order.id}`;
      const scheduled = await prisma.order.updateMany({
        where: { id: order.id, status: 'PAYMENT_PENDING' },
        data: { paymentTimerJobId: jobId },
      });
      if (scheduled.count !== 1) await cancelJob(orderExpiryQueue, jobId);
      const notificationResults = await Promise.allSettled([
        NotificationService.createNotification({
          userId: buyerId, type: 'ORDER_NEW', title: 'Order placed',
          message: `Your order ${order.orderNumber} is awaiting payment.`,
          data: { orderId: order.id }, link: `/dashboard/orders/${order.id}`,
        }),
        NotificationService.createNotification({
          userId: product.seller.userId, type: 'SALE_NEW', title: 'New sale',
          message: `A new order for ${product.name} was placed.`,
          data: { orderId: order.id }, link: `/dashboard/orders/${order.id}`,
        }),
      ]);
      notificationResults.forEach((result) => {
        if (result.status === 'rejected') {
          logger.error({
            orderId: order.id,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          }, 'Unable to create order placement notification');
        }
      });
      return { ...order, paymentTimerJobId: scheduled.count === 1 ? jobId : null };
    } catch (error) {
      try {
        await this.releaseUnpaidOrder(order.id, 'Unable to schedule order payment expiry', false);
      } catch (cleanupError) {
        console.error(`Unable to release order ${order.id} after its expiry timer failed:`, cleanupError);
      }
      throw error;
    }
  }

  static async releaseUnpaidOrder(orderId: string, reason: string, onlyIfExpired = true) {
    const now = new Date();
    const released = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) return false;
      const alreadyCancelled = order.status === 'CANCELLED';
      if (!alreadyCancelled && !['PAYMENT_PENDING', 'PENDING_MANUAL_REVIEW'].includes(order.status)) return false;
      if (!alreadyCancelled && onlyIfExpired && (!order.paymentDeadline || order.paymentDeadline > now)) return false;

      const session = await tx.depositSession.findFirst({
        where: { orderId },
        select: {
          id: true,
          assignedAddress: true,
          network: true,
          status: true,
          transactionHash: true,
          detectedDeposits: {
            where: { status: { in: ['DETECTED', 'CONFIRMING', 'CONFIRMED', 'SETTLING', 'MANUAL_REVIEW'] } },
            select: { id: true },
            take: 1,
          },
        },
      });
      if (session?.transactionHash || session?.detectedDeposits.length) return false;

      if (alreadyCancelled) {
        await tx.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'FAILED', deliveryStatus: 'FAILED' },
        });
        await tx.transaction.updateMany({
          where: { orderId, status: { in: ['PENDING', 'CONFIRMING'] } },
          data: { status: 'CANCELLED' },
        });
        return true;
      }

      if (session) {
        if (session.status === 'PENDING') {
          const expiredSession = await tx.depositSession.updateMany({
            where: { id: session.id, status: 'PENDING', transactionHash: null },
            data: { status: 'EXPIRED', updatedAt: now },
          });
          if (expiredSession.count !== 1) return false;
        } else if (!['EXPIRED', 'CANCELLED'].includes(session.status)) {
          return false;
        }
      }

      await transition(order, 'CANCELLED', tx, null, 'SYSTEM', reason);
      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'FAILED', deliveryStatus: 'FAILED' },
      });
      await tx.transaction.updateMany({
        where: { orderId, status: { in: ['PENDING', 'CONFIRMING'] } },
        data: { status: 'CANCELLED' },
      });
      if (session) {
        await tx.ledgerEntry.updateMany({
          where: { referenceId: session.id, type: 'DEPOSIT', status: 'PENDING' },
          data: { status: 'CANCELLED', completedAt: now },
        });
        await tx.cryptoDeposit.updateMany({
          where: { address: session.assignedAddress, network: session.network, status: 'PENDING' },
          data: { status: 'EXPIRED' },
        });
        await tx.staticAddressPool.updateMany({
          where: { orderId, status: 'BUSY' },
          data: { status: 'AVAILABLE', orderId: null, expiresAt: null },
        });
      }

      await tx.productInventory.updateMany({
        where: { orderId, isDelivered: false },
        data: { orderId: null },
      });
      await tx.product.updateMany({
        where: { id: order.productId },
        data: { stock: { increment: order.quantity } },
      });
      await tx.product.updateMany({
        where: { id: order.productId, status: 'SOLD_OUT' },
        data: { status: 'ACTIVE' },
      });
      return true;
    });

    if (released) {
      emitMarketplaceOrderEvent(orderId, 'order_updated', {
        orderId,
        status: 'CANCELLED',
        reason: 'PAYMENT_WINDOW_EXPIRED',
      });
    }
    return released;
  }

  static async payWithWallet(buyerId: string, productId: string, quantity: number, autoConvert = false, requestedSourceAsset?: string) {
    const product = await prisma.product.findUnique({ where: { id: productId }, include: { seller: true } });
    if (!product || product.status !== 'ACTIVE') throw new Error('Product not available');
    if (product.seller.userId === buyerId) throw new Error('Cannot buy your own product');

    const unitPrice = new Decimal(product.currentPrice);
    const totalAmount = unitPrice.mul(quantity);
    if (totalAmount.lte(0)) throw new Error('Product price must be greater than zero');

    const livePrices = autoConvert ? await PriceService.getUsdPrices(true) : {};
    const sourceAsset = requestedSourceAsset?.trim().toUpperCase();
    const [buyerWallets, usdtWallet] = await Promise.all([
      autoConvert ? WalletRepository.getByUserId(buyerId) : Promise.resolve([]),
      WalletRepository.getOrCreate(buyerId, 'USDT')
    ]);
    const currentUsdt = new Decimal(usdtWallet.availableBalance);
    let conversionAmount = new Decimal(0);
    let conversionRate = 0;
    let sourceWallet: (typeof buyerWallets)[number] | null = null;
    if (autoConvert && currentUsdt.lt(totalAmount)) {
      const candidates = buyerWallets
        .filter((wallet) => wallet.currency !== 'USDT' && wallet.currency !== 'USD')
        .map((wallet) => ({ wallet, rate: livePrices[wallet.currency] ?? 0 }))
        .filter((candidate) => candidate.rate > 0 && new Decimal(candidate.wallet.availableBalance).gt(0))
        .sort((left, right) => Number(right.wallet.availableBalance) * right.rate - Number(left.wallet.availableBalance) * left.rate);
      const selected = sourceAsset ? candidates.find((candidate) => candidate.wallet.currency === sourceAsset) : candidates[0];
      if (!selected) throw new Error('No volatile asset is available for auto-conversion');
      conversionRate = selected.rate;
      const shortfall = totalAmount.sub(currentUsdt);
      conversionAmount = shortfall.div(new Decimal(conversionRate).mul(new Decimal(1).sub(INTERNAL_SWAP_FEE_RATE)));
      sourceWallet = selected.wallet;
      if (new Decimal(sourceWallet.availableBalance).lt(conversionAmount)) throw new Error('Volatile wallet balance is insufficient after conversion fees');
    }

    const buyerConfirmationPeriodHours = product.deliveryType === 'INSTANT' ? 48 : 0;
    const platformFeePercent = await SystemSettingsService.getSetting('platform_fee_percent', 2.5);
    const result = await prisma.$transaction(async (tx) => {
      const stockClaim = await tx.product.updateMany({
        where: { id: productId, status: 'ACTIVE', stock: { gte: quantity } },
        data: {
          stock: { decrement: quantity },
          status: 'SOLD',
        },
      });
      if (stockClaim.count !== 1) throw new Error('Insufficient stock');
      if (product.deliveryType === 'INSTANT') {
        const inventoryCount = await tx.productInventory.count({ where: { productId, isDelivered: false, orderId: null } });
        if (inventoryCount < quantity) throw new Error('Insufficient inventory');
      }

      const usdt = await WalletRepository.getOrCreate(buyerId, 'USDT', tx);
      if (conversionAmount.gt(0) && sourceWallet) {
        await WalletRepository.deductFromAvailable(tx, sourceWallet.id, conversionAmount, sourceWallet.currency);
        const usdtCredit = conversionAmount.mul(conversionRate).mul(new Decimal(1).sub(INTERNAL_SWAP_FEE_RATE));
        await WalletRepository.addToAvailable(tx, usdt.id, usdtCredit, 'USDT');
        await WalletRepository.createLedgerEntry(tx, {
          walletId: sourceWallet.id, type: 'SWAP', amount: conversionAmount, currency: sourceWallet.currency,
          direction: 'DEBIT', status: 'COMPLETED', description: `Auto-converted to USDT at locked rate ${conversionRate}`
        });
        await WalletRepository.createLedgerEntry(tx, {
          walletId: usdt.id, type: 'SWAP', amount: usdtCredit, currency: 'USDT',
          direction: 'CREDIT', status: 'COMPLETED', description: `Auto-converted from ${sourceWallet.currency}`
        });
      }
      await WalletRepository.deductFromAvailable(tx, usdt.id, totalAmount, 'USDT');

      const platformFee = totalAmount.mul(platformFeePercent).div(100);
      const sellerAmount = totalAmount.sub(platformFee);
      const orderNumber = createOrderNumber();
      const order = await tx.order.create({
        data: {
          orderNumber, buyerId, sellerId: product.seller.userId, productId, quantity,
          unitPrice, totalAmount, platformFee, sellerAmount, currency: 'USDT',
          status: product.deliveryType === 'INSTANT' ? 'WAITING_BUYER_CONFIRMATION' : 'PAID',
          paymentStatus: 'COMPLETED',
          deliveryStatus: product.deliveryType === 'INSTANT' ? 'DELIVERED' : 'PROCESSING'
        },
        include: { product: true, transaction: true }
      });

      const transaction = await tx.transaction.create({
        data: {
          orderId: order.id, buyerId, sellerId: product.seller.userId,
          amount: sellerAmount, currency: 'USDT', status: 'COMPLETED',
          metadata: { paymentMethod: 'WALLET', autoConverted: conversionAmount.gt(0), sourceAsset: sourceWallet?.currency ?? null, conversionRate }
        }
      });
      await WalletRepository.createLedgerEntry(tx, {
        transactionId: transaction.id, walletId: usdt.id, type: 'PURCHASE',
        amount: totalAmount, currency: 'USDT', direction: 'DEBIT',
        status: 'COMPLETED', referenceId: order.id, description: 'Wallet payment for marketplace order'
      });

      const sellerWallet = await WalletRepository.getOrCreate(product.seller.userId, 'USDT', tx);
      await WalletRepository.addToPending(tx, sellerWallet.id, sellerAmount, 'USDT');
      await WalletRepository.createLedgerEntry(tx, {
        transactionId: transaction.id, walletId: sellerWallet.id, type: 'SALE',
        amount: sellerAmount, currency: 'USDT', direction: 'CREDIT',
        status: 'PENDING', referenceId: order.id, description: 'Wallet sale held in escrow until buyer confirmation'
      });

      if (product.deliveryType === 'INSTANT') {
        const inventory = await tx.productInventory.findMany({
          where: { productId, isDelivered: false, orderId: null },
          take: quantity,
        });
        if (inventory.length !== quantity) throw new Error('Insufficient inventory');
        for (const item of inventory) {
          const claimed = await tx.productInventory.updateMany({
            where: { id: item.id, isDelivered: false, orderId: null },
            data: { isDelivered: true, deliveredAt: new Date(), orderId: order.id }
          });
          if (claimed.count !== 1) throw new Error('Inventory was claimed by another order; please retry');
        }
      }

      let buyerConfirmationDeadline: Date | undefined;
      if (product.deliveryType === 'INSTANT') {
        buyerConfirmationDeadline = new Date(Date.now() + buyerConfirmationPeriodHours * 3600000);
        await tx.order.update({
          where: { id: order.id },
          data: { buyerConfirmationDeadline, escrowDeadline: buyerConfirmationDeadline },
        });
      }
      await tx.conversation.create({
        data: {
          orderId: order.id,
          productId,
          buyerId,
          sellerId: product.seller.userId,
          isActive: false
        }
      });
      return { ...order, transaction };
    });

    if (product.deliveryType === 'INSTANT') {
      void scheduleBuyerConfirmation(result.id, buyerConfirmationPeriodHours * 3600000)
        .then((timerJob) => prisma.order.update({
          where: { id: result.id },
          data: { buyerTimerJobId: timerJob.id },
        }))
        .catch((error) => console.error(`Unable to schedule buyer confirmation for order ${result.id}:`, error));
    }
    void Promise.all([
      NotificationService.createNotification({
        userId: buyerId, type: 'PAYMENT_RECEIVED', title: 'Payment confirmed',
        message: `Payment for ${product.name} was confirmed.`,
        data: { orderId: result.id }, link: `/dashboard/orders/${result.id}`,
      }),
      NotificationService.createNotification({
        userId: product.seller.userId, type: 'SALE_NEW', title: 'Sale payment received',
        message: `Payment was received for ${product.name}.`,
        data: { orderId: result.id }, link: `/dashboard/orders/${result.id}`,
      }),
    ]).catch((error) => console.error(`Unable to send wallet payment notifications for order ${result.id}:`, error));
    return result;
  }

  static async processPaymentConfirmed(
    orderId: string,
    txHash: string,
    amount: number | string,
    providerTxId?: string,
    confirmation?: { blockNumber?: number; network?: string; depositAmount?: number },
    validateProviderAmount = false,
  ) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { transaction: true, product: true, depositSession: { select: { amount: true } } },
    });
    if (!order) throw new Error('Invalid order state');
    if (validateProviderAmount) {
      let paidAmount: Prisma.Decimal;
      try {
        paidAmount = new Prisma.Decimal(amount);
      } catch {
        throw new Error('Invalid payment amount');
      }
      if (!paidAmount.isFinite()) throw new Error('Invalid payment amount');
      const expectedAmount = order.depositSession?.amount ?? order.transaction?.amount ?? order.totalAmount;
      if (paidAmount.lt(expectedAmount)) throw new Error('Payment amount is below the expected amount');
    }
    const paymentMethod = order.transaction?.metadata &&
      typeof order.transaction.metadata === 'object' &&
      (order.transaction.metadata as { paymentMethod?: string }).paymentMethod;
    const requiresDepositSession = paymentMethod === 'DIRECT_INVOICE';
    const paymentNotificationInputs = [
      {
        userId: order.buyerId,
        type: 'PAYMENT_RECEIVED',
        title: 'Payment confirmed',
        message: `Payment for order ${order.orderNumber} was confirmed.`,
        data: { orderId },
        link: `/dashboard/orders/${orderId}`,
        dedupeKey: `order-payment:${orderId}:buyer`,
      },
      {
        userId: order.sellerId,
        type: 'ORDER_UPDATE',
        title: 'Order paid',
        message: `Order ${order.orderNumber} has been paid and is ready for fulfillment.`,
        data: { orderId },
        link: `/dashboard/orders/${orderId}`,
        dedupeKey: `order-payment:${orderId}:seller`,
      },
      ...(paymentMethod === 'DIRECT_INVOICE' ? [{
        userId: order.sellerId,
        type: 'SALE_NEW',
        title: 'New sale',
        message: `A new order for ${order.product.name} was paid by crypto invoice.`,
        data: { orderId },
        link: `/dashboard/orders/${orderId}`,
        dedupeKey: `order-sale:${orderId}:seller`,
      }] : []),
    ];
    const ensurePaymentNotifications = async (tx: Prisma.TransactionClient) =>
      Promise.all(paymentNotificationInputs.map(async (input) => {
        const existing = await tx.notification.findFirst({
          where: { userId: input.userId, dedupeKey: input.dedupeKey },
        });
        return existing ?? NotificationService.createInTransaction(tx, input);
      }));
    const emitPaymentNotifications = (
      notifications: Awaited<ReturnType<typeof ensurePaymentNotifications>>,
    ) => {
      for (const notification of notifications) {
        try {
          NotificationService.emit(notification);
        } catch (error) {
          logger.error(
            { orderId, notificationId: notification.id, error: error instanceof Error ? error.message : String(error) },
            'Payment committed but real-time notification delivery failed',
          );
        }
      }
    };
    if (order.status === 'PAID' && order.transaction?.cryptoTxHash === txHash) {
      const notifications = await prisma.$transaction(async (tx) => {
        if (requiresDepositSession && order.transaction) {
          await this.ensureDirectInvoiceEscrow(tx, orderId);
        }
        await this.completeDepositSession(tx, orderId, txHash, confirmation?.depositAmount, requiresDepositSession);
        return ensurePaymentNotifications(tx);
      });
      emitPaymentNotifications(notifications);
      emitMarketplaceOrderEvent(orderId, 'order_updated', {
        orderId,
        status: 'PAID',
        paymentStatus: 'COMPLETED',
        reason: 'CHAIN_CONFIRMED_ESCROW_HELD',
      });
      if (order.product.deliveryType === 'INSTANT' && order.escrowDeadline) {
        await this.scheduleBuyerConfirmationForOrder(orderId, order.escrowDeadline);
      }
      return;
    }
    if (!['PAYMENT_PENDING', 'PENDING_MANUAL_REVIEW'].includes(order.status)) throw new Error('Invalid order state');

    let buyerConfirmationDeadline: Date | null = null;
    let paymentTimerJobId: string | null = null;
    let paymentNotifications: Awaited<ReturnType<typeof ensurePaymentNotifications>> = [];
    const didTransition = await prisma.$transaction(async (tx): Promise<boolean> => {
      const currentOrderInTx = await tx.order.findUnique({ where: { id: orderId }, include: { transaction: true, product: true } });
      if (!currentOrderInTx || !['PAYMENT_PENDING', 'PENDING_MANUAL_REVIEW'].includes(currentOrderInTx.status)) {
        if (currentOrderInTx?.status === 'PAID' && currentOrderInTx.transaction?.cryptoTxHash === txHash) {
          if (requiresDepositSession && currentOrderInTx.transaction) {
            await this.ensureDirectInvoiceEscrow(tx, orderId);
          }
          await this.completeDepositSession(tx, orderId, txHash, confirmation?.depositAmount, requiresDepositSession);
          paymentNotifications = await ensurePaymentNotifications(tx);
          return false;
        }
        throw new Error(`Order ${orderId} is no longer awaiting this payment`);
      }

      await transition(currentOrderInTx, 'PAID', tx, null, 'SYSTEM', 'Payment confirmed');

      if (order.product.deliveryType === 'INSTANT') {
        buyerConfirmationDeadline = new Date(Date.now() + BUYER_CONFIRMATION_PERIOD_MS);
        const reservedItems = await tx.productInventory.findMany({
          where: { productId: order.productId, isDelivered: false, orderId: order.id },
          take: order.quantity,
          select: { id: true },
        });
        const availableItems = reservedItems.length < order.quantity
          ? await tx.productInventory.findMany({
            where: { productId: order.productId, isDelivered: false, orderId: null },
            take: order.quantity - reservedItems.length,
            select: { id: true },
          })
          : [];
        const inventoryToDeliver = [...reservedItems, ...availableItems];
        if (inventoryToDeliver.length !== order.quantity) throw new Error('Insufficient inventory to fulfill this order');

        const claimedItems = await Promise.all(inventoryToDeliver.map((item) =>
          tx.productInventory.updateMany({
            where: {
              id: item.id,
              isDelivered: false,
              OR: [{ orderId: order.id }, { orderId: null }],
            },
            data: { isDelivered: true, deliveredAt: new Date(), orderId: order.id },
          }),
        ));
        if (claimedItems.reduce((total, result) => total + result.count, 0) !== order.quantity) {
          throw new Error('Inventory was claimed by another order; please retry');
        }

        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'COMPLETED',
            deliveryStatus: 'DELIVERED',
            buyerConfirmationDeadline,
            escrowDeadline: buyerConfirmationDeadline,
          },
        });
      } else {
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'COMPLETED', deliveryStatus: 'PROCESSING' },
        });
      }

      await tx.transaction.update({
        where: { id: order.transaction!.id },
        data: {
          status: 'COMPLETED',
          cryptoTxHash: txHash,
          confirmedAt: new Date(),
          ...(providerTxId ? { providerTxId } : {}),
          ...(confirmation?.blockNumber !== undefined && confirmation.network ? {
            confirmationBlock: BigInt(confirmation.blockNumber),
            confirmationNetwork: confirmation.network,
            confirmations: 0,
            requiredConfirmations: 3,
          } : {}),
        }
      });
      await this.completeDepositSession(tx, orderId, txHash, confirmation?.depositAmount, requiresDepositSession);

      if (requiresDepositSession) {
        await this.ensureDirectInvoiceEscrow(tx, orderId);
      } else {
        const sellerWallet = await WalletRepository.getOrCreate(order.sellerId, order.currency, tx);
        await WalletRepository.addToPending(tx, sellerWallet.id, order.sellerAmount, order.currency);
        await WalletRepository.createLedgerEntry(tx, {
          transactionId: order.transaction!.id,
          walletId: sellerWallet.id,
          type: 'SALE',
          amount: order.sellerAmount,
          currency: order.currency,
          direction: 'CREDIT',
          status: 'PENDING',
          referenceId: order.id,
          description: 'Direct invoice payment held in escrow',
        });
      }

      await tx.conversation.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          productId: order.productId,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          isActive: true,
        },
        update: { isActive: true },
      });

      paymentNotifications = await ensurePaymentNotifications(tx);
      paymentTimerJobId = order.paymentTimerJobId;
      return true;
    }, { maxWait: 30_000, timeout: 60_000 });
    emitPaymentNotifications(paymentNotifications);
    if (!didTransition) {
      emitMarketplaceOrderEvent(orderId, 'order_updated', {
        orderId,
        status: 'PAID',
        paymentStatus: 'COMPLETED',
        reason: 'CHAIN_CONFIRMED_ESCROW_HELD',
      });
      if (order.product.deliveryType === 'INSTANT' && order.escrowDeadline) {
        await this.scheduleBuyerConfirmationForOrder(orderId, order.escrowDeadline);
      }
      return;
    }
    if (paymentTimerJobId) {
      try {
        await cancelJob(orderExpiryQueue, paymentTimerJobId);
      } catch (error) {
        console.error(`Unable to cancel payment expiry job ${paymentTimerJobId} for paid order ${orderId}:`, error);
      }
    }
    emitMarketplaceOrderEvent(orderId, 'order_updated', {
      orderId,
      status: 'PAID',
      paymentStatus: 'COMPLETED',
      reason: 'CHAIN_CONFIRMED_ESCROW_HELD',
    });
    if (buyerConfirmationDeadline) {
      await this.scheduleBuyerConfirmationForOrder(orderId, buyerConfirmationDeadline);
    }
  }

  static async markManualPaymentReview(orderId: string, txHash: string, asset: string, network: string) {
    if (!requiresManualReview(asset, network)) throw new Error('This asset uses automated confirmation');
    const session = await prisma.depositSession.findFirst({
      where: { orderId },
      select: { id: true },
    });
    if (!session) throw new Error(`Direct invoice order ${orderId} has no deposit session`);
    const flagged = await prisma.$transaction((tx) =>
      this.flagDepositForManualReviewInTransaction(tx, {
        orderId,
        sessionId: session.id,
        txHash,
        asset,
        network,
        reason: 'This deposit requires manual payment review',
      }),
    );
    if (!flagged) throw new Error('Order is not awaiting payment');
    emitMarketplaceOrderEvent(orderId, 'order_updated', {
      orderId,
      status: 'PENDING_MANUAL_REVIEW',
      paymentStatus: 'PENDING',
      reason: 'DEPOSIT_REQUIRES_MANUAL_REVIEW',
    });
  }

  static async flagDepositForManualReviewInTransaction(
    tx: Prisma.TransactionClient,
    input: { orderId: string; sessionId: string; txHash: string; asset: string; network: string; reason: string },
  ) {
    const session = await tx.depositSession.findFirst({
      where: { id: input.sessionId, orderId: input.orderId },
      select: { id: true, transactionHash: true },
    });
    if (!session) throw new Error(`Deposit session ${input.sessionId} is not linked to order ${input.orderId}`);
    if (session.transactionHash && session.transactionHash !== input.txHash) {
      throw new Error(`Deposit session ${session.id} is already linked to another transaction`);
    }
    const claimedSession = await tx.depositSession.updateMany({
      where: {
        id: session.id,
        orderId: input.orderId,
        OR: [{ transactionHash: null }, { transactionHash: input.txHash }],
      },
      data: { transactionHash: input.txHash },
    });
    if (claimedSession.count !== 1) throw new Error(`Deposit session ${session.id} changed while being placed into manual review`);

    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { transaction: true },
    });
    if (!order || !['PAYMENT_PENDING', 'PENDING_MANUAL_REVIEW'].includes(order.status)) return false;

    if (order.transaction) {
      if (order.transaction.cryptoTxHash && order.transaction.cryptoTxHash !== input.txHash) {
        throw new Error(`Order ${order.id} is already linked to another payment transaction`);
      }
      const existingMetadata = order.transaction.metadata &&
        typeof order.transaction.metadata === 'object' &&
        !Array.isArray(order.transaction.metadata)
        ? order.transaction.metadata as Prisma.JsonObject
        : {};
      await tx.transaction.update({
        where: { id: order.transaction.id },
        data: {
          cryptoTxHash: input.txHash,
          metadata: { ...existingMetadata, depositAsset: input.asset, depositNetwork: input.network },
        },
      });
    }
    if (order.status === 'PAYMENT_PENDING') {
      await transition(order, 'PENDING_MANUAL_REVIEW', tx, null, 'SYSTEM', input.reason);
    }
    return true;
  }

  static async approveManualPayment(orderId: string, adminId: string, txHash: string, amount: number) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { transaction: true } });
    if (!order || order.status !== 'PENDING_MANUAL_REVIEW') throw new Error('Order is not pending manual review');
    const metadata = order.transaction?.metadata && typeof order.transaction.metadata === 'object'
      ? order.transaction.metadata as { depositAsset?: string; depositNetwork?: string }
      : {};
    if (!metadata.depositAsset || !metadata.depositNetwork ||
      !requiresManualReview(metadata.depositAsset, metadata.depositNetwork)) {
      throw new Error('This order is not configured for manual review');
    }
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('A positive payment amount is required');

    await this.processPaymentConfirmed(orderId, txHash, amount);
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorType: 'ADMIN',
        action: 'order.manual_payment_approved',
        entityType: 'Order',
        entityId: orderId,
        metadata: { txHash, amount, asset: metadata.depositAsset },
      },
    });
    return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  }

  static async confirmOrder(orderId: string, buyerId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { transaction: true } });
    if (!order) throw new Error('Order not found');
    if (order.buyerId !== buyerId) throw new Error('Unauthorized');
    if (order.status === 'COMPLETED') return;
    if (!['PAID', 'DELIVERED', 'WAITING_BUYER_CONFIRMATION', 'DISPUTED_WAITING_SELLER', 'DISPUTED_WAITING_BUYER', 'ESCALATED_TO_ADMIN'].includes(order.status)) {
      throw new Error('Order is not available for buyer confirmation');
    }

    const referralReward = await prisma.$transaction(async (tx) => {
      await transition(order, 'COMPLETED', tx, buyerId, 'USER', 'Buyer confirmed delivery');

      const paymentMethod = order.transaction?.metadata &&
        typeof order.transaction.metadata === 'object' &&
        (order.transaction.metadata as { paymentMethod?: string }).paymentMethod;
      if (paymentMethod === 'DIRECT_INVOICE') {
        if (!order.transaction) throw new Error('Direct invoice transaction not found');
        await this.ensureDirectInvoiceEscrow(tx, orderId);
        const sellerWallet = await WalletRepository.getOrCreate(order.transaction.sellerId, order.transaction.currency, tx);
        const released = await tx.wallet.updateMany({
          where: { id: sellerWallet.id, pendingBalance: { gte: order.sellerAmount } },
          data: { pendingBalance: { decrement: order.sellerAmount } },
        });
        if (released.count !== 1) throw new Error('No direct invoice escrow funds are available for this order');
        await WalletRepository.addToAvailable(tx, sellerWallet.id, order.sellerAmount, order.transaction.currency);
        await tx.ledgerEntry.updateMany({
          where: { transactionId: order.transaction.id, type: 'SALE', status: 'PENDING' },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        await WalletRepository.createLedgerEntry(tx, {
          transactionId: order.transaction.id,
          walletId: sellerWallet.id,
          type: 'ESCROW_RELEASE',
          amount: order.sellerAmount,
          currency: order.transaction.currency,
          direction: 'CREDIT',
          status: 'COMPLETED',
          referenceId: order.id,
          description: 'Direct invoice escrow released after buyer confirmation',
        });
        await tx.transaction.update({
          where: { id: order.transaction.id },
          data: { status: 'COMPLETED', escrowReleaseAt: null },
        });
      } else if (paymentMethod !== 'WALLET') {
        await this.holdSellerFunds(tx, orderId);
        await WalletService.settleInternalTrade({
          sourceUserId: order.buyerId,
          targetUserId: order.sellerId,
          currency: 'USDT',
          amount: Number(order.totalAmount),
          tx
        });
      } else {
        if (!order.transaction) throw new Error('Wallet transaction not found');
        const sellerWallet = await WalletRepository.getOrCreate(order.transaction.sellerId, order.transaction.currency, tx);
        await WalletRepository.moveFromPendingToAvailable(tx, sellerWallet.id, order.transaction.amount, order.transaction.currency);
        await tx.ledgerEntry.updateMany({
          where: { transactionId: order.transaction.id, type: 'SALE', status: 'PENDING' },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        await tx.ledgerEntry.create({
          data: {
            transactionId: order.transaction.id,
            walletId: sellerWallet.id,
            type: 'ESCROW_RELEASE',
            amount: order.transaction.amount,
            currency: order.transaction.currency,
            direction: 'CREDIT',
            status: 'COMPLETED',
            referenceId: order.id,
            description: 'Escrow released after buyer confirmation',
          },
        });
        await tx.transaction.update({
          where: { id: order.transaction.id },
          data: { escrowReleaseAt: null }
        });
      }
      await tx.order.update({
        where: { id: order.id },
        data: {
          buyerTimerJobId: null,
          buyerConfirmationDeadline: null,
          escrowDeadline: null,
          buyerReviewDeadline: null,
        },
      });
      if (order.status === 'DISPUTED_WAITING_BUYER' || order.status === 'DISPUTED_WAITING_SELLER' || order.status === 'ESCALATED_TO_ADMIN') {
        const dispute = await tx.dispute.findUnique({ where: { orderId: order.id } });
        if (dispute) await tx.dispute.update({ where: { id: dispute.id }, data: { status: 'RESOLVED_SELLER', resolvedAt: new Date(), resolutionType: 'RELEASE_SELLER' } });
      }

      const reviewAggregate = await tx.review.aggregate({
        where: { sellerId: order.sellerId },
        _count: { id: true },
      });
      const positiveReviewCount = await tx.review.count({
        where: { sellerId: order.sellerId, rating: { gte: 4 } },
      });
      await tx.seller.updateMany({
        where: { userId: order.sellerId },
        data: {
          completedSales: { increment: order.quantity },
          positiveRatingPercentage: reviewAggregate._count.id
            ? (positiveReviewCount / reviewAggregate._count.id) * 100
            : undefined,
        },
      });
      return ReferralService.creditCompletedOrder(tx, order);
    });
    if (order.buyerTimerJobId) {
      try {
        await cancelJob(buyerConfirmationQueue, order.buyerTimerJobId);
      } catch (error) {
        logger.warn({ orderId, error: error instanceof Error ? error.message : String(error) }, 'Unable to cancel buyer confirmation timer after order completion');
      }
    }
    const notificationResults = await Promise.allSettled([
      NotificationService.createNotification({
        userId: order.buyerId, type: 'ORDER_COMPLETED', title: 'Order completed',
        message: `Order ${order.orderNumber} is complete. Thank you for your purchase.`,
        data: { orderId }, link: `/dashboard/orders/${orderId}`,
      }),
      NotificationService.createNotification({
        userId: order.sellerId, type: 'PAYMENT_RECEIVED', title: 'Sale completed',
        message: `Order ${order.orderNumber} has been completed.`,
        data: { orderId }, link: `/dashboard/orders/${orderId}`,
      }),
    ]);
    notificationResults.forEach((result) => {
      if (result.status === 'rejected') {
        logger.error({ orderId, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }, 'Unable to create order completion notification');
      }
    });
    if (referralReward) {
      await NotificationService.createNotification({
        userId: referralReward.referrerId,
        type: NotificationType.REFERRAL_COMMISSION,
        title: 'Referral commission earned',
        message: `You earned ${referralReward.amount.toString()} ${referralReward.currency} from a completed referral order.`,
        data: {
          orderId,
          amount: referralReward.amount.toString(),
          currency: referralReward.currency,
        },
        link: '/dashboard/referrals',
        sendEmail: true,
      }).catch((error: unknown) => {
        logger.error({
          orderId,
          referrerId: referralReward.referrerId,
          error: error instanceof Error ? error.message : String(error),
        }, 'Unable to create referral commission notification');
      });
    }
  }

  static async autoCompleteExpiredBuyerConfirmation(orderId: string, now = new Date()) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { transaction: true } });
    if (!order || !['PAID', 'WAITING_BUYER_CONFIRMATION'].includes(order.status) ||
      !order.escrowDeadline || order.escrowDeadline > now) return;
    await prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findUnique({ where: { id: orderId }, include: { transaction: true } });
      if (!currentOrder || !['PAID', 'WAITING_BUYER_CONFIRMATION'].includes(currentOrder.status) ||
        !currentOrder.escrowDeadline || currentOrder.escrowDeadline > now) return;

      const claimed = await tx.order.updateMany({
        where: {
          id: orderId,
          status: currentOrder.status,
          escrowDeadline: { lte: now },
        },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          buyerTimerJobId: null,
          buyerConfirmationDeadline: null,
          escrowDeadline: null,
        },
      });
      if (claimed.count !== 1) return;
      await tx.auditLog.create({
        data: {
          actorId: null,
          actorType: 'SYSTEM',
          action: 'order.status_change',
          entityType: 'Order',
          entityId: orderId,
          before: { status: currentOrder.status },
          after: { status: 'COMPLETED' },
          metadata: { reason: 'Auto-completed after buyer period expiry' },
        },
      });
      const transaction = currentOrder.transaction;
      const paymentMethod = transaction?.metadata &&
        typeof transaction.metadata === 'object' &&
        (transaction.metadata as { paymentMethod?: string }).paymentMethod;
      if (transaction && (paymentMethod === 'WALLET' || paymentMethod === 'DIRECT_INVOICE')) {
        if (paymentMethod === 'DIRECT_INVOICE') await this.ensureDirectInvoiceEscrow(tx, orderId);
        const escrowAmount = paymentMethod === 'DIRECT_INVOICE' ? currentOrder.sellerAmount : transaction.amount;
        const sellerWallet = await WalletRepository.getOrCreate(transaction.sellerId, transaction.currency, tx);
        await WalletRepository.moveFromPendingToAvailable(tx, sellerWallet.id, escrowAmount, transaction.currency);
        await tx.ledgerEntry.updateMany({
          where: { transactionId: transaction.id, type: 'SALE', status: 'PENDING' },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        await tx.ledgerEntry.create({
          data: {
            transactionId: transaction.id,
            walletId: sellerWallet.id,
            type: 'ESCROW_RELEASE',
            amount: escrowAmount,
            currency: transaction.currency,
            direction: 'CREDIT',
            status: 'COMPLETED',
            referenceId: currentOrder.id,
            description: 'Escrow automatically released after buyer confirmation window',
          },
        });
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { escrowReleaseAt: null },
        });
      } else {
        await this.holdSellerFunds(tx, orderId);
        if (transaction) {
          const sellerWallet = await WalletRepository.getOrCreate(transaction.sellerId, transaction.currency, tx);
          await WalletRepository.moveFromPendingToAvailable(tx, sellerWallet.id, transaction.amount, transaction.currency);
          await tx.ledgerEntry.updateMany({
            where: { transactionId: transaction.id, type: 'SALE', status: 'PENDING' },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
          await tx.ledgerEntry.create({
            data: {
              transactionId: transaction.id,
              walletId: sellerWallet.id,
              type: 'ESCROW_RELEASE',
              amount: transaction.amount,
              currency: transaction.currency,
              direction: 'CREDIT',
              status: 'COMPLETED',
              referenceId: currentOrder.id,
              description: 'Escrow automatically released after buyer confirmation window',
            },
          });
          await tx.transaction.update({
            where: { id: transaction.id },
            data: { escrowReleaseAt: null },
          });
        }
      }
      await ReferralService.creditCompletedOrder(tx, currentOrder);
    });
    emitMarketplaceOrderEvent(orderId, 'order_updated', {
      orderId,
      status: 'COMPLETED',
      reason: 'ESCROW_EXPIRED',
    });
  }

  static async completeExpiredBuyerConfirmations(now = new Date(), batchSize = 100) {
    const expiredOrders = await prisma.order.findMany({
      where: {
        status: { in: ['PAID', 'WAITING_BUYER_CONFIRMATION'] },
        escrowDeadline: { lte: now },
      },
      select: { id: true },
      take: batchSize,
    });

    for (const { id } of expiredOrders) {
      await this.autoCompleteExpiredBuyerConfirmation(id);
    }

    return expiredOrders.length;
  }

  static async refundExpiredDispute(orderId: string) {
    return this.refundDisputedOrder(orderId, null);
  }

  static async refundDisputedOrder(orderId: string, sellerId: string | null) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { transaction: true } });
    const disputableStatuses = ['PAID', 'DELIVERED', 'WAITING_BUYER_CONFIRMATION', 'DISPUTE_OPEN', 'DISPUTED_WAITING_SELLER', 'DISPUTED_WAITING_BUYER', 'ESCALATED_TO_ADMIN'];
    if (!order || !disputableStatuses.includes(order.status) || (sellerId && order.sellerId !== sellerId)) {
      throw new Error('Seller refund is not available for this order');
    }
    await prisma.$transaction(async (tx): Promise<void> => {
      const currentOrder = await tx.order.findUnique({ where: { id: orderId }, include: { transaction: true } });
      if (!currentOrder || !disputableStatuses.includes(currentOrder.status) || (sellerId && currentOrder.sellerId !== sellerId)) {
        throw new Error('Seller refund is no longer available for this order');
      }
      await transition(currentOrder, sellerId ? 'CANCELLED' : 'REFUNDED', tx, sellerId, sellerId ? 'USER' : 'SYSTEM', sellerId ? 'Seller cancelled the order and issued a refund' : 'Seller dispute response window expired');
      await tx.order.update({
        where: { id: orderId },
        data: {
          sellerResponseDeadline: null,
          buyerReviewDeadline: null,
          buyerConfirmationDeadline: null,
          escrowDeadline: null,
          cancelledAt: new Date(),
          isEscalated: false,
        },
      });
      const dispute = await tx.dispute.findUnique({ where: { orderId } });
      if (dispute) {
        await tx.dispute.update({
          where: { id: dispute.id },
          data: { status: 'RESOLVED_BUYER', resolution: 'Seller issued a full refund', resolutionType: 'REFUND_BUYER', resolvedAt: new Date() },
        });
      }

      const transaction = currentOrder.transaction;
      if (!transaction) throw new Error('Escrow transaction not found');
      const paymentMethod = transaction.metadata && typeof transaction.metadata === 'object'
        ? (transaction.metadata as { paymentMethod?: string }).paymentMethod
        : undefined;
      if (paymentMethod === 'DIRECT_INVOICE') await this.ensureDirectInvoiceEscrow(tx, orderId);
      const escrowAmount = paymentMethod === 'DIRECT_INVOICE' ? currentOrder.sellerAmount : transaction.amount;
      const sellerWallet = await WalletRepository.getOrCreate(transaction.sellerId, transaction.currency, tx);
      const buyerWallet = await WalletRepository.getOrCreate(transaction.buyerId, transaction.currency, tx);
      const released = await tx.wallet.updateMany({
        where: { id: sellerWallet.id, pendingBalance: { gte: escrowAmount } },
        data: { pendingBalance: { decrement: escrowAmount } },
      });
      if (released.count !== 1) throw new Error('Insufficient locked escrow funds for refund');
      await WalletRepository.addToAvailable(tx, buyerWallet.id, escrowAmount, transaction.currency);
      await tx.ledgerEntry.updateMany({
        where: { transactionId: transaction.id, type: 'SALE', status: 'PENDING' },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
      await WalletRepository.createLedgerEntry(tx, {
        transactionId: transaction.id,
        walletId: buyerWallet.id,
        type: 'REFUND',
        amount: escrowAmount,
        currency: transaction.currency,
        direction: 'CREDIT',
        status: 'COMPLETED',
        referenceId: orderId,
        description: 'Automatic buyer refund after seller dispute timeout',
      });
      await tx.transaction.update({ where: { id: transaction.id }, data: { status: 'REFUNDED', escrowReleaseAt: null }       });
    });
    emitMarketplaceOrderEvent(orderId, 'order_updated', {
      orderId,
      status: sellerId ? 'CANCELLED' : 'REFUNDED',
      reason: sellerId ? 'SELLER_CANCELLED_ORDER' : 'SELLER_DISPUTE_TIMEOUT',
    });
    return true;
  }

  static async completeExpiredDisputeResponses(now = new Date(), batchSize = 100) {
    const expired = await prisma.order.findMany({
      where: {
        status: { in: ['DISPUTE_OPEN', 'DISPUTED_WAITING_SELLER'] },
        isEscalated: false,
        sellerResponseDeadline: { lte: now },
      },
      select: { id: true },
      take: batchSize,
    });
    for (const order of expired) await this.cancelExpiredSellerDispute(order.id);
    return expired.length;
  }

  static async completeExpiredBuyerDisputeResponses(now = new Date(), batchSize = 100) {
    const expired = await prisma.order.findMany({
      where: {
        status: 'DISPUTED_WAITING_BUYER',
        isEscalated: false,
        buyerReviewDeadline: { lte: now },
      },
      select: { id: true, buyerId: true },
      take: batchSize,
    });
    for (const order of expired) {
      await this.confirmOrder(order.id, order.buyerId);
      emitMarketplaceOrderEvent(order.id, 'order_updated', {
        orderId: order.id,
        status: 'COMPLETED',
        reason: 'BUYER_DISPUTE_TIMEOUT',
      });
    }
    return expired.length;
  }

  static async cancelExpiredSellerDispute(orderId: string) {
    const disputableStatuses = ['DISPUTE_OPEN', 'DISPUTED_WAITING_SELLER'];
    await prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findUnique({ where: { id: orderId }, include: { transaction: true } });
      if (!currentOrder || !disputableStatuses.includes(currentOrder.status) || currentOrder.isEscalated) return;
      await transition(currentOrder, 'CANCELLED', tx, null, 'SYSTEM', 'Seller dispute response window expired');
      await tx.order.update({
        where: { id: orderId },
        data: {
          sellerResponseDeadline: null,
          buyerReviewDeadline: null,
          buyerConfirmationDeadline: null,
          escrowDeadline: null,
          cancelledAt: new Date(),
          isEscalated: false,
        },
      });
      const transaction = currentOrder.transaction;
      if (!transaction) throw new Error('Escrow transaction not found');
      const paymentMethod = transaction.metadata && typeof transaction.metadata === 'object'
        ? (transaction.metadata as { paymentMethod?: string }).paymentMethod
        : undefined;
      if (paymentMethod === 'DIRECT_INVOICE') await this.ensureDirectInvoiceEscrow(tx, orderId);
      const escrowAmount = paymentMethod === 'DIRECT_INVOICE' ? currentOrder.sellerAmount : transaction.amount;
      const sellerWallet = await WalletRepository.getOrCreate(transaction.sellerId, transaction.currency, tx);
      const buyerWallet = await WalletRepository.getOrCreate(transaction.buyerId, transaction.currency, tx);
      const released = await tx.wallet.updateMany({
        where: { id: sellerWallet.id, pendingBalance: { gte: escrowAmount } },
        data: { pendingBalance: { decrement: escrowAmount } },
      });
      if (released.count !== 1) throw new Error('Insufficient locked escrow funds for dispute cancellation');
      await WalletRepository.addToAvailable(tx, buyerWallet.id, escrowAmount, transaction.currency);
      await tx.ledgerEntry.updateMany({
        where: { transactionId: transaction.id, type: 'SALE', status: 'PENDING' },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
      await WalletRepository.createLedgerEntry(tx, {
        transactionId: transaction.id,
        walletId: buyerWallet.id,
        type: 'REFUND',
        amount: escrowAmount,
        currency: transaction.currency,
        direction: 'CREDIT',
        status: 'COMPLETED',
        referenceId: orderId,
        description: 'Full refund after seller dispute response window expired',
      });
      await tx.transaction.update({ where: { id: transaction.id }, data: { status: 'REFUNDED', escrowReleaseAt: null } });
    });
    emitMarketplaceOrderEvent(orderId, 'order_updated', { orderId, status: 'CANCELLED', reason: 'SELLER_DISPUTE_TIMEOUT' });
  }

  static async autoRefundExpiredSeller(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { transaction: true } });
    if (!order || order.status !== 'PAID') return;
    await prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findUnique({
        where: { id: orderId },
        include: { transaction: true }
      });
      if (!currentOrder || currentOrder.status !== 'PAID') return;

      const transaction = currentOrder.transaction;
      if (!transaction) throw new Error('Escrow transaction not found');

      const paymentMethod = transaction.metadata &&
        typeof transaction.metadata === 'object' &&
        (transaction.metadata as { paymentMethod?: string }).paymentMethod;
      if (paymentMethod === 'DIRECT_INVOICE') {
        await this.ensureDirectInvoiceEscrow(tx, orderId);
      } else if (transaction.status !== 'COMPLETED') {
        throw new Error('Completed escrow transaction not found');
      }
      const escrowAmount = paymentMethod === 'DIRECT_INVOICE' ? currentOrder.sellerAmount : transaction.amount;
      const sellerWallet = await WalletRepository.getOrCreate(transaction.sellerId, transaction.currency, tx);
      const buyerWallet = await WalletRepository.getOrCreate(transaction.buyerId, transaction.currency, tx);
      const released = await tx.wallet.updateMany({
        where: { id: sellerWallet.id, pendingBalance: { gte: escrowAmount } },
        data: { pendingBalance: { decrement: escrowAmount } }
      });
      if (released.count !== 1) throw new Error('Insufficient locked escrow funds for automatic refund');

      await WalletRepository.addToAvailable(tx, buyerWallet.id, escrowAmount, transaction.currency);
      await tx.ledgerEntry.updateMany({
        where: { transactionId: transaction.id, type: 'SALE', status: 'PENDING' },
        data: { status: 'CANCELLED', completedAt: new Date() }
      });
      await WalletRepository.createLedgerEntry(tx, {
        transactionId: transaction.id,
        walletId: buyerWallet.id,
        type: 'REFUND',
        amount: escrowAmount,
        currency: transaction.currency,
        direction: 'CREDIT',
        status: 'COMPLETED',
        referenceId: orderId,
        description: 'Automatic buyer refund after seller delivery timeout'
      });
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: 'REFUNDED', escrowReleaseAt: null }
      });
      await transition(currentOrder, 'REFUNDED', tx, null, 'SYSTEM', 'Seller failed to deliver on time');
    });
  }
}
