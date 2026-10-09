import { Decimal } from '@prisma/client/runtime/library';

const DEFAULT_PRECISION = 5;
const PRECISION_OVERRIDES: Record<string, number> = {
  BTC: 5,
  BCH: 5,
  LTC: 5,
  TRX: 5,
  SOL: 5,
  BNB: 5,
  ETH: 5,
  ARBITRUM_ONE: 5,
  BASE: 5,
  OPTIMISM: 5,
  USDT: 5,
  USDC: 5,
  USD: 2,
};

const normalizeAssetKey = (asset: string) => String(asset ?? '').trim().toUpperCase();

export function getCryptoAmountPrecision(asset: string, network?: string): number {
  const key = normalizeAssetKey(asset || network || '');
  if (!key) return DEFAULT_PRECISION;
  const networkKey = network ? normalizeAssetKey(network) : '';
  const value = PRECISION_OVERRIDES[key] ?? PRECISION_OVERRIDES[networkKey] ?? DEFAULT_PRECISION;
  return Number.isFinite(value) ? value : DEFAULT_PRECISION;
}

export function normalizeCryptoAmount(value: Decimal | string | number, asset: string, network?: string): Decimal {
  const decimalValue = value instanceof Decimal ? value : new Decimal(String(value));
  const precision = getCryptoAmountPrecision(asset, network);
  return decimalValue.toDecimalPlaces(precision, Decimal.ROUND_HALF_UP).toString() === '-0'
    ? new Decimal(0)
    : new Decimal(decimalValue.toDecimalPlaces(precision, Decimal.ROUND_HALF_UP).toString());
}

export function amountMatchesTolerance(
  actual: Decimal | string | number,
  expected: Decimal | string | number,
  asset: string,
  network?: string,
): boolean {
  const actualValue = actual instanceof Decimal ? actual : new Decimal(String(actual));
  const expectedValue = expected instanceof Decimal ? expected : new Decimal(String(expected));
  const precision = getCryptoAmountPrecision(asset, network);
  const tolerance = new Decimal(10).pow(-precision).mul(5);
  return actualValue.sub(expectedValue).abs().lte(tolerance);
}

export function formatCryptoDisplay(value: Decimal | string | number, asset: string, network?: string): number {
  return normalizeCryptoAmount(value, asset, network).toNumber();
}
