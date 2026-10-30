import Fastify from 'fastify';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  offerFindMany: vi.fn(),
  offerUpdateMany: vi.fn(),
  getTradeMetricsForUsers: vi.fn(),
  getP2PSpotPrice: vi.fn(),
  getAvailableGiftCardValueAtPrice: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    p2POffer: {
      findMany: mocks.offerFindMany,
      updateMany: mocks.offerUpdateMany,
    },
  },
}));

vi.mock('../middleware/auth.middleware', () => ({
  authenticate: vi.fn(),
}));

vi.mock('../services/p2p-profile.service', () => ({
  P2PProfileService: { getTradeMetricsForUsers: mocks.getTradeMetricsForUsers },
}));

vi.mock('../services/p2p-order.service', () => ({
  P2POrderService: {},
}));

vi.mock('../services/p2p-pricing.service', () => ({
  P2P_SUPPORTED_ASSETS: ['USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'LTC'],
  getP2PSpotPrice: mocks.getP2PSpotPrice,
  getAvailableGiftCardValueAtPrice: mocks.getAvailableGiftCardValueAtPrice,
  isP2PAsset: (asset: string) => ['USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'LTC'].includes(asset),
  quoteP2PTrade: vi.fn(),
}));

import p2pRoutes from '../routes/p2p.routes';

describe('P2P market offer listing', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    mocks.getTradeMetricsForUsers.mockImplementation(async (userIds: string[]) => new Map(
      userIds.map((userId) => [userId, {
        completionRate: 100,
        totalCompletedOrders: 3,
        avgReleaseMinutes: 5,
      }]),
    ));
    mocks.getP2PSpotPrice.mockResolvedValue(new Prisma.Decimal(50_000));
    mocks.getAvailableGiftCardValueAtPrice.mockReturnValue(new Prisma.Decimal(1_000));
    mocks.offerFindMany.mockImplementation(async ({ where }: { where: { cryptoAsset: string | { in: string[] }; type: string } }) => {
      const asset = typeof where.cryptoAsset === 'string' ? where.cryptoAsset : 'USDT';
      return [{
      id: `${asset}-${where.type}`,
      type: where.type,
      giftCardType: 'Any Gift Card',
      cryptoAsset: asset,
      minLimit: new Prisma.Decimal(10),
      maxLimit: new Prisma.Decimal(1000),
      exchangeRate: new Prisma.Decimal('0.8'),
      terms: null,
      updatedAt: new Date(),
      user: {
        id: 'merchant-1',
        lastLoginAt: new Date(),
        isOnline: false,
        onlineUntil: null,
        sellerProfile: { shopName: 'Merchant' },
        wallets: [{ currency: asset, availableBalance: new Prisma.Decimal(10) }],
        profile: { username: 'merchant', displayName: 'Merchant', avatarUrl: null },
      },
    }];
    });
    mocks.offerUpdateMany.mockResolvedValue({ count: 0 });
    await app.register(p2pRoutes);
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(
    ['USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'LTC']
      .flatMap((asset) => ['BUY', 'SELL'].map((type) => ({ asset, type }))),
  )(
    'lists active $type $asset offers without requiring a payment-method filter',
    async ({ asset, type }) => {
      const response = await app.inject({
        method: 'GET',
        url: `/offers?type=${type}&asset=${asset}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toHaveLength(1);
      expect(response.json().data[0]).toMatchObject({
        cryptoCurrency: asset,
        tradeType: type,
        giftCardType: 'Any Gift Card',
      });
      expect(mocks.offerFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          cryptoAsset: asset,
          type,
        }),
      }));
      expect(mocks.offerFindMany.mock.calls[0][0].where).not.toHaveProperty('giftCardType');
    },
  );

  it('treats ALL asset and payment filters as an unfiltered supported-asset listing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/offers?type=BUY&asset=ALL&paymentMethod=ALL',
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.offerFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        isActive: true,
        cryptoAsset: { in: ['USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'LTC'] },
        type: 'BUY',
      }),
    }));
    expect(mocks.offerFindMany.mock.calls[0][0].where).not.toHaveProperty('giftCardType');
  });

  it('sorts online merchants above offline merchants regardless of recent activity', async () => {
    const now = new Date();
    const makeOffer = (id: string, userId: string, isOnline: boolean, lastLoginAt: Date) => ({
      id,
      type: 'BUY',
      giftCardType: 'Any Gift Card',
      cryptoAsset: 'USDT',
      minLimit: new Prisma.Decimal(10),
      maxLimit: new Prisma.Decimal(1_000),
      exchangeRate: new Prisma.Decimal('0.8'),
      terms: null,
      updatedAt: now,
      user: {
        id: userId,
        lastLoginAt,
        isOnline,
        onlineUntil: null,
        sellerProfile: { shopName: userId },
        wallets: [{ currency: 'USDT', availableBalance: new Prisma.Decimal(10) }],
        profile: { username: userId, displayName: userId, avatarUrl: null },
      },
    });
    mocks.offerFindMany.mockResolvedValue([
      makeOffer('offline-offer', 'offline-merchant', false, now),
      makeOffer('online-offer', 'online-merchant', true, new Date(now.getTime() - 60 * 60 * 1000)),
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/offers?type=BUY&asset=USDT',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((offer: { id: string }) => offer.id))
      .toEqual(['online-offer', 'offline-offer']);
  });

  it('sorts online merchants by completed trade volume before activity recency', async () => {
    const now = new Date();
    const makeOffer = (id: string, userId: string) => ({
      id,
      type: 'BUY',
      giftCardType: 'Any Gift Card',
      cryptoAsset: 'USDT',
      minLimit: new Prisma.Decimal(10),
      maxLimit: new Prisma.Decimal(1_000),
      exchangeRate: new Prisma.Decimal('0.8'),
      terms: null,
      updatedAt: now,
      user: {
        id: userId,
        lastLoginAt: userId === 'high-volume' ? new Date(now.getTime() - 60 * 60 * 1000) : now,
        isOnline: true,
        onlineUntil: null,
        sellerProfile: { shopName: userId },
        wallets: [{ currency: 'USDT', availableBalance: new Prisma.Decimal(10) }],
        profile: { username: userId, displayName: userId, avatarUrl: null },
      },
    });
    mocks.offerFindMany.mockResolvedValue([
      makeOffer('low-volume-offer', 'low-volume'),
      makeOffer('high-volume-offer', 'high-volume'),
    ]);
    mocks.getTradeMetricsForUsers.mockResolvedValue(new Map([
      ['low-volume', { completionRate: 100, totalCompletedOrders: 5, completedBuyOrders: 0, completedSellOrders: 5, thirtyDayOrders: 5, avgReleaseMinutes: 5 }],
      ['high-volume', { completionRate: 100, totalCompletedOrders: 100, completedBuyOrders: 0, completedSellOrders: 100, thirtyDayOrders: 100, avgReleaseMinutes: 5 }],
    ]));

    const response = await app.inject({
      method: 'GET',
      url: '/offers?type=BUY&asset=USDT',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((offer: { id: string }) => offer.id))
      .toEqual(['high-volume-offer', 'low-volume-offer']);
  });

});
