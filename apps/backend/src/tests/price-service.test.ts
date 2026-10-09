import { Decimal } from '@prisma/client/runtime/library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PriceService } from '../services/price.service';
import { PriceSyncService } from '../services/price-sync.service';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shared price service', () => {
  it.each(['USDT', 'USDC'])('returns the fixed %s price without calling a provider', async (asset) => {
    const fetchRates = vi.spyOn(PriceSyncService, 'getCryptoUsdRates');

    await expect(PriceService.getUsdPrice(asset)).resolves.toBe(1);

    expect(fetchRates).not.toHaveBeenCalled();
  });

  it('converts USD to volatile crypto at its full configured precision', async () => {
    vi.spyOn(PriceService, 'getUsdPriceDecimal').mockResolvedValue(new Decimal(3));

    await expect(PriceService.convertUsdToCrypto(1, 'ETH'))
      .resolves.toEqual(new Decimal('0.333333333333333333'));
  });

  it('converts a wallet amount to USD through the shared price service', async () => {
    vi.spyOn(PriceService, 'getUsdPriceDecimal').mockResolvedValue(new Decimal(50_000));

    await expect(PriceService.convertCryptoToUsd('0.001', 'BTC'))
      .resolves.toEqual(new Decimal(50));
  });

  it('serves the last known good snapshot when all providers fail', async () => {
    const coinGecko = {
      bitcoin: { usd: 50_000 },
      'bitcoin-cash': { usd: 400 },
      tron: { usd: 0.1 },
      binancecoin: { usd: 800 },
      solana: { usd: 160 },
      ethereum: { usd: 4_000 },
      litecoin: { usd: 80 },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(coinGecko), { status: 200 }))
      .mockRejectedValue(new Error('network unavailable'));
    vi.stubGlobal('fetch', fetchMock);

    const firstSnapshot = await PriceSyncService.getCryptoUsdRates(true);
    const staleSnapshot = await PriceSyncService.getCryptoUsdRates(true);

    expect(firstSnapshot.BTC).toBe(50_000);
    expect(firstSnapshot.USDT).toBe(1);
    expect(firstSnapshot.USDC).toBe(1);
    expect(firstSnapshot).not.toHaveProperty('GRAM');
    expect(staleSnapshot).toEqual(firstSnapshot);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
