import { Decimal } from '@prisma/client/runtime/library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PriceService } from '../services/price.service';
import { PriceSyncService } from '../services/price-sync.service';

const priceSettingMocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    systemSetting: {
      findUnique: priceSettingMocks.findUnique,
      upsert: priceSettingMocks.upsert,
    },
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  priceSettingMocks.findUnique.mockReset();
  priceSettingMocks.upsert.mockReset();
  (PriceSyncService as unknown as { crypto: unknown }).crypto = null;
  (PriceSyncService as unknown as { cryptoRequest: unknown }).cryptoRequest = null;
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
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('immediately falls through to the next provider after an HTTP rate limit', async () => {
    const binancePrices = [
      { symbol: 'BTCUSDT', price: '50000' },
      { symbol: 'BCHUSDT', price: '400' },
      { symbol: 'TRXUSDT', price: '0.1' },
      { symbol: 'BNBUSDT', price: '800' },
      { symbol: 'SOLUSDT', price: '160' },
      { symbol: 'ETHUSDT', price: '4000' },
      { symbol: 'LTCUSDT', price: '80' },
    ];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(binancePrices), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await PriceSyncService.getCryptoUsdRates(true);

    expect(result.BTC).toBe(50_000);
    expect(PriceSyncService.getSnapshotMetadata()?.source).toBe('Binance');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses the database snapshot after all configured live providers fail', async () => {
    const rates = {
      BTC: 50_000,
      BCH: 400,
      TRX: 0.1,
      BNB: 800,
      SOL: 160,
      ETH: 4_000,
      LTC: 80,
    };
    const updatedAt = Date.now() - 3_600_000;
    priceSettingMocks.findUnique.mockResolvedValue({
      value: JSON.stringify({ rates, updatedAt, source: 'CoinGecko' }),
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    const result = await PriceSyncService.getCryptoUsdRates(true);

    expect(result.BTC).toBe(50_000);
    expect(result.USDT).toBe(1);
    expect(PriceSyncService.getSnapshotMetadata()).toMatchObject({
      source: 'database:CoinGecko',
      stale: true,
    });
    expect(priceSettingMocks.findUnique).toHaveBeenCalledWith({
      where: { key: 'crypto_prices_last_known' },
      select: { value: true },
    });
  });

  it('persists validated live prices as the database fallback snapshot', async () => {
    const coinGecko = {
      bitcoin: { usd: 50_000 },
      'bitcoin-cash': { usd: 400 },
      tron: { usd: 0.1 },
      binancecoin: { usd: 800 },
      solana: { usd: 160 },
      ethereum: { usd: 4_000 },
      litecoin: { usd: 80 },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(coinGecko), { status: 200 }),
    ));

    await PriceSyncService.getCryptoUsdRates(true);
    await Promise.resolve();

    expect(priceSettingMocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'crypto_prices_last_known' },
      create: expect.objectContaining({ type: 'JSON', group: 'system' }),
      update: expect.objectContaining({ type: 'JSON' }),
    }));
  });

  it('fails explicitly when providers fail and no database snapshot exists', async () => {
    priceSettingMocks.findUnique.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    await expect(PriceSyncService.getCryptoUsdRates(true))
      .rejects.toThrow('All live crypto price providers failed');
  });
});
