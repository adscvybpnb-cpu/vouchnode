import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { P2PProfileService } from '../services/p2p-profile.service';
import { P2POrderService } from '../services/p2p-order.service';
import { normalizeAvatarUrl } from '../services/avatar-url.service';
import {
  getAvailableGiftCardValueAtPrice,
  getP2PSpotPrice,
  isP2PAsset,
  P2P_SUPPORTED_ASSETS,
  quoteP2PTrade,
} from '../services/p2p-pricing.service';

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const SUPPORTED_CURRENCIES = [...P2P_SUPPORTED_ASSETS];

export default async function p2pRoutes(app: FastifyInstance) {
  app.post('/orders', { preHandler: authenticate }, async (req: any, res) => {
    try {
      const order = await P2POrderService.createOrder(
        req.user.id,
        String(req.body?.offerId || ''),
        Number(req.body?.giftCardValueUSD),
      );
      return res.status(201).send(order);
    } catch (cause) {
      const err = cause as Error & { statusCode?: number };
      req.log.error({ err }, 'Unable to create P2P order');
      return res.status(err.statusCode || 500).send({ message: err.message || 'Unable to create P2P order' });
    }
  });

  app.get('/orders/:id', { preHandler: authenticate }, async (req: any, res) => {
    try {
      return res.send(await P2POrderService.getOrder(String(req.params.id), req.user.id));
    } catch (cause) {
      const err = cause as Error & { statusCode?: number };
      return res.status(err.statusCode || 500).send({ message: err.message || 'Unable to load P2P order' });
    }
  });

  app.post('/orders/:id/paid', { preHandler: authenticate }, async (req: any, res) => {
    try {
      return res.send(await P2POrderService.markPaid(String(req.params.id), req.user.id));
    } catch (cause) {
      const err = cause as Error & { statusCode?: number };
      return res.status(err.statusCode || 500).send({ message: err.message || 'Unable to update P2P order' });
    }
  });

  app.post('/orders/:id/dispute', { preHandler: authenticate }, async (req: any, res) => {
    try {
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
      if (!reason || !description) return res.status(400).send({ message: 'Reason and description are required' });
      return res.status(201).send(await P2POrderService.openDispute(String(req.params.id), req.user.id, reason, description));
    } catch (cause) {
      const err = cause as Error & { statusCode?: number };
      return res.status(err.statusCode || 500).send({ message: err.message || 'Unable to open P2P dispute' });
    }
  });

  app.post('/orders/:id/review', { preHandler: authenticate }, async (req: any, res) => {
    try {
      const sentiment = req.body?.sentiment;
      const content = typeof req.body?.content === 'string' ? req.body.content : '';
      return res.status(201).send(await P2POrderService.submitReview(
        String(req.params.id),
        req.user.id,
        sentiment,
        content
      ));
    } catch (cause) {
      const err = cause as Error & { statusCode?: number };
      return res.status(err.statusCode || 500).send({ message: err.message || 'Unable to submit P2P review' });
    }
  });

  app.post('/orders/:id/release', { preHandler: authenticate }, async (req: any, res) => {
    try {
      return res.send(await P2POrderService.releaseOrder(String(req.params.id), req.user.id));
    } catch (cause) {
      const err = cause as Error & { statusCode?: number };
      return res.status(err.statusCode || 500).send({ message: err.message || 'Unable to release P2P escrow' });
    }
  });

  app.post('/orders/:id/cancel', { preHandler: authenticate }, async (req: any, res) => {
    try {
      return res.status(200).send(await P2POrderService.cancelOrder(String(req.params.id), req.user.id));
    } catch (cause) {
      const err = cause as Error & { statusCode?: number };
      return res.status(err.statusCode || 500).send({ message: err.message || 'Unable to cancel P2P order' });
    }
  });

  app.post('/orders/:id/complete', { preHandler: authenticate }, async (req: any, res) => {
    try {
      return res.send(await P2POrderService.completeOrder(String(req.params.id), req.user.id));
    } catch (cause) {
      const err = cause as Error & { statusCode?: number };
      return res.status(err.statusCode || 500).send({ message: err.message || 'Unable to complete P2P order' });
    }
  });

  app.get('/offers/:id/quote', async (req: any, res) => {
    const rawGiftCardValue = req.query?.giftCardValueUSD;
    if (typeof rawGiftCardValue !== 'string' || rawGiftCardValue.trim() === '') {
      return res.status(400).send({ message: 'A valid gift card value is required' });
    }

    if (!Number.isFinite(Number(rawGiftCardValue))) {
      return res.status(400).send({ message: 'A valid gift card value is required' });
    }

    let giftCardValue: Prisma.Decimal;
    try {
      giftCardValue = new Prisma.Decimal(rawGiftCardValue);
    } catch {
      return res.status(400).send({ message: 'A valid gift card value is required' });
    }
    if (!giftCardValue.isFinite() || giftCardValue.lte(0) || giftCardValue.decimalPlaces() > 2) {
      return res.status(400).send({ message: 'Gift card value must be positive and use no more than two decimal places' });
    }

    try {
      const offer = await prisma.p2POffer.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          cryptoAsset: true,
          exchangeRate: true,
          minLimit: true,
          maxLimit: true,
          isActive: true,
        },
      });
      if (!offer || !offer.isActive) {
        return res.status(404).send({ message: 'P2P offer not found' });
      }
      if (giftCardValue.lt(offer.minLimit) || giftCardValue.gt(offer.maxLimit)) {
        return res.status(400).send({ message: 'The gift card value is outside the offer limits' });
      }

      const quote = await quoteP2PTrade(
        giftCardValue,
        new Prisma.Decimal(offer.exchangeRate),
        offer.cryptoAsset,
        false,
      );
      return res.status(200).send({
        data: {
          giftCardValueUSD: giftCardValue.toNumber(),
          payoutUSD: quote.payoutUSD.toFixed(2),
          cryptoUsdPrice: quote.cryptoUsdPrice.toString(),
          cryptoAmount: quote.cryptoAmount.toString(),
        },
      });
    } catch (error) {
      req.log.error({ err: error, offerId: req.params.id }, 'Unable to calculate P2P trade quote');
      return res.status(503).send({ message: 'Live quote is temporarily unavailable. Please try again.' });
    }
  });

  app.get('/offers/:id', async (req: any, res) => {
    try {
      const offer = await prisma.p2POffer.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          type: true,
          giftCardType: true,
          cryptoAsset: true,
          minLimit: true,
          maxLimit: true,
          exchangeRate: true,
          terms: true,
          isActive: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              lastLoginAt: true,
              isOnline: true,
              onlineUntil: true,
              sellerProfile: { select: { shopName: true } },
              profile: { select: { username: true, displayName: true, avatarUrl: true } }
            }
          }
        }
      });

      if (!offer || !offer.isActive) {
        return res.status(404).send({ message: 'P2P offer not found' });
      }

      const tradeMetrics = (await P2PProfileService.getTradeMetricsForUsers([offer.user.id]))
        .get(offer.user.id);
      const lastActiveAt = offer.user.lastLoginAt || offer.updatedAt;
      const cryptoUsdPrice = await getP2PSpotPrice(offer.cryptoAsset);
      const merchantWallet = offer.type === 'BUY'
        ? await prisma.wallet.findUnique({
            where: { userId_currency: { userId: offer.user.id, currency: offer.cryptoAsset } },
            select: { availableBalance: true },
          })
        : null;
      const cryptoBalance = offer.type === 'BUY'
        ? new Prisma.Decimal(merchantWallet?.availableBalance ?? 0)
        : null;
      const effectiveMax = cryptoBalance
        ? Math.min(
            Number(offer.maxLimit),
            Number(getAvailableGiftCardValueAtPrice(
              cryptoBalance,
              new Prisma.Decimal(offer.exchangeRate),
              cryptoUsdPrice,
            )),
          )
        : Number(offer.maxLimit);
      if (offer.type === 'BUY' &&
          (effectiveMax < 10 || effectiveMax < Number(offer.minLimit))) {
        await prisma.p2POffer.updateMany({
          where: { id: offer.id, isActive: true },
          data: { isActive: false },
        });
        return res.status(404).send({ message: 'P2P offer is no longer available' });
      }
      const isOnline = offer.user.isOnline &&
        (!offer.user.onlineUntil || offer.user.onlineUntil.getTime() > Date.now());
      const username = offer.user.profile?.username || offer.user.id;
      const displayName = offer.user.sellerProfile?.shopName || offer.user.profile?.displayName || username;
      return res.status(200).send({
        data: {
          id: offer.id,
          userId: offer.user.id,
          merchantId: offer.user.id,
          merchant: {
            id: offer.user.id,
            username,
            displayName,
            avatarUrl: normalizeAvatarUrl(offer.user.profile?.avatarUrl),
          },
          merchantName: displayName,
          username,
          avatarUrl: normalizeAvatarUrl(offer.user.profile?.avatarUrl),
          completionRate: tradeMetrics?.completionRate ?? 0,
          cryptoCurrency: offer.cryptoAsset,
          cryptoUsdPrice: Number(cryptoUsdPrice),
          giftCardRate: Number(offer.exchangeRate),
          tradeType: offer.type,
          giftCardType: offer.giftCardType,
          minLimit: Number(offer.minLimit),
          maxLimit: Number(offer.maxLimit),
          effectiveMax,
          availableQuantity: null,
          paymentTags: [],
          tradeVolume: tradeMetrics?.totalCompletedOrders ?? 0,
          isOnline,
          isActiveWithinFiveMinutes: lastActiveAt >= new Date(Date.now() - ACTIVE_WINDOW_MS),
          lastActiveAt,
          terms: offer.terms,
          avgReleaseMinutes: tradeMetrics?.avgReleaseMinutes ?? 0
        }
      });
    } catch (error) {
      req.log.error({ err: error }, 'Unable to load P2P offer');
      return res.status(500).send({ message: 'Unable to load P2P offer' });
    }
  });

  app.delete('/offers/:id', { preHandler: authenticate }, async (req: any, res) => {
    try {
      const offerId = typeof req.params?.id === 'string' ? req.params.id.trim() : '';
      if (!offerId) return res.status(404).send({ message: 'P2P offer not found' });
      return res.send({ data: await P2PProfileService.deleteAd(req.user.id, offerId) });
    } catch (cause) {
      const err = cause as Error & { statusCode?: number };
      req.log.error({ err, offerId: req.params?.id }, 'Unable to delete P2P offer');
      return res.status(err.statusCode || 500).send({ message: err.message || 'Unable to delete P2P offer' });
    }
  });

  app.post('/offers/:id/trades', { preHandler: authenticate }, async (req: any, res) => {
    try {
      const order = await P2POrderService.createOrder(
        req.user.id,
        String(req.params.id || ''),
        Number(req.body?.giftCardValueUSD),
      );
      return res.status(201).send(order);
    } catch (error: any) {
      req.log.error({ err: error }, 'Unable to initiate P2P escrow trade');
      return res.status(error.statusCode || 500).send({ message: error.message || 'Unable to initiate P2P trade' });
    }
  });

  app.get('/offers', async (req, res) => {
    try {
      const query = (req.query || {}) as {
        type?: unknown;
        asset?: unknown;
        paymentMethod?: unknown;
      };
      const readQueryValue = (value: unknown) =>
        typeof value === 'string' ? value.trim() : '';
      const requestedType = readQueryValue(query.type).toUpperCase();
      const tradeType = ['BUY', 'SELL'].includes(requestedType) ? requestedType : '';
      if (!tradeType) {
        return res.status(200).send({ data: [] });
      }
      const requestedAsset = readQueryValue(query.asset).toUpperCase();
      const cryptoCurrency = isP2PAsset(requestedAsset)
        ? requestedAsset
        : '';
      const paymentMethod = readQueryValue(query.paymentMethod);
      const activeSince = new Date(Date.now() - ACTIVE_WINDOW_MS);

      const offers = await prisma.p2POffer.findMany({
        where: {
          isActive: true,
          cryptoAsset: cryptoCurrency || { in: SUPPORTED_CURRENCIES },
          type: tradeType,
          ...(paymentMethod ? { giftCardType: paymentMethod } : {})
        },
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          type: true,
          giftCardType: true,
          cryptoAsset: true,
          minLimit: true,
          maxLimit: true,
          exchangeRate: true,
          terms: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              lastLoginAt: true,
              isOnline: true,
              onlineUntil: true,
              sellerProfile: { select: { shopName: true } },
              wallets: {
                where: { currency: { in: SUPPORTED_CURRENCIES } },
                select: { currency: true, availableBalance: true },
              },
              profile: { select: { username: true, displayName: true, avatarUrl: true } }
            }
          }
        }
      });

      const metricsByUserId = await P2PProfileService.getTradeMetricsForUsers(
        offers.map((offer) => offer.user.id),
      );

      const pricesByAsset = new Map(
        await Promise.all(
          [...new Set(offers.map((offer) => offer.cryptoAsset))].map(async (asset) => [
            asset,
            await getP2PSpotPrice(asset),
          ] as const),
        ),
      );
      const sorted = (await Promise.all(offers
        .map(async (offer) => {
          const tradeMetrics = metricsByUserId.get(offer.user.id);
          if (!tradeMetrics) return null;
          const cryptoBalance = offer.type === 'BUY'
            ? new Prisma.Decimal(
                offer.user.wallets.find((wallet) => wallet.currency === offer.cryptoAsset)?.availableBalance ?? 0,
              )
            : null;
          const cryptoUsdPrice = pricesByAsset.get(offer.cryptoAsset);
          if (!cryptoUsdPrice) return null;
          const availableGiftCardValue = cryptoBalance
            ? getAvailableGiftCardValueAtPrice(
                cryptoBalance,
                new Prisma.Decimal(offer.exchangeRate),
                cryptoUsdPrice,
              )
            : new Prisma.Decimal(offer.maxLimit);
          const effectiveMax = Math.min(Number(offer.maxLimit), Number(availableGiftCardValue));
          if (offer.type === 'BUY' &&
              (effectiveMax < 10 || effectiveMax < Number(offer.minLimit))) {
            await prisma.p2POffer.updateMany({
              where: { id: offer.id, isActive: true },
              data: { isActive: false },
            });
            return null;
          }
          const lastActiveAt = offer.user.lastLoginAt || offer.updatedAt;
          const isOnline = offer.user.isOnline &&
            (!offer.user.onlineUntil || offer.user.onlineUntil.getTime() > Date.now());
          const username = offer.user.profile?.username || offer.user.id;
          const displayName = offer.user.sellerProfile?.shopName || offer.user.profile?.displayName || username;
          const isActiveWithinFiveMinutes = isOnline || lastActiveAt >= activeSince;
          return {
            id: offer.id,
            userId: offer.user.id,
            merchantId: offer.user.id,
            merchant: {
              id: offer.user.id,
              username,
              displayName,
              avatarUrl: normalizeAvatarUrl(offer.user.profile?.avatarUrl),
            },
            merchantName: displayName,
            username,
            avatarUrl: normalizeAvatarUrl(offer.user.profile?.avatarUrl),
            completionRate: tradeMetrics.completionRate,
            cryptoCurrency: offer.cryptoAsset,
            giftCardRate: Number(offer.exchangeRate),
            tradeType: offer.type,
            giftCardType: offer.giftCardType,
            minLimit: Number(offer.minLimit),
            maxLimit: Number(offer.maxLimit),
            effectiveMax,
            availableQuantity: null,
            paymentTags: [],
            tradeVolume: tradeMetrics.totalCompletedOrders,
            isOnline,
            lastActiveAt,
            terms: offer.terms,
            avgReleaseMinutes: tradeMetrics.avgReleaseMinutes,
            isActiveWithinFiveMinutes
          };
        })))
        .filter((offer): offer is NonNullable<typeof offer> => offer !== null)
        .sort((a, b) => {
          if (a.isActiveWithinFiveMinutes !== b.isActiveWithinFiveMinutes) {
            return a.isActiveWithinFiveMinutes ? -1 : 1;
          }
          return b.lastActiveAt.getTime() - a.lastActiveAt.getTime();
        });

      return res.status(200).send({ data: sorted });
    } catch (error) {
      req.log.error({ err: error }, 'Unable to load P2P offers');
      return res.status(503).send({ message: 'Unable to load P2P offers right now' });
    }
  });
}
