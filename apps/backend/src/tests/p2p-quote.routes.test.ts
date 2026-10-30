import Fastify from 'fastify';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  offerFindUnique: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    p2POffer: { findUnique: mocks.offerFindUnique },
  },
}));

vi.mock('../middleware/auth.middleware', () => ({
  authenticate: vi.fn(),
}));

vi.mock('../services/p2p-profile.service', () => ({
  P2PProfileService: { getTradeMetricsForUsers: vi.fn() },
}));

vi.mock('../services/p2p-order.service', () => ({
  P2POrderService: {},
}));

import { PriceService } from '../services/price.service';
import p2pRoutes from '../routes/p2p.routes';

describe('P2P live quote route', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    mocks.offerFindUnique.mockResolvedValue({
      id: 'offer-1',
      cryptoAsset: 'BTC',
      exchangeRate: new Prisma.Decimal('0.8'),
      minLimit: new Prisma.Decimal('10'),
      maxLimit: new Prisma.Decimal('1000'),
      isActive: true,
    });
    vi.spyOn(PriceService, 'getUsdPriceDecimal').mockResolvedValue(new Prisma.Decimal('50000'));
    await app.register(p2pRoutes);
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('returns the payout and crypto amount for the requested gift-card value', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/offers/offer-1/quote?giftCardValueUSD=10',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      giftCardValueUSD: 10,
      payoutUSD: '8.00',
      cryptoUsdPrice: '50000',
      cryptoAmount: '0.00016',
    });
    expect(PriceService.getUsdPriceDecimal).toHaveBeenCalledWith('BTC', false);
  });

  it('rejects invalid and out-of-limit amounts before requesting a quote', async () => {
    const invalidAmount = await app.inject({
      method: 'GET',
      url: '/offers/offer-1/quote?giftCardValueUSD=not-a-number',
    });
    const outOfLimitAmount = await app.inject({
      method: 'GET',
      url: '/offers/offer-1/quote?giftCardValueUSD=9',
    });

    expect(invalidAmount.statusCode).toBe(400);
    expect(outOfLimitAmount.statusCode).toBe(400);
    expect(PriceService.getUsdPriceDecimal).not.toHaveBeenCalled();
  });
});
