import { FastifyInstance } from 'fastify';
import { authenticate, optionalAuth, requireApprovedSeller } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { P2PProfileService } from '../services/p2p-profile.service';
import { FavoriteService } from '../services/favorite.service';

export default async function p2pProfileRoutes(app: FastifyInstance) {
  app.get('/profile', { preHandler: optionalAuth }, async (request: any, reply) => {
    const requestedMerchantId = typeof request.query?.merchantId === 'string'
      ? request.query.merchantId.trim()
      : '';
    const userId = requestedMerchantId ||
      (typeof request.user?.id === 'string' ? request.user.id : '');

    const fallbackProfile = (user: {
      id: string;
      emailVerified?: boolean;
      kycStatus?: string;
      createdAt?: Date;
      profile?: {
        username?: string | null;
        displayName?: string | null;
        avatarUrl?: string | null;
        isIdentityVerified?: boolean;
      } | null;
    } | null) => {
      const username = user?.profile?.username || userId || 'P2P Merchant';
      const isIdentityVerified = user?.profile?.isIdentityVerified === true ||
        user?.kycStatus === 'AUTOMATED_VERIFIED' ||
        user?.kycStatus === 'APPROVED';
      return {
        id: user?.id || userId,
        username,
        displayName: user?.profile?.displayName || username,
        avatarUrl: user?.profile?.avatarUrl || null,
        isOnline: false,
        createdAt: user?.createdAt || new Date(0),
        verification: {
          email: user?.emailVerified ?? true,
          sms: false,
          identity: isIdentityVerified,
          hasP2PInsuranceDeposit: false
        },
        stats: {
          thirtyDayOrders: 0,
          totalCompletedOrders: 0,
          completedBuyOrders: 0,
          completedSellOrders: 0,
          completionRate: 0,
          positiveRating: 0,
          avgReleaseMinutes: 0,
          avgPaymentMinutes: 0,
          accountAgeDays: 0,
          goodReviews: 0,
          badReviews: 0
        },
        ads: [],
        reviews: [],
        isFavorite: false
      };
    };

    if (!userId) {
      return reply.status(200).send({
        data: {
          id: '',
          username: 'P2P Merchant',
          displayName: 'P2P Merchant',
          avatarUrl: null,
          isOnline: false,
          createdAt: new Date(0),
          verification: {
            email: false,
            sms: false,
            identity: false,
            hasP2PInsuranceDeposit: false
          },
          stats: {
            thirtyDayOrders: 0,
            totalCompletedOrders: 0,
            completedBuyOrders: 0,
            completedSellOrders: 0,
            completionRate: 0,
            positiveRating: 0,
            avgReleaseMinutes: 0,
            avgPaymentMinutes: 0,
            accountAgeDays: 0,
            goodReviews: 0,
            badReviews: 0
          },
          ads: [],
          reviews: [],
          isFavorite: false
        }
      });
    }

    try {
      const profile = await P2PProfileService.getProfile(userId);
      if (profile) {
        const isFavorite = request.user?.id && request.user.id !== userId
          ? await FavoriteService.isProfileFavorite(request.user.id, userId)
          : false;
        request.log.info({
          merchantId: userId,
          metrics: profile.stats,
        }, 'P2P merchant profile metrics loaded from seller-scoped p2POrder records');
        return reply.status(200).send({ data: { ...profile, isFavorite } });
      }
      request.log.warn({ userId }, 'P2P merchant profile not found');
      return reply.status(404).send({ message: 'P2P merchant not found' });
    } catch (error) {
      request.log.error({ err: error, userId }, 'Unable to load P2P merchant profile metrics');
      return reply.status(500).send({ message: 'Unable to load P2P merchant profile' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          emailVerified: true,
          kycStatus: true,
          createdAt: true,
          profile: { select: { username: true, displayName: true, avatarUrl: true, isIdentityVerified: true } }
        }
      });
      return reply.status(200).send({ data: fallbackProfile(user) });
    } catch (error) {
      request.log.error({ err: error, userId }, 'Unable to load core P2P profile; using token fallback');
      return reply.status(200).send({ data: fallbackProfile(null) });
    }
  });
  app.get('/orders', { preHandler: authenticate }, async (request: any, reply) => reply.send({ data: await P2PProfileService.getOrders(request.user.id) }));
  app.post('/offers/create', { preHandler: [authenticate, requireApprovedSeller] }, async (request: any, reply) => {
    const authenticatedUserId = request.user?.id;
    if (typeof authenticatedUserId !== 'string' || !authenticatedUserId) {
      return reply.status(401).send({ message: 'Authentication required' });
    }

    try {
      const body = request.body || {};
      const minLimit = Number(body.minLimit);
      const maxLimit = Number(body.maxLimit);
      const exchangeRate = Number(body.exchangeRate);
      if (body.side !== 'BUY' && body.side !== 'SELL') {
        return reply.status(400).send({ message: 'A valid P2P offer side is required' });
      }
      const side: 'BUY' | 'SELL' = body.side;

      const ad = await P2PProfileService.createAd(authenticatedUserId, {
        side,
        giftCardType: typeof body.giftCardType === 'string' ? body.giftCardType : '',
        cryptoAsset: typeof body.cryptoAsset === 'string' ? body.cryptoAsset : '',
        minLimit,
        maxLimit,
        exchangeRate,
        terms: typeof body.terms === 'string' ? body.terms : undefined
      });
      return reply.status(200).send({ data: ad });
    } catch (error: any) {
      console.error("P2P_CREATE_ERROR:", error);
      return reply.status(error.statusCode || 500).send({
        message: error.message || 'Unable to publish ad'
      });
    }
  });
  app.post('/ads', { preHandler: [authenticate, requireApprovedSeller] }, async (request: any, reply) => {
    try {
      const { side, asset, price, paymentMethod, minLimit, maxLimit, availableQuantity, paymentTags } = request.body || {};
      const ad = await P2PProfileService.createAd(request.user.id, {
        side,
        giftCardType: paymentMethod || 'Other',
        cryptoAsset: asset,
        minLimit: Number(minLimit),
        maxLimit: Number(maxLimit),
        exchangeRate: Number(price)
      });
      return reply.status(201).send({ data: ad });
    } catch (error: any) {
      return reply.status(error.statusCode || 400).send({ message: error.message || 'Unable to publish ad' });
    }
  });
}
