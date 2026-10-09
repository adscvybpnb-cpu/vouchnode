import { Decimal } from '@prisma/client/runtime/library';
import { PriceSyncService } from './price-sync.service';

const CRYPTO_DECIMAL_PLACES: Record<string, number> = {
  BTC: 8, BCH: 8, BNB: 18, ETH: 18, SOL: 9, TRX: 6, LTC: 8, USDT: 6, USDC: 6
};

function normalizePriceConversion(amount: Decimal, ticker: string) {
  const decimalPlaces = CRYPTO_DECIMAL_PLACES[ticker];
  if (decimalPlaces === undefined) throw new Error(`Unsupported cryptocurrency: ${ticker}`);
  return amount.toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
}

export class PriceService {
  static getUsdPrices = PriceSyncService.getCryptoUsdRates.bind(PriceSyncService);
  static async getUsdPrice(symbol: string, forceRefresh = false) {
    const ticker = symbol.trim().toUpperCase();
    if (ticker === 'USDT' || ticker === 'USDC') return 1;
    const price = (await PriceSyncService.getCryptoUsdRates(forceRefresh))[ticker];
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      throw new Error(`Live price unavailable for ${symbol}`);
    }
    return price;
  }
  static async getUsdPricesDecimal(forceRefresh = false) {
    const prices = await PriceSyncService.getCryptoUsdRates(forceRefresh);
    return Object.fromEntries(Object.entries(prices).map(([symbol, price]) => [symbol, new Decimal(String(price))]));
  }
  static async getUsdPriceDecimal(symbol: string, forceRefresh = false) {
    return new Decimal(String(await this.getUsdPrice(symbol, forceRefresh)));
  }

  static async convertCryptoToUsd(cryptoAmount: Decimal | number | string, cryptoTicker: string) {
    const amount = new Decimal(String(cryptoAmount));
    if (!amount.isFinite() || amount.isNegative()) throw new Error('Crypto amount must be non-negative');
    return amount.mul(await this.getUsdPriceDecimal(cryptoTicker));
  }

  static async convertUsdToCrypto(usdAmount: Decimal | number | string, cryptoTicker: string) {
    const amount = new Decimal(String(usdAmount));
    if (!amount.isFinite() || amount.isNegative()) throw new Error('USD amount must be non-negative');
    const ticker = cryptoTicker.trim().toUpperCase();
    if (CRYPTO_DECIMAL_PLACES[ticker] === undefined) {
      throw new Error(`Unsupported cryptocurrency: ${cryptoTicker}`);
    }
    const converted = amount.div(await this.getUsdPriceDecimal(ticker));
    return normalizePriceConversion(converted, ticker);
  }
}

export async function convertUsdToCrypto(usdAmount: number, cryptoTicker: string): Promise<number> {
  return Number((await PriceService.convertUsdToCrypto(usdAmount, cryptoTicker)).toString());
}

export async function createLockedCheckoutQuote(usdAmount: number, cryptoTicker: string) {
  if (!Number.isFinite(usdAmount) || usdAmount <= 0) throw new Error('USD amount must be greater than zero');
  const asset = cryptoTicker.trim().toUpperCase();
  const decimalPlaces = CRYPTO_DECIMAL_PLACES[asset];
  if (decimalPlaces === undefined) throw new Error(`Unsupported cryptocurrency: ${cryptoTicker}`);
  const exchangeRate = await PriceService.getUsdPriceDecimal(asset);
  const amount = new Decimal(String(usdAmount)).div(exchangeRate);
  const normalizedAmount = normalizePriceConversion(amount, asset);
  return {
    usdAmount: new Decimal(String(usdAmount)),
    exchangeRate: new Decimal(String(exchangeRate)),
    cryptoAmount: normalizedAmount
  };
}
