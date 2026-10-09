import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { emitP2POfferBalanceUpdate, emitP2POrderEvent } from '../websocket/socket.server';
import { NotificationService } from './notification.service';
import {
  deactivateUnfundedP2POffers,
  getAvailableGiftCardValueAtPrice,
  quoteP2PTrade,
} from './p2p-pricing.service';

type ServiceError = Error & { statusCode?: number; code?: string };

const error = (message: string, statusCode: number, code?: string): ServiceError =>
  Object.assign(new Error(message), { statusCode, code });

export class P2POrderService {
  private static readonly disputeTimers = new Map<string, NodeJS.Timeout>();
  private static readonly unpaidTimers = new Map<string, NodeJS.Timeout>();

  private static clearDisputeTimer(orderId: string) {
    const timer = this.disputeTimers.get(orderId);
    if (timer) clearTimeout(timer);
    this.disputeTimers.delete(orderId);
  }

  private static clearUnpaidTimer(orderId: string) {
    const timer = this.unpaidTimers.get(orderId);
    if (timer) clearTimeout(timer);
    this.unpaidTimers.delete(orderId);
  }

  static scheduleUnpaidExpiry(orderId: string, deadline: Date) {
    this.clearUnpaidTimer(orderId);
    const delay = Math.max(0, deadline.getTime() - Date.now());
    const timer = setTimeout(() => {
      this.unpaidTimers.delete(orderId);
      void this.expireUnpaidOrder(orderId).catch((cause) => {
        console.error('P2P unpaid order expiry failed:', cause);
      });
    }, Math.min(delay, 2_147_000_000));
    this.unpaidTimers.set(orderId, timer);
  }

  static scheduleDisputeExpiry(orderId: string, deadline: Date) {
    this.clearDisputeTimer(orderId);
    const delay = Math.max(0, deadline.getTime() - Date.now());
    const timer = setTimeout(() => {
      this.disputeTimers.delete(orderId);
      const now = new Date();
      void prisma.p2POrder.updateMany({
        where: {
          id: orderId,
          status: 'PAID_PENDING_VERIFICATION',
          paidVerificationDeadline: { lte: now },
          disputeEnabledAt: null
        },
        data: { disputeEnabledAt: now }
      }).then((result) => {
        if (result.count === 1) {
          emitP2POrderEvent(orderId, 'p2p_dispute_enabled', {
            orderId,
            disputeEnabled: true,
            paidVerificationDeadline: deadline.toISOString()
          });
        }
      }).catch((cause) => {
        console.error('P2P dispute deadline update failed:', cause);
      });
    }, Math.min(delay, 2_147_000_000));
    this.disputeTimers.set(orderId, timer);
  }

  static async schedulePendingDisputeExpiries() {
    const orders = await prisma.p2POrder.findMany({
      where: {
        status: 'PAID_PENDING_VERIFICATION',
        paidVerificationDeadline: { not: null },
        disputeEnabledAt: null
      },
      select: { id: true, paidVerificationDeadline: true }
    });
    for (const order of orders) {
      if (order.paidVerificationDeadline) {
        this.scheduleDisputeExpiry(order.id, order.paidVerificationDeadline);
      }
    }
    return orders.length;
  }

  static async schedulePendingUnpaidExpiries() {
    const orders = await prisma.p2POrder.findMany({
      where: {
        status: { in: ['PENDING_PAYMENT', 'UNPAID'] },
        paymentDeadline: { gt: new Date() }
      },
      select: { id: true, paymentDeadline: true }
    });
    for (const order of orders) this.scheduleUnpaidExpiry(order.id, order.paymentDeadline);
    return orders.length;
  }

  private static async closeConversationForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ) {
    const conversation = await tx.conversation.findUnique({
      where: { p2pOrderId: orderId },
      select: { id: true, buyerId: true, sellerId: true, isActive: true },
    });
    if (!conversation || !conversation.isActive) return;

    const conflictingInactive = await tx.conversation.findFirst({
      where: {
        buyerId: conversation.buyerId,
        sellerId: conversation.sellerId,
        isActive: false,
        id: { not: conversation.id },
      },
      select: { id: true },
    });
    if (conflictingInactive) {
      await tx.conversation.delete({ where: { id: conflictingInactive.id } });
    }
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { isActive: false },
    });
  }

  private static async prepareNewConversation(
    tx: Prisma.TransactionClient,
    buyerId: string,
    sellerId: string,
  ) {
    const activeConversation = await tx.conversation.findFirst({
      where: { buyerId, sellerId, isActive: true },
      select: { id: true },
    });
    if (!activeConversation) return;

    const conflictingInactive = await tx.conversation.findFirst({
      where: {
        buyerId,
        sellerId,
        isActive: false,
        id: { not: activeConversation.id },
      },
      select: { id: true },
    });
    if (conflictingInactive) {
      await tx.conversation.delete({ where: { id: conflictingInactive.id } });
    }
    await tx.conversation.update({
      where: { id: activeConversation.id },
      data: { isActive: false },
    });
  }

  static async createOrder(buyerId: string, offerId: string, giftCardValueUSD: number) {
    if (!buyerId || !offerId || !Number.isFinite(giftCardValueUSD) || giftCardValueUSD <= 0) {
      throw error('Offer and a positive gift card value are required', 400);
    }

    const initialOffer = await prisma.p2POffer.findUnique({
      where: { id: offerId },
      select: { id: true, userId: true, type: true, cryptoAsset: true, exchangeRate: true, minLimit: true, maxLimit: true, isActive: true }
    });
    if (!initialOffer || !initialOffer.isActive) throw error('This P2P offer is no longer available', 404);
    if (initialOffer.userId === buyerId) throw error('You cannot create an order for your own offer', 400);
    const giftCardValue = new Prisma.Decimal(giftCardValueUSD);
    if (giftCardValue.decimalPlaces() > 2) {
      throw error('Gift card value must use no more than two decimal places', 400);
    }
    if (giftCardValue.lt(initialOffer.minLimit) || giftCardValue.gt(initialOffer.maxLimit)) {
      throw error('The gift card value is outside the offer limits', 400);
    }
    const quote = await quoteP2PTrade(
      giftCardValue,
      new Prisma.Decimal(initialOffer.exchangeRate),
      initialOffer.cryptoAsset,
    );

    const result = await (async () => {
      try {
        return await prisma.$transaction(async (tx) => {
      const offer = await tx.p2POffer.findUnique({
        where: { id: offerId },
        select: { id: true, userId: true, type: true, cryptoAsset: true, exchangeRate: true, minLimit: true, maxLimit: true, isActive: true }
      });
      if (!offer || !offer.isActive) throw error('This P2P offer is no longer available', 404);
      if (offer.userId === buyerId) throw error('You cannot create an order for your own offer', 400);

      if (offer.userId !== initialOffer.userId ||
          offer.type !== initialOffer.type ||
          offer.cryptoAsset !== initialOffer.cryptoAsset ||
          !new Prisma.Decimal(offer.exchangeRate).eq(initialOffer.exchangeRate)) {
        throw error('The P2P offer changed while the trade was being quoted. Please retry.', 409);
      }
      if (giftCardValue.lt(offer.minLimit) || giftCardValue.gt(offer.maxLimit)) {
        throw error('The gift card value is outside the offer limits', 400);
      }
      const cryptoAmount = quote.cryptoAmount;
      const now = new Date();
      const paymentDeadline = new Date(now.getTime() + 30 * 60 * 1000);
      // A SELL offer is the client selling crypto to the merchant, so the
      // active client (buyerId in the order schema) is the escrow source.
      const escrowOwnerId = offer.type === 'SELL' ? buyerId : offer.userId;
      const wallet = await tx.wallet.findUnique({
        where: { userId_currency: { userId: escrowOwnerId, currency: offer.cryptoAsset } }
      });
      if (!wallet) {
        if (offer.type === 'BUY') {
          throw error(
            `Merchant wallet not found for ${offer.cryptoAsset}`,
            409,
            'INSUFFICIENT_MERCHANT_BALANCE',
          );
        }
        throw error(
          `Your ${offer.cryptoAsset} wallet was not found`,
          409
        );
      }
      if (offer.type === 'BUY') {
        const effectiveMax = Math.min(
          Number(offer.maxLimit),
          Number(getAvailableGiftCardValueAtPrice(
            new Prisma.Decimal(wallet.availableBalance),
            new Prisma.Decimal(offer.exchangeRate),
            quote.cryptoUsdPrice,
          )),
        );
        if (effectiveMax < 10 || effectiveMax < Number(offer.minLimit) ||
            giftCardValue.gt(effectiveMax)) {
          throw error(
            `Merchant balance has changed. The current maximum trade value is $${Math.max(0, effectiveMax).toFixed(2)} USD. Refresh the offer and try again.`,
            409,
            'INSUFFICIENT_MERCHANT_BALANCE',
          );
        }
      }
      if (offer.type === 'SELL' && wallet.availableBalance.lt(cryptoAmount)) {
        throw error('Your balance is insufficient to place this sell order.', 400);
      }
      const locked = await tx.wallet.updateMany({
        where: { id: wallet.id, availableBalance: { gte: cryptoAmount } },
        data: { availableBalance: { decrement: cryptoAmount }, escrowBalance: { increment: cryptoAmount } }
      });
      if (locked.count !== 1) {
        throw error(
          offer.type === 'SELL'
            ? 'Your balance is insufficient to place this sell order.'
            : 'Merchant has insufficient available crypto balance',
          offer.type === 'SELL' ? 400 : 409,
          offer.type === 'BUY' ? 'INSUFFICIENT_MERCHANT_BALANCE' : undefined,
        );
      }
      if (offer.type === 'BUY') {
        const remainingWallet = await tx.wallet.findUniqueOrThrow({
          where: { id: wallet.id },
          select: { availableBalance: true },
        });
        await deactivateUnfundedP2POffers(
          tx,
          offer.userId,
          offer.cryptoAsset,
          new Prisma.Decimal(remainingWallet.availableBalance),
          quote.cryptoUsdPrice,
        );
      }

      const order = await tx.p2POrder.create({
        data: {
          offerId: offer.id,
          buyerId,
          sellerId: offer.userId,
          cryptoAsset: offer.cryptoAsset,
          cryptoAmount,
          giftCardValueUSD: giftCardValue,
          giftCardRate: offer.exchangeRate,
          cryptoUsdPrice: quote.cryptoUsdPrice,
          pricingVersion: 2,
          amountUSD: quote.payoutUSD,
          escrowLocked: true,
          status: 'PENDING_PAYMENT',
          lockedAt: now,
          paymentDeadline
        }
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: 'ESCROW_HOLD',
          amount: cryptoAmount,
          currency: offer.cryptoAsset,
          direction: 'DEBIT',
          status: 'COMPLETED',
          referenceId: order.id,
          description: offer.type === 'SELL'
            ? 'P2P client crypto locked in escrow'
            : 'P2P merchant crypto locked in escrow',
          completedAt: now
        }
      });
      const conversation = await tx.conversation.create({
        data: { p2pOrderId: order.id, buyerId, sellerId: offer.userId, isActive: true }
      });
      const notification = {
        type: 'ORDER_NEW' as const,
        title: `New P2P trade order #${order.id} has started.`,
        message: `New P2P trade order #${order.id} has started.`,
        data: { orderId: order.id, conversationId: conversation.id, status: order.status },
        link: `/p2p-offers/order/${order.id}`,
        dedupeKey: `p2p-order:${order.id}`
      };
      const [buyerNotification, sellerNotification] = await Promise.all([
        NotificationService.createInTransaction(tx, { ...notification, userId: order.buyerId }),
        NotificationService.createInTransaction(tx, { ...notification, userId: order.sellerId })
      ]);
      return { order, conversationId: conversation.id, notifications: [buyerNotification, sellerNotification] };
        }, { maxWait: 5000, timeout: 30000 });
      } catch (cause) {
        const serviceError = cause as ServiceError;
        if (serviceError.code === 'INSUFFICIENT_MERCHANT_BALANCE') {
          try {
            await prisma.$transaction(async (tx) => {
              const wallet = await tx.wallet.findUnique({
                where: {
                  userId_currency: {
                    userId: initialOffer.userId,
                    currency: initialOffer.cryptoAsset,
                  },
                },
                select: { availableBalance: true },
              });
              await deactivateUnfundedP2POffers(
                tx,
                initialOffer.userId,
                initialOffer.cryptoAsset,
                new Prisma.Decimal(wallet?.availableBalance ?? 0),
                quote.cryptoUsdPrice,
              );
            });
          } catch (refreshError) {
            console.error('Unable to refresh Quick P2P offer availability after a failed trade:', refreshError);
          }
        }
        throw cause;
      }
    })();
    if (initialOffer.type === 'BUY') {
      emitP2POfferBalanceUpdate(initialOffer.userId, initialOffer.cryptoAsset);
    }
    this.scheduleUnpaidExpiry(result.order.id, result.order.paymentDeadline);
    try {
      result.notifications.forEach((notification) => NotificationService.emit(notification));
    } catch (notificationError) {
      console.error('P2P order notification failed:', notificationError);
    }
    return result;
  }

  static async getOrder(orderId: string, userId: string) {
    const order = await prisma.p2POrder.findUnique({
      where: { id: orderId },
      include: {
        offer: { select: { type: true, giftCardType: true, terms: true, exchangeRate: true } },
        buyer: { select: { profile: { select: { username: true } }, email: true } },
        seller: { select: { profile: { select: { username: true } }, email: true } },
        conversation: { select: { id: true } }
      }
    });
    if (!order || (order.buyerId !== userId && order.sellerId !== userId)) throw error('P2P order not found', 404);
    const review = await prisma.review.findFirst({
      where: { p2pOrderId: order.id, buyerId: userId },
      select: { id: true }
    });
    return {
      id: order.id, status: order.status, amountUSD: Number(order.amountUSD),
      giftCardValueUSD: Number(order.giftCardValueUSD),
      giftCardRate: Number(order.giftCardRate ?? order.offer.exchangeRate),
      cryptoUsdPrice: order.cryptoUsdPrice ? Number(order.cryptoUsdPrice) : null,
      pricingVersion: order.pricingVersion,
      cryptoAmount: Number(order.cryptoAmount), cryptoAsset: order.cryptoAsset,
      paymentDeadline: order.paymentDeadline, paidAt: order.paidAt,
      paidVerificationDeadline: order.paidVerificationDeadline,
      disputeEnabled: Boolean(
        order.status === 'PAID_PENDING_VERIFICATION' &&
        order.paidVerificationDeadline &&
        order.paidVerificationDeadline <= new Date()
      ),
      tradeType: order.offer.type,
      giftCardType: order.offer.giftCardType, terms: order.offer.terms,
      exchangeRate: Number(order.giftCardRate ?? order.offer.exchangeRate),
      buyerUsername: order.buyer.profile?.username || order.buyer.email,
      sellerUsername: order.seller.profile?.username || order.seller.email,
      conversationId: order.conversation?.id || null,
      isBuyer: order.buyerId === userId,
      hasReviewed: Boolean(review)
    };
  }

  static async submitReview(orderId: string, reviewerId: string, sentiment: 'POSITIVE' | 'NEGATIVE', content: string) {
    const trimmedContent = content.trim();
    if (!['POSITIVE', 'NEGATIVE'].includes(sentiment) || !trimmedContent) {
      throw error('Choose Positive or Negative and write a review.', 400);
    }

    const order = await prisma.p2POrder.findUnique({ where: { id: orderId } });
    if (!order || (order.buyerId !== reviewerId && order.sellerId !== reviewerId)) {
      throw error('P2P order not found', 404);
    }
    if (order.status !== 'COMPLETED') throw error('Reviews are available after the trade is completed.', 409);

    const revieweeId = order.buyerId === reviewerId ? order.sellerId : order.buyerId;
    const rating = sentiment === 'POSITIVE' ? 5 : 1;
    const existing = await prisma.review.findFirst({
      where: { p2pOrderId: orderId, buyerId: reviewerId },
      select: { id: true }
    });
    const review = existing
      ? await prisma.review.update({
        where: { id: existing.id },
        data: { sellerId: revieweeId, rating, content: trimmedContent, isVisible: true }
      })
      : await prisma.review.create({
        data: {
          p2pOrderId: orderId,
          buyerId: reviewerId,
          sellerId: revieweeId,
          rating,
          content: trimmedContent
        }
      });
    return { id: review.id, sentiment, content: review.content };
  }

  static async markPaid(orderId: string, userId: string) {
    const paidAt = new Date();
    const paidVerificationDeadline = new Date(paidAt.getTime() + 30 * 60 * 1000);
    await prisma.$transaction(async (tx) => {
      const order = await tx.p2POrder.findUnique({
        where: { id: orderId },
        include: { offer: { select: { type: true } } }
      });
      if (!order) throw error('P2P order not found', 404);

      const isSellCrypto = order.offer.type === 'SELL';
      const authorizedUserId = isSellCrypto ? order.sellerId : order.buyerId;
      const escrowRequirement = isSellCrypto ? { escrowLocked: true } : {};
      const updated = await tx.p2POrder.updateMany({
        where: {
          id: orderId,
          ...(isSellCrypto ? { sellerId: userId } : { buyerId: userId }),
          status: { in: ['PENDING_PAYMENT', 'UNPAID'] },
          ...(isSellCrypto ? escrowRequirement : { paymentDeadline: { gt: new Date() } })
        },
        data: { status: 'PAID_PENDING_VERIFICATION', paidAt, paidVerificationDeadline, disputeEnabledAt: null }
      });
      if (authorizedUserId !== userId || updated.count !== 1) {
        throw error('This order cannot be marked as paid', 409);
      }
    });
    emitP2POrderEvent(orderId, 'p2p_paid', {
      orderId,
      status: 'PAID_PENDING_VERIFICATION',
      paidVerificationDeadline: paidVerificationDeadline.toISOString(),
      disputeEnabled: false
    });
    this.scheduleDisputeExpiry(orderId, paidVerificationDeadline);
    return this.getOrder(orderId, userId);
  }

  static async openDispute(orderId: string, userId: string, reason: string, description: string) {
    let result: { dispute: Awaited<ReturnType<typeof prisma.p2PDispute.upsert>>; order: { id: string; buyerId: string; sellerId: string } };
    try {
      result = await prisma.$transaction(async (tx) => {
        const order = await tx.p2POrder.findUnique({
          where: { id: orderId },
          select: { id: true, buyerId: true, sellerId: true, status: true, paidVerificationDeadline: true }
        });
        if (!order || (order.buyerId !== userId && order.sellerId !== userId)) throw error('P2P order not found', 404);

        const existingDispute = await tx.p2PDispute.findUnique({ where: { p2pOrderId: order.id } });
        if (!existingDispute && (
          order.status !== 'PAID_PENDING_VERIFICATION' ||
          !order.paidVerificationDeadline ||
          order.paidVerificationDeadline > new Date()
        )) {
          throw error('Disputes are available after the verification countdown', 409);
        }

        // Upsert makes repeated clicks and concurrent buyer/merchant clicks idempotent.
        const dispute = await tx.p2PDispute.upsert({
          where: { p2pOrderId: order.id },
          create: {
            p2pOrderId: order.id,
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            openedById: userId,
            reason,
            description
          },
          update: {}
        });
        await tx.p2POrder.updateMany({
          where: { id: order.id, status: { in: ['PAID_PENDING_VERIFICATION', 'DISPUTED'] } },
          data: { status: 'DISPUTED', disputeEnabledAt: new Date() }
        });
        return { dispute, order };
      });
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
        throw error('This P2P dispute is already being opened. Refresh the order before retrying.', 409);
      }
      throw cause;
    }
    const dispute = result.dispute;
    this.clearDisputeTimer(result.order.id);
    emitP2POrderEvent(result.order.id, 'p2p_dispute_opened', {
      orderId: result.order.id,
      disputeId: dispute.id,
      status: 'DISPUTED',
      openedBy: userId === result.order.buyerId ? 'BUYER' : 'SELLER'
    });
    return dispute;
  }

  static async resolveDispute(disputeId: string, adminId: string, resolution: 'BUYER' | 'SELLER', note: string) {
    const result = await prisma.$transaction(async (tx) => {
      const dispute = await tx.p2PDispute.findUnique({
        where: { id: disputeId },
        include: { order: { include: { offer: { select: { type: true } } } } }
      });
      if (!dispute) throw error('P2P dispute is unavailable', 404);
      if (dispute.status !== 'OPEN') throw error('P2P dispute is already resolved', 409);
      const escrowOwnerId = dispute.order.offer.type === 'SELL' ? dispute.buyerId : dispute.sellerId;
      const recipientId = resolution === 'BUYER' ? dispute.buyerId : dispute.sellerId;
      const wallet = await tx.wallet.findUnique({
        where: { userId_currency: { userId: escrowOwnerId, currency: dispute.order.cryptoAsset } }
      });
      const resolvedAt = new Date();
      if (wallet && dispute.order.escrowLocked && dispute.order.status === 'DISPUTED') {
        const released = await tx.wallet.updateMany({
          where: { id: wallet.id, escrowBalance: { gte: dispute.order.cryptoAmount } },
          data: { escrowBalance: { decrement: dispute.order.cryptoAmount } }
        });
        if (released.count === 1) {
          const recipientWallet = wallet.userId === recipientId
            ? wallet
            : await tx.wallet.upsert({
                where: { userId_currency: { userId: recipientId, currency: dispute.order.cryptoAsset } },
                create: { userId: recipientId, currency: dispute.order.cryptoAsset, walletType: 'INTERNAL' },
                update: {}
              });
          await tx.wallet.update({
            where: { id: recipientWallet.id },
            data: { availableBalance: { increment: dispute.order.cryptoAmount } }
          });
          try {
            await tx.ledgerEntry.createMany({
              data: [
                {
                  walletId: wallet.id,
                  type: 'ESCROW_RELEASE',
                  amount: dispute.order.cryptoAmount,
                  currency: dispute.order.cryptoAsset,
                  direction: 'DEBIT',
                  status: 'COMPLETED',
                  referenceId: dispute.order.id,
                  description: `P2P dispute resolved for ${resolution.toLowerCase()}`,
                  completedAt: resolvedAt
                },
                {
                  walletId: recipientWallet.id,
                  type: 'ESCROW_RELEASE',
                  amount: dispute.order.cryptoAmount,
                  currency: dispute.order.cryptoAsset,
                  direction: 'CREDIT',
                  status: 'COMPLETED',
                  referenceId: dispute.order.id,
                  description: 'P2P dispute settlement received',
                  completedAt: resolvedAt
                }
              ]
            });
          } catch (ledgerError) {
            console.error('Admin P2P escrow ledger write failed after wallet settlement', {
              disputeId,
              orderId: dispute.order.id,
              resolution,
              error: ledgerError
            });
          }
        } else {
          console.error('Admin P2P escrow balance was unavailable; closing judgment without a second debit', { disputeId });
        }
      }
      await tx.p2PDispute.update({
        where: { id: dispute.id },
        data: {
          status: resolution === 'BUYER' ? 'RESOLVED_BUYER' : 'RESOLVED_SELLER',
          resolution: note,
          resolvedBy: adminId,
          resolvedAt
        }
      });
      await tx.p2POrder.update({
        where: { id: dispute.order.id },
        data: { status: 'COMPLETED', cancelledAt: null, completedAt: resolvedAt, escrowLocked: false }
      });
      return {
        orderId: dispute.order.id,
        disputeId: dispute.id,
        id: dispute.id,
        buyerId: dispute.buyerId,
        sellerId: dispute.sellerId,
        status: resolution === 'BUYER' ? 'RESOLVED_BUYER' : 'RESOLVED_SELLER'
      };
    }, { maxWait: 5000, timeout: 30000 });
    emitP2POrderEvent(result.orderId, 'p2p_dispute_resolved', {
      orderId: result.orderId,
      disputeId: result.disputeId,
      resolution
    });
    const buyerWins = resolution === 'BUYER';
    await Promise.all([
      NotificationService.createNotification({
        userId: buyerWins ? result.buyerId : result.sellerId,
        type: 'DISPUTE_RESOLVED',
        title: 'DISPUTE RESOLVED IN YOUR FAVOR',
        message: buyerWins
          ? `The dispute for order #${result.orderId} has been resolved in your favor. Funds have been refunded to your wallet.`
          : `The dispute for order #${result.orderId} has been resolved in your favor. Escrow funds have been released to your wallet.`,
        data: { disputeId: result.disputeId, orderId: result.orderId },
        link: `/p2p-offers/order/${result.orderId}`,
      }),
      NotificationService.createNotification({
        userId: buyerWins ? result.sellerId : result.buyerId,
        type: 'DISPUTE_RESOLVED',
        title: buyerWins ? 'DISPUTE RESOLVED (FAVOR OF BUYER)' : 'DISPUTE RESOLVED (FAVOR OF SELLER)',
        message: `The dispute for order #${result.orderId} was closed in favor of the ${buyerWins ? 'buyer' : 'seller'} by administration.`,
        data: { disputeId: result.disputeId, orderId: result.orderId },
        link: `/p2p-offers/order/${result.orderId}`,
      }),
    ]);
    return { id: result.id, status: result.status };
  }

  static async cancelOrder(orderId: string, userId: string, expiredOnly = false) {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.p2POrder.findUnique({
        where: { id: orderId },
        include: { offer: { select: { type: true } } }
      });
      const isPendingPayment = order ? ['PENDING_PAYMENT', 'UNPAID'].includes(order.status) : false;
      const isBuyer = order?.buyerId === userId;
      const isSeller = order?.sellerId === userId;
      const isAuthorized = Boolean(order && (
        expiredOnly
          ? isBuyer
          : isBuyer || (isSeller && (isPendingPayment || order.status !== 'COMPLETED'))
      ));
      if (!order || !isAuthorized) {
        throw error('You are not authorized to cancel this P2P order', 403);
      }
      if (expiredOnly ? !['PENDING_PAYMENT', 'UNPAID'].includes(order.status) : !['PENDING_PAYMENT', 'UNPAID', 'PAID_PENDING_VERIFICATION', 'PAID', 'PENDING_VERIFICATION', 'DISPUTED'].includes(order.status)) {
        throw error('This order is no longer active', 409);
      }
      const cancellableStatuses: Array<
        'PENDING_PAYMENT' | 'UNPAID' | 'PAID_PENDING_VERIFICATION' | 'PAID' | 'PENDING_VERIFICATION' | 'DISPUTED'
      > = expiredOnly
        ? ['PENDING_PAYMENT', 'UNPAID']
        : ['PENDING_PAYMENT', 'UNPAID', 'PAID_PENDING_VERIFICATION', 'PAID', 'PENDING_VERIFICATION', 'DISPUTED'];
      const updated = await tx.p2POrder.updateMany({
        where: {
          id: orderId,
          OR: [
            { buyerId: userId },
            ...(!isBuyer ? [{ sellerId: userId }] : [])
          ],
          status: { in: cancellableStatuses }
        },
        data: { status: 'CANCELLED', cancelledAt: new Date() }
      });
      if (updated.count !== 1) throw error('The order was already updated', 409);
      if (order.escrowLocked) {
        const escrowOwnerId = order.offer.type === 'SELL' ? order.buyerId : order.sellerId;
        const wallet = await tx.wallet.findUnique({
          where: { userId_currency: {
            userId: escrowOwnerId,
            currency: order.cryptoAsset
          } }
        });
        if (!wallet) throw error(`Escrow wallet not found for ${order.cryptoAsset}`, 409);
        const refunded = await tx.wallet.updateMany({
          where: { id: wallet.id, escrowBalance: { gte: order.cryptoAmount } },
          data: { escrowBalance: { decrement: order.cryptoAmount }, availableBalance: { increment: order.cryptoAmount } }
        });
        if (refunded.count !== 1) throw error('Insufficient locked crypto for cancellation', 409);
        await tx.ledgerEntry.createMany({
          data: [
            {
              walletId: wallet.id,
              type: 'ESCROW_RELEASE',
              amount: order.cryptoAmount,
              currency: order.cryptoAsset,
              direction: 'DEBIT',
              status: 'COMPLETED',
              referenceId: order.id,
              description: order.offer.type === 'SELL'
                ? 'P2P escrow returned to client after seller cancellation'
                : 'P2P escrow returned to merchant after buyer cancellation',
              completedAt: new Date()
            },
            {
              walletId: wallet.id,
              type: 'ESCROW_RELEASE',
              amount: order.cryptoAmount,
              currency: order.cryptoAsset,
              direction: 'CREDIT',
              status: 'COMPLETED',
              referenceId: order.id,
              description: order.offer.type === 'SELL'
                ? 'P2P client balance restored after seller cancellation'
                : 'P2P merchant balance restored after buyer cancellation',
              completedAt: new Date()
            }
          ]
        });
        await tx.p2POrder.update({
          where: { id: order.id },
          data: { escrowLocked: false }
        });
      }
      await tx.p2PDispute.updateMany({
        where: { p2pOrderId: order.id, status: 'OPEN' },
        data: { status: 'CLOSED', resolution: 'Closed by buyer cancellation', resolvedAt: new Date() }
      });
      await this.closeConversationForOrder(tx, order.id);
      const message = `P2P Trade order #${order.id} has been cancelled.`;
      const notificationInput = {
        type: 'ORDER_UPDATE' as const,
        title: message,
        message,
        data: { orderId: order.id, status: 'CANCELLED' },
        link: `/p2p-offers/order/${order.id}`,
        dedupeKey: `p2p-order-cancelled:${order.id}`
      };
      const [buyerNotification, sellerNotification] = await Promise.all([
        NotificationService.createInTransaction(tx, { ...notificationInput, userId: order.buyerId }),
        NotificationService.createInTransaction(tx, { ...notificationInput, userId: order.sellerId })
      ]);
      return { id: order.id, status: 'CANCELLED', notifications: [buyerNotification, sellerNotification] };
    }, { maxWait: 5000, timeout: 30000 });
    this.clearDisputeTimer(result.id);
    this.clearUnpaidTimer(result.id);
    result.notifications.forEach((notification) => NotificationService.emit(notification));
    return { id: result.id, status: result.status };
  }

  static async releaseOrder(orderId: string, userId: string) {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.p2POrder.findUnique({
        where: { id: orderId },
        include: { offer: { select: { type: true } } }
      });
      const releaseActorId = order
        ? order.offer.type === 'SELL' ? order.buyerId : order.sellerId
        : undefined;
      const isAuthorized = releaseActorId === userId;
      if (!order || !isAuthorized) {
        throw error('Only the receiving party can release this P2P order', 403);
      }
      if (!['PAID_PENDING_VERIFICATION', 'PAID', 'PENDING_VERIFICATION', 'DISPUTED'].includes(order.status)) {
        throw error('This order is not ready for crypto release', 409);
      }
      if (!order.escrowLocked) {
        throw error(`This order has no locked ${order.cryptoAsset} to release`, 409);
      }

      const escrowOwnerId = order.offer.type === 'SELL' ? order.buyerId : order.sellerId;
      const recipientId = order.offer.type === 'SELL' ? order.sellerId : order.buyerId;
      const escrowWallet = await tx.wallet.findUnique({
        where: { userId_currency: {
          userId: escrowOwnerId,
          currency: order.cryptoAsset
        } }
      });
      if (!escrowWallet) throw error(`Escrow ${order.cryptoAsset} wallet not found`, 409);
      const released = await tx.wallet.updateMany({
        where: { id: escrowWallet.id, escrowBalance: { gte: order.cryptoAmount } },
        data: { escrowBalance: { decrement: order.cryptoAmount } }
      });
      if (released.count !== 1) throw error(`Insufficient locked ${order.cryptoAsset} for release`, 409);

      const recipientWallet = await tx.wallet.upsert({
        where: { userId_currency: { userId: recipientId, currency: order.cryptoAsset } },
        create: { userId: recipientId, currency: order.cryptoAsset, walletType: 'INTERNAL' },
        update: {}
      });
      await tx.wallet.update({
        where: { id: recipientWallet.id },
        data: { availableBalance: { increment: order.cryptoAmount } }
      });
      const completedAt = new Date();
      await tx.ledgerEntry.createMany({
        data: [
          {
            walletId: escrowWallet.id,
            type: 'ESCROW_RELEASE',
            amount: order.cryptoAmount,
            currency: order.cryptoAsset,
            direction: 'DEBIT',
            status: 'COMPLETED',
            referenceId: order.id,
            description: order.offer.type === 'SELL'
              ? 'P2P escrow released to merchant'
              : 'P2P escrow released to buyer',
            completedAt
          },
          {
            walletId: recipientWallet.id,
            type: 'ESCROW_RELEASE',
            amount: order.cryptoAmount,
            currency: order.cryptoAsset,
            direction: 'CREDIT',
            status: 'COMPLETED',
            referenceId: order.id,
            description: order.offer.type === 'SELL'
              ? 'P2P escrow received by merchant'
              : 'P2P escrow received by buyer',
            completedAt
          }
        ]
      });

      // Persist COMPLETED only after both wallet movements and ledger entries succeed.
      const updated = await tx.p2POrder.updateMany({
        where: {
          id: orderId,
          ...(order.offer.type === 'SELL' ? { buyerId: userId } : { sellerId: userId }),
          status: { in: ['PAID_PENDING_VERIFICATION', 'PAID', 'PENDING_VERIFICATION', 'DISPUTED'] }
        },
        data: { status: 'COMPLETED', completedAt, escrowLocked: false }
      });
      if (updated.count !== 1) throw error('The order was already updated', 409);
      await tx.p2PDispute.updateMany({
        where: { p2pOrderId: order.id, status: 'OPEN' },
        data: { status: 'CLOSED', resolution: 'Closed by merchant release', resolvedAt: completedAt }
      });
      await this.closeConversationForOrder(tx, order.id);
      const message = `P2P Trade order #${order.id} has been completed.`;
      const notificationInput = {
        type: 'ORDER_UPDATE' as const,
        title: message,
        message,
        data: {
          orderId: order.id,
          status: 'COMPLETED',
          currency: order.cryptoAsset,
          amount: Number(order.cryptoAmount)
        },
        link: `/p2p-offers/order/${order.id}`,
        dedupeKey: `p2p-order-completed:${order.id}`
      };
      const [buyerNotification, sellerNotification] = await Promise.all([
        NotificationService.createInTransaction(tx, { ...notificationInput, userId: order.buyerId }),
        NotificationService.createInTransaction(tx, { ...notificationInput, userId: order.sellerId })
      ]);
      return { id: order.id, status: 'COMPLETED' as const, notifications: [buyerNotification, sellerNotification] };
    }, { maxWait: 5000, timeout: 30000 });
    this.clearDisputeTimer(result.id);
    this.clearUnpaidTimer(result.id);
    result.notifications.forEach((notification) => NotificationService.emit(notification));
    return this.getOrder(orderId, userId);
  }

  static async completeOrder(orderId: string, userId: string) {
    return this.releaseOrder(orderId, userId);
  }

  static async expireUnpaidOrders() {
    const orders = await prisma.p2POrder.findMany({
      where: { status: { in: ['PENDING_PAYMENT', 'UNPAID'] }, paymentDeadline: { lte: new Date() } },
      select: { id: true }
    });
    for (const order of orders) await this.expireUnpaidOrder(order.id);
  }

  private static async expireUnpaidOrder(orderId: string) {
    const order = await prisma.p2POrder.findUnique({
      where: { id: orderId },
      select: { id: true, buyerId: true, status: true }
    });
    if (!order || !['PENDING_PAYMENT', 'UNPAID'].includes(order.status)) return;
    await this.cancelOrder(order.id, order.buyerId, true);
  }
}
