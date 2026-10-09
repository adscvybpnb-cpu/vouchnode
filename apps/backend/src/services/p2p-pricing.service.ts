import { Prisma } from '@prisma/client';
import { PriceService } from './price.service';

export const P2P_SUPPORTED_ASSETS = ['USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'LTC'] as const;

export type P2PAsset = typeof P2P_SUPPORTED_ASSETS[number];

const ASSET_DECIMAL_PLACES: Record<P2PAsset, number> = {
  USDT: 6,
  BTC: 8,
  ETH: 18,
  BNB: 18,
  SOL: 9,
  LTC: 8,
};

export function isP2PAsset(asset: string): asset is P2PAsset {
  return P2P_SUPPORTED_ASSETS.includes(asset.trim().toUpperCase() as P2PAsset);
}

export async function getP2PSpotPrice(asset: string, forceRefresh = false): Promise<Prisma.Decimal> {
  const normalizedAsset = asset.trim().toUpperCase();
  if (!isP2PAsset(normalizedAsset)) {
    throw new Error(`Unsupported P2P crypto asset: ${asset}`);
  }
  if (normalizedAsset === 'USDT') return new Prisma.Decimal(1);
  return PriceService.getUsdPriceDecimal(normalizedAsset, forceRefresh);
}

export async function quoteP2PTrade(
  giftCardValueUSD: Prisma.Decimal,
  giftCardRate: Prisma.Decimal,
  asset: string,
) {
  const normalizedAsset = asset.trim().toUpperCase();
  if (!isP2PAsset(normalizedAsset)) {
    throw new Error(`Unsupported P2P crypto asset: ${asset}`);
  }
  if (!giftCardValueUSD.isFinite() || giftCardValueUSD.lte(0) ||
      !giftCardRate.isFinite() || giftCardRate.lte(0)) {
    throw new Error('Gift card value and payout rate must be greater than zero');
  }

  const cryptoUsdPrice = await getP2PSpotPrice(normalizedAsset, true);
  if (!cryptoUsdPrice.isFinite() || cryptoUsdPrice.lte(0)) {
    throw new Error(`Live USD price unavailable for ${normalizedAsset}`);
  }
  const payoutUSD = giftCardValueUSD
    .mul(giftCardRate)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (payoutUSD.lte(0)) {
    throw new Error('Gift card value and payout rate produce a payout below $0.01');
  }

  const cryptoAmount = payoutUSD
    .div(cryptoUsdPrice)
    .toDecimalPlaces(ASSET_DECIMAL_PLACES[normalizedAsset], Prisma.Decimal.ROUND_HALF_UP);
  if (cryptoAmount.lte(0)) {
    throw new Error(`Payout is too small to settle in ${normalizedAsset}`);
  }

  return { payoutUSD, cryptoUsdPrice, cryptoAmount };
}

export async function getAvailableGiftCardValue(
  cryptoBalance: Prisma.Decimal,
  giftCardRate: Prisma.Decimal,
  asset: string,
): Promise<Prisma.Decimal> {
  const spotPrice = await getP2PSpotPrice(asset);
  return getAvailableGiftCardValueAtPrice(cryptoBalance, giftCardRate, spotPrice);
}

export function getAvailableGiftCardValueAtPrice(
  cryptoBalance: Prisma.Decimal,
  giftCardRate: Prisma.Decimal,
  cryptoUsdPrice: Prisma.Decimal,
): Prisma.Decimal {
  if (!cryptoBalance.isFinite() || cryptoBalance.lte(0) ||
      !giftCardRate.isFinite() || giftCardRate.lte(0) ||
      !cryptoUsdPrice.isFinite() || cryptoUsdPrice.lte(0)) {
    return new Prisma.Decimal(0);
  }
  return cryptoBalance
    .mul(cryptoUsdPrice)
    .div(giftCardRate)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}

export async function deactivateUnfundedP2POffers(
  tx: Prisma.TransactionClient,
  userId: string,
  asset: string,
  availableBalance: Prisma.Decimal,
  cryptoUsdPrice: Prisma.Decimal,
): Promise<string[]> {
  const offers = await tx.p2POffer.findMany({
    where: { userId, cryptoAsset: asset, type: 'BUY', isActive: true },
    select: { id: true, minLimit: true, exchangeRate: true },
  });
  const deactivated: string[] = [];
  for (const offer of offers) {
    const capacity = getAvailableGiftCardValueAtPrice(
      availableBalance,
      new Prisma.Decimal(offer.exchangeRate),
      cryptoUsdPrice,
    );
    if (capacity.lt(10) || capacity.lt(offer.minLimit)) {
      const result = await tx.p2POffer.updateMany({
        where: { id: offer.id, isActive: true },
        data: { isActive: false },
      });
      if (result.count > 0) deactivated.push(offer.id);
    }
  }
  return deactivated;
}
