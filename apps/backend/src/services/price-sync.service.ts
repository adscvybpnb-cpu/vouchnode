import { prisma } from '../lib/prisma';
import { config } from '../config';

const COIN_GECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  BCH: 'bitcoin-cash',
  TRX: 'tron',
  BNB: 'binancecoin',
  SOL: 'solana',
  ETH: 'ethereum',
  LTC: 'litecoin',
};
const BINANCE_SYMBOLS: Record<string, string> = {
  BTC: 'BTCUSDT',
  BCH: 'BCHUSDT',
  TRX: 'TRXUSDT',
  BNB: 'BNBUSDT',
  SOL: 'SOLUSDT',
  ETH: 'ETHUSDT',
  LTC: 'LTCUSDT',
};
const COIN_CAP_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  BCH: 'bitcoin-cash',
  TRX: 'tron',
  BNB: 'binance-coin',
  SOL: 'solana',
  ETH: 'ethereum',
  LTC: 'litecoin',
};
const COIN_MARKET_CAP_IDS: Record<string, string> = {
  BTC: '1',
  BCH: '1831',
  TRX: '1958',
  BNB: '1839',
  SOL: '5426',
  ETH: '1027',
  LTC: '2',
};
const COIN_LORE_IDS: Record<string, string> = {
  BTC: '90',
  BCH: '2321',
  TRX: '2713',
  BNB: '2710',
  SOL: '48543',
  ETH: '80',
  LTC: '1',
};
const STABLECOIN_RATES = { USDT: 1, USDC: 1 };
const CRYPTO_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 3_000;
const DATABASE_PRICE_SNAPSHOT_KEY = 'crypto_prices_last_known';
type Rates = Record<string, number>;
type PriceSnapshot = { rates: Rates; updatedAt: number; source: string };

export class PriceSyncService {
  private static crypto: PriceSnapshot | null = null;
  private static cryptoRequest: Promise<PriceSnapshot> | null = null;
  private static pollingTimer: NodeJS.Timeout | null = null;

  static async getCryptoUsdRates(forceRefresh = false): Promise<Rates> {
    if (!forceRefresh && this.crypto && this.crypto.updatedAt + CRYPTO_TTL_MS > Date.now()) {
      return { ...this.crypto.rates };
    }
    const snapshot = await this.refresh();
    return { ...snapshot.rates };
  }

  static async refresh(): Promise<PriceSnapshot> {
    if (this.cryptoRequest) return this.cryptoRequest;
    this.cryptoRequest = this.fetchFromProviders()
      .then(({ rates, source }) => {
        const snapshot = {
          rates: { ...rates, ...STABLECOIN_RATES },
          updatedAt: Date.now(),
          source,
        };
        this.crypto = snapshot;
        void this.persistSnapshot(snapshot).catch((error: unknown) => {
          console.warn('Unable to persist the last known crypto prices', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        return snapshot;
      })
      .catch((cause: unknown) => {
        return this.loadPersistedSnapshot().then((persistedSnapshot) => {
          const cachedSnapshot = [this.crypto, persistedSnapshot]
            .filter((snapshot): snapshot is PriceSnapshot => snapshot !== null)
            .sort((left, right) => right.updatedAt - left.updatedAt)[0];
          if (!cachedSnapshot) throw cause;
          this.crypto = cachedSnapshot;
          console.warn('Crypto price providers unavailable; serving last known good prices', {
            source: cachedSnapshot.source,
            ageMs: Date.now() - cachedSnapshot.updatedAt,
            error: cause instanceof Error ? cause.message : String(cause),
          });
          return cachedSnapshot;
        });
      })
      .finally(() => { this.cryptoRequest = null; });
    return this.cryptoRequest;
  }

  static startPolling(intervalMs = CRYPTO_TTL_MS): () => void {
    if (this.pollingTimer) return () => this.stopPolling();
    void this.refresh().catch((cause: unknown) => {
      console.error('Initial crypto price refresh failed; no prior price snapshot is available', cause);
    });
    this.pollingTimer = setInterval(() => {
      void this.refresh().catch((cause: unknown) => {
        console.error('Scheduled crypto price refresh failed', cause);
      });
    }, intervalMs);
    this.pollingTimer.unref();
    return () => this.stopPolling();
  }

  static stopPolling() {
    if (!this.pollingTimer) return;
    clearInterval(this.pollingTimer);
    this.pollingTimer = null;
  }

  static getSnapshotMetadata() {
    if (!this.crypto) return null;
    return {
      updatedAt: new Date(this.crypto.updatedAt).toISOString(),
      ageMs: Date.now() - this.crypto.updatedAt,
      source: this.crypto.source,
      stale: Date.now() - this.crypto.updatedAt > CRYPTO_TTL_MS,
    };
  }

  private static async fetchFromProviders(): Promise<{ rates: Rates; source: string }> {
    const failures: string[] = [];
    const providers: Array<{ name: string; fetch: () => Promise<Rates> }> = [
      { name: 'CoinGecko', fetch: () => this.fetchCoinGecko() },
      { name: 'Binance', fetch: () => this.fetchBinance() },
      { name: 'CryptoCompare', fetch: () => this.fetchCryptoCompare() },
      { name: 'CoinMarketCap', fetch: () => this.fetchCoinMarketCap() },
      { name: 'CoinCap', fetch: () => this.fetchCoinCap() },
      { name: 'CoinLore', fetch: () => this.fetchCoinLore() },
    ];
    for (const provider of providers) {
      if (provider.name === 'CoinMarketCap' && !config.crypto.prices.coinMarketCapApiKey) {
        failures.push('CoinMarketCap: skipped; COINMARKETCAP_API_KEY is not configured');
        continue;
      }
      try {
        return { rates: await provider.fetch(), source: provider.name };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        failures.push(`${provider.name}: ${message}`);
        console.warn(`Crypto price provider ${provider.name} failed`, { error: message });
      }
    }
    throw new Error(`All live crypto price providers failed. ${failures.join('; ')}`);
  }

  private static async fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    const response = await fetch(url, {
      headers: { accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`provider returned HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }

  private static async fetchCoinGecko(): Promise<Rates> {
    const ids = Object.values(COIN_GECKO_IDS).join(',');
    const payload = await this.fetchJson<Record<string, { usd?: number }>>(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`,
    );
    return this.validateRates(Object.fromEntries(
      Object.entries(COIN_GECKO_IDS).map(([symbol, id]) => [symbol, payload[id]?.usd]),
    ));
  }

  private static async fetchBinance(): Promise<Rates> {
    const symbols = encodeURIComponent(JSON.stringify(Object.values(BINANCE_SYMBOLS)));
    const payload = await this.fetchJson<Array<{ symbol?: string; price?: string }>>(
      `https://api.binance.com/api/v3/ticker/price?symbols=${symbols}`,
    );
    const byPair = new Map(payload.map((item) => [item.symbol, Number(item.price)]));
    return this.validateRates(Object.fromEntries(
      Object.entries(BINANCE_SYMBOLS).map(([symbol, pair]) => [symbol, byPair.get(pair)]),
    ));
  }

  private static async fetchCoinCap(): Promise<Rates> {
    const ids = Object.values(COIN_CAP_IDS).join(',');
    const payload = await this.fetchJson<{ data?: Array<{ id?: string; priceUsd?: string }> }>(
      `https://api.coincap.io/v2/assets?ids=${encodeURIComponent(ids)}`,
    );
    const byId = new Map((payload.data || []).map((item) => [item.id, Number(item.priceUsd)]));
    return this.validateRates(Object.fromEntries(
      Object.entries(COIN_CAP_IDS).map(([symbol, id]) => [symbol, byId.get(id)]),
    ));
  }

  private static async fetchCryptoCompare(): Promise<Rates> {
    const symbols = Object.keys(COIN_GECKO_IDS).join(',');
    const headers = config.crypto.prices.cryptoCompareApiKey
      ? { authorization: `Apikey ${config.crypto.prices.cryptoCompareApiKey}` }
      : {};
    const payload = await this.fetchJson<Record<string, { USD?: number }>>(
      `https://min-api.cryptocompare.com/data/pricemulti?fsyms=${encodeURIComponent(symbols)}&tsyms=USD`,
      headers,
    );
    return this.validateRates(Object.fromEntries(
      Object.keys(COIN_GECKO_IDS).map((symbol) => [symbol, payload[symbol]?.USD]),
    ));
  }

  private static async fetchCoinMarketCap(): Promise<Rates> {
    const ids = Object.values(COIN_MARKET_CAP_IDS).join(',');
    const payload = await this.fetchJson<{
      data?: Record<string, { quote?: { USD?: { price?: number } } }>;
    }>(
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?id=${encodeURIComponent(ids)}`,
      { 'X-CMC_PRO_API_KEY': config.crypto.prices.coinMarketCapApiKey ?? '' },
    );
    return this.validateRates(Object.fromEntries(
      Object.entries(COIN_MARKET_CAP_IDS).map(([symbol, id]) => [
        symbol,
        payload.data?.[id]?.quote?.USD?.price,
      ]),
    ));
  }

  private static async fetchCoinLore(): Promise<Rates> {
    const ids = Object.values(COIN_LORE_IDS).join(',');
    const payload = await this.fetchJson<Array<{ id?: string; price_usd?: string }>>(
      `https://api.coinlore.net/api/ticker/?id=${encodeURIComponent(ids)}`,
    );
    const byId = new Map((payload || []).map((item) => [item.id, Number(item.price_usd)]));
    return this.validateRates(Object.fromEntries(
      Object.entries(COIN_LORE_IDS).map(([symbol, id]) => [symbol, byId.get(id)]),
    ));
  }

  private static async persistSnapshot(snapshot: PriceSnapshot) {
    await prisma.systemSetting.upsert({
      where: { key: DATABASE_PRICE_SNAPSHOT_KEY },
      create: {
        key: DATABASE_PRICE_SNAPSHOT_KEY,
        value: JSON.stringify(snapshot),
        type: 'JSON',
        group: 'system',
        description: 'Last validated crypto USD price snapshot used for provider failover.',
      },
      update: {
        value: JSON.stringify(snapshot),
        type: 'JSON',
      },
    });
  }

  private static async loadPersistedSnapshot(): Promise<PriceSnapshot | null> {
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: DATABASE_PRICE_SNAPSHOT_KEY },
        select: { value: true },
      });
      if (!setting) return null;
      const parsed: unknown = JSON.parse(setting.value);
      if (!parsed || typeof parsed !== 'object') return null;
      const snapshot = parsed as Partial<PriceSnapshot>;
      if (
        typeof snapshot.updatedAt !== 'number' ||
        !Number.isFinite(snapshot.updatedAt) ||
        typeof snapshot.source !== 'string' ||
        !snapshot.rates ||
        typeof snapshot.rates !== 'object'
      ) return null;
      return {
        rates: { ...this.validateRates(snapshot.rates), ...STABLECOIN_RATES },
        updatedAt: snapshot.updatedAt,
        source: `database:${snapshot.source}`,
      };
    } catch (error) {
      console.warn('Unable to load persisted crypto price snapshot', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private static validateRates(rates: Record<string, unknown>): Rates {
    const missing = Object.keys(COIN_GECKO_IDS).filter((symbol) => {
      const rate = rates[symbol];
      return typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0;
    });
    if (missing.length > 0) throw new Error(`Missing valid rates for ${missing.join(', ')}`);
    return Object.fromEntries(Object.keys(COIN_GECKO_IDS).map((symbol) => [
      symbol,
      rates[symbol] as number,
    ]));
  }
}
