import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PriceService } from '../services/price.service';
import { getAvailableGiftCardValue, getAvailableGiftCardValueAtPrice, quoteP2PTrade } from '../services/p2p-pricing.service';

describe('Quick P2P pricing', () => {
  it('calculates the payout from gift-card face value and converts it using the live asset price', async () => {
    const getPrices = vi.spyOn(PriceService, 'getUsdPriceDecimal').mockResolvedValue(new Prisma.Decimal(50_000));

    const quote = await quoteP2PTrade(
      new Prisma.Decimal(100),
      new Prisma.Decimal('0.8'),
      'BTC',
    );

    expect(quote.payoutUSD.toString()).toBe('80');
    expect(quote.cryptoUsdPrice.toString()).toBe('50000');
    expect(quote.cryptoAmount.toString()).toBe('0.0016');
    expect(getPrices).toHaveBeenCalledWith('BTC', true);
  });

  it.each([
    ['USDT', '0.98', '80'],
    ['BTC', '50000', '0.0016'],
    ['ETH', '4000', '0.02'],
    ['BNB', '800', '0.1'],
    ['SOL', '160', '0.5'],
    ['LTC', '80', '1'],
  ])('quotes %s using its own spot rate', async (asset, spot, expectedCrypto) => {
    const getPrices = vi.spyOn(PriceService, 'getUsdPriceDecimal').mockResolvedValue(new Prisma.Decimal(spot));
    getPrices.mockClear();

    const quote = await quoteP2PTrade(
      new Prisma.Decimal(100),
      new Prisma.Decimal('0.8'),
      asset,
    );

    expect(quote.cryptoAmount.toString()).toBe(expectedCrypto);
    expect(getPrices).toHaveBeenCalledTimes(asset === 'USDT' ? 0 : 1);
  });

  it.each([
    ['USDT', '1'],
    ['BTC', '0.33333333'],
    ['ETH', '0.333333333333333333'],
    ['BNB', '0.333333333333333333'],
    ['SOL', '0.333333333'],
    ['LTC', '0.33333333'],
  ])('rounds %s to the asset precision', async (asset, expectedCrypto) => {
    vi.spyOn(PriceService, 'getUsdPriceDecimal').mockResolvedValue(new Prisma.Decimal(3));

    const quote = await quoteP2PTrade(
      new Prisma.Decimal(1),
      new Prisma.Decimal(1),
      asset,
    );

    expect(quote.cryptoAmount.toString()).toBe(expectedCrypto);
  });

  it('computes offer capacity as face-value dollars based on available crypto and spot', async () => {
    vi.spyOn(PriceService, 'getUsdPriceDecimal').mockResolvedValue(new Prisma.Decimal(50_000));

    await expect(getAvailableGiftCardValue(
      new Prisma.Decimal('0.01'),
      new Prisma.Decimal('0.8'),
      'BTC',
    )).resolves.toEqual(new Prisma.Decimal(625));
  });

  it('caps gift-card face value using the merchant balance, live spot, and offer payout rate', () => {
    expect(getAvailableGiftCardValueAtPrice(
      new Prisma.Decimal('0.004'),
      new Prisma.Decimal('0.8'),
      new Prisma.Decimal(50_000),
    )).toEqual(new Prisma.Decimal(250));
  });

  it('rejects assets without an explicitly supported live-price route', async () => {
    await expect(quoteP2PTrade(
      new Prisma.Decimal(100),
      new Prisma.Decimal('0.8'),
      'DOGE',
    )).rejects.toThrow('Unsupported P2P crypto asset: DOGE');
  });
});
