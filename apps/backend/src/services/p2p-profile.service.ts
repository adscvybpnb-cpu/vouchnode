import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  isP2PAsset,
  quoteP2PTrade,
} from './p2p-pricing.service';

export class P2PProfileService {
  static async getTradeMetrics(userId: string) {
    const completedStatuses = ['COMPLETED'] as const;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [thirtyDayOrders, thirtyDayCompletedOrders, totalCompletedOrders, completedBuyOrders, completedSellOrders] = await Promise.all([
      prisma.p2POrder.count({ where: { sellerId: userId, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.p2POrder.count({
        where: { sellerId: userId, createdAt: { gte: thirtyDaysAgo }, status: { in: [...completedStatuses] } },
      }),
      prisma.p2POrder.count({ where: { sellerId: userId, status: { in: [...completedStatuses] } } }),
      prisma.p2POrder.count({ where: { buyerId: userId, status: { in: [...completedStatuses] } } }),
      prisma.p2POrder.count({ where: { sellerId: userId, status: { in: [...completedStatuses] } } }),
    ]);

    console.log('[P2P metrics] p2POrder count result', {
      userId,
      completedStatuses,
      thirtyDaysAgo: thirtyDaysAgo.toISOString(),
      queries: {
        thirtyDayOrders: { sellerId: userId, createdAt: { gte: thirtyDaysAgo } },
        thirtyDayCompletedOrders: { sellerId: userId, createdAt: { gte: thirtyDaysAgo }, status: { in: completedStatuses } },
        totalCompletedOrders: { sellerId: userId, status: { in: completedStatuses } },
        completedBuyOrders: { buyerId: userId, status: { in: completedStatuses } },
        completedSellOrders: { sellerId: userId, status: { in: completedStatuses } },
      },
      counts: {
        thirtyDayOrders,
        thirtyDayCompletedOrders,
        totalCompletedOrders,
        completedBuyOrders,
        completedSellOrders,
      },
    });

    return {
      thirtyDayOrders,
      totalCompletedOrders,
      completedBuyOrders,
      completedSellOrders,
      completionRate: thirtyDayOrders ? (thirtyDayCompletedOrders / thirtyDayOrders) * 100 : 0,
    };
  }

  static async createAd(userId: string, data: { side: 'BUY' | 'SELL'; giftCardType: string; cryptoAsset: string; minLimit: number; maxLimit: number; exchangeRate: number; terms?: string }) {
    if (!userId) {
      const error = new Error('Authentication required') as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    const asset = data.cryptoAsset.trim().toUpperCase();
    const giftCardType = data.giftCardType.trim();
    const terms = data.terms?.trim() || null;
    const minLimit = Number.isFinite(data.minLimit) ? new Prisma.Decimal(data.minLimit) : null;
    const maxLimit = Number.isFinite(data.maxLimit) ? new Prisma.Decimal(data.maxLimit) : null;
    if (!userId || !['BUY', 'SELL'].includes(data.side) || !isP2PAsset(asset) || !giftCardType ||
        !Number.isFinite(data.exchangeRate) || data.exchangeRate <= 0 ||
        !Number.isFinite(data.minLimit) || data.minLimit < 10 ||
        !Number.isFinite(data.maxLimit) || data.maxLimit < data.minLimit ||
        (minLimit !== null && minLimit.decimalPlaces() > 2) ||
        (maxLimit !== null && maxLimit.decimalPlaces() > 2)) {
      const error = new Error(data.minLimit < 10
        ? 'The minimum trading limit must be at least $10 USD.'
        : 'Gift card, asset, rate, and valid positive limits are required') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });

      if (!user) {
        const error = new Error('Authenticated user was not found') as Error & { statusCode?: number };
        error.statusCode = 401;
        throw error;
      }

      if (data.side === 'BUY') {
        const wallet = await prisma.wallet.findUnique({
          where: { userId_currency: { userId, currency: asset } },
          select: { availableBalance: true }
        });
        const minimumQuote = await quoteP2PTrade(
          new Prisma.Decimal(data.minLimit),
          new Prisma.Decimal(data.exchangeRate),
          asset,
        );
        const requiredBalance = minimumQuote.cryptoAmount;
        if (!wallet || new Prisma.Decimal(wallet.availableBalance).lt(requiredBalance)) {
          const error = new Error('Insufficient available crypto balance for this BUY offer') as Error & { statusCode?: number };
          error.statusCode = 409;
          throw error;
        }
      }

      return await prisma.p2POffer.create({
        data: {
          type: data.side,
          giftCardType,
          cryptoAsset: asset,
          minLimit: data.minLimit,
          maxLimit: data.maxLimit,
          exchangeRate: data.exchangeRate,
          terms,
          isActive: true,
          user: {
            connect: { id: userId }
          }
        },
        select: {
          id: true,
          userId: true,
          type: true,
          giftCardType: true,
          cryptoAsset: true,
          minLimit: true,
          maxLimit: true,
          exchangeRate: true,
          terms: true,
          createdAt: true,
          updatedAt: true
        }
      });
    } catch (cause) {
      if (cause && typeof cause === 'object' && 'statusCode' in cause) throw cause;
      const error = new Error('Unable to create the P2P offer', { cause }) as Error & { statusCode?: number };
      error.statusCode = 503;
      throw error;
    }
  }

  static async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerified: true, kycStatus: true, twoFactorEnabled: true,
        isOnline: true, onlineUntil: true, createdAt: true,
        profile: { select: { username: true, displayName: true, avatarUrl: true, isIdentityVerified: true, avgReleaseMinutes: true, avgPaymentSpeedMins: true } },
        depositSessions: { where: { status: 'COMPLETED' }, select: { id: true } },
        p2pOffers: { where: { isActive: true }, orderBy: { updatedAt: 'desc' } },
        reviewsReceived: {
          where: { isVisible: true }, orderBy: { createdAt: 'desc' },
          select: { id: true, rating: true, content: true, createdAt: true, reviewer: { select: { profile: { select: { username: true } } } } }
        }
      }
    });
    if (!user) return null;
    const tradeMetrics = await P2PProfileService.getTradeMetrics(userId);
    const goodReviews = user.reviewsReceived.filter((review) => review.rating >= 4);
    return {
      id: userId,
      username: user.profile?.username || 'P2P Merchant',
      displayName: user.profile?.displayName || user.profile?.username || 'P2P Merchant',
      avatarUrl: user.profile?.avatarUrl || null,
      isOnline: user.isOnline && (!user.onlineUntil || user.onlineUntil.getTime() > Date.now()),
      createdAt: user.createdAt,
      verification: {
        email: user.emailVerified,
        sms: false,
        identity: user.profile?.isIdentityVerified || ['AUTOMATED_VERIFIED', 'APPROVED'].includes(user.kycStatus),
        hasP2PInsuranceDeposit: false
      },
      stats: {
        ...tradeMetrics,
        positiveRating: user.reviewsReceived.length ? (goodReviews.length / user.reviewsReceived.length) * 100 : 0,
        avgReleaseMinutes: user.profile?.avgReleaseMinutes || 0, avgPaymentMinutes: user.profile?.avgPaymentSpeedMins || 0,
        accountAgeDays: Math.floor((Date.now() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
        goodReviews: goodReviews.length, badReviews: user.reviewsReceived.length - goodReviews.length
      },
      ads: user.p2pOffers.map((offer) => ({
        id: offer.id, asset: offer.cryptoAsset, price: Number(offer.exchangeRate), side: offer.type,
        limits: `${Number(offer.minLimit).toFixed(2)} - ${Number(offer.maxLimit).toFixed(2)} USD`,
        availableQuantity: null, paymentMethods: [offer.giftCardType]
      })),
      reviews: user.reviewsReceived.map((review) => ({
        id: review.id, username: review.reviewer.profile?.username || 'P2P trader', paymentMethod: 'P2P trade',
        timestamp: review.createdAt, feedback: review.content || '', rating: review.rating
      }))
    };
  }

  static async getOrders(userId: string) {
    const [trades, p2pOrders] = await Promise.all([
      prisma.trade.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] }, orderBy: { createdAt: 'desc' },
      include: {
        buyer: { select: { email: true, profile: { select: { username: true } } } },
        seller: { select: { email: true, profile: { select: { username: true } } } }
      }
      }),
      prisma.p2POrder.findMany({
        where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
        orderBy: { createdAt: 'desc' },
        include: {
          buyer: { select: { email: true, profile: { select: { username: true } } } },
          seller: { select: { email: true, profile: { select: { username: true } } } },
          offer: { select: { type: true } },
          conversation: { select: { id: true } }
        }
      })
    ]);
    const legacyOrders = trades.map((trade) => {
      const isBuyer = trade.buyerId === userId;
      const counterparty = isBuyer ? trade.seller : trade.buyer;
      return {
        id: trade.id, orderType: `${isBuyer ? 'Buy' : 'Sell'} ${trade.cryptoType}`,
        fiatAmount: Number(trade.amountUSD), rate: Number(trade.amountUSD) / Number(trade.cryptoAmount),
        cryptoVolume: Number(trade.cryptoAmount), orderNumber: trade.id, timestamp: trade.createdAt,
        counterpartyUsername: counterparty.profile?.username || counterparty.email, status: trade.status,
        actionRequired: false, conversationId: null, isP2POrder: false
      };
    });
    const liveOrders = p2pOrders.map((order) => {
      const isBuyer = order.buyerId === userId;
      const counterparty = isBuyer ? order.seller : order.buyer;
      return {
        id: order.id,
        orderType: `${isBuyer ? 'Buy' : 'Sell'} ${order.cryptoAsset}`,
        fiatAmount: Number(order.amountUSD),
        rate: Number(order.amountUSD) / Number(order.cryptoAmount),
        cryptoVolume: Number(order.cryptoAmount),
        orderNumber: order.id,
        timestamp: order.createdAt,
        counterpartyUsername: counterparty.profile?.username || counterparty.email,
        status: order.status,
        actionRequired: !isBuyer && ['PENDING_PAYMENT', 'UNPAID'].includes(order.status),
        conversationId: order.conversation?.id || null,
        isP2POrder: true
      };
    });
    return [...legacyOrders, ...liveOrders].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  static async deleteAd(userId: string, offerId: string) {
    if (!userId || !offerId) {
      const error = new Error('P2P offer not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }

    try {
      const offer = await prisma.p2POffer.findUnique({
        where: { id: offerId },
        select: { id: true, userId: true, isActive: true },
      });

      if (!offer || offer.userId !== userId) {
        const error = new Error('P2P offer not found') as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }

      if (offer.isActive) {
        await prisma.p2POffer.update({
          where: { id: offer.id },
          data: { isActive: false },
        });
      }

      return { id: offer.id };
    } catch (error) {
      if (error instanceof Error && 'statusCode' in error) throw error;
      console.error(`Unable to archive P2P offer ${offerId}:`, error);
      const structuredError = new Error('P2P offer could not be removed. Please try again.') as Error & { statusCode?: number };
      structuredError.statusCode = 500;
      throw structuredError;
    }
  }
}
