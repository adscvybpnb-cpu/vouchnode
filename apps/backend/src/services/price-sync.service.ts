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
const STABLECOIN_RATES = { USDT: 1, USDC: 1 };
const CRYPTO_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
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
        return snapshot;
      })
      .catch((cause: unknown) => {
        if (this.crypto) {
          console.warn('Crypto price providers unavailable; serving last known good prices', {
            source: this.crypto.source,
            ageMs: Date.now() - this.crypto.updatedAt,
            error: cause instanceof Error ? cause.message : String(cause),
          });
          return this.crypto;
        }
        throw cause;
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
      { name: 'CoinCap', fetch: () => this.fetchCoinCap() },
    ];
    for (const provider of providers) {
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

  private static async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
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
