export const INTERNAL_ASSET_PRICE_USD: Record<string, number> = {
  USD: 1,
  BTC: 65000,
  USDT: 1,
  ETH: 3400,
  BNB: 560,
  SOL: 140,
  LTC: 75,
  TRX: 0.13,
  USDC: 1,
  BCH: 430,
  GRAM: 0.25,
};

export const INTERNAL_PRIMARY_ASSET_CODES = ['BTC', 'USDT', 'ETH', 'BNB', 'SOL', 'LTC', 'TRX', 'USDC'];
export const INTERNAL_OPTIONAL_ASSET_CODES = ['BCH', 'GRAM'];
export const INTERNAL_SUPPORTED_ASSET_CODES = [...INTERNAL_PRIMARY_ASSET_CODES, ...INTERNAL_OPTIONAL_ASSET_CODES];
export const INTERNAL_SWAP_FEE_RATE = 0.01;

export function normalizeAssetCode(code?: string) {
  return (code || '').trim().toUpperCase();
}

export function isSupportedInternalAsset(code?: string) {
  return INTERNAL_SUPPORTED_ASSET_CODES.includes(normalizeAssetCode(code));
}

export function assetToUsd(amount: number, currency: string) {
  const normalized = normalizeAssetCode(currency);
  const rate = INTERNAL_ASSET_PRICE_USD[normalized] ?? 0;
  return Number(amount) * rate;
}

export function usdToAsset(amount: number, currency: string) {
  const normalized = normalizeAssetCode(currency);
  const rate = INTERNAL_ASSET_PRICE_USD[normalized] ?? 0;
  if (!rate) return 0;
  return Number(amount) / rate;
}

export function convertAssetAmount(amount: number, fromCurrency: string, toCurrency: string, includeFee = true) {
  const from = normalizeAssetCode(fromCurrency);
  const to = normalizeAssetCode(toCurrency);
  const fromUsd = assetToUsd(amount, from);
  const feeMultiplier = includeFee ? 1 - INTERNAL_SWAP_FEE_RATE : 1;
  const afterFeeUsd = fromUsd * feeMultiplier;
  const toRate = INTERNAL_ASSET_PRICE_USD[to] ?? 0;
  if (!toRate) return 0;
  return afterFeeUsd / toRate;
}
