export interface GiftCardSeed {
  slug: string;
  name: string;
  brand: string;
  value: number;
  currentPrice: number;
  imageUrl: string;
  categorySlug: string;
  codePrefix: string;
  reviewCount: number;
  rating: number;
}

const giftCardFamilies = [
  { brand: 'Google Play', slug: 'google-play', codePrefix: 'GPLAY', values: [5, 10, 15, 25, 50, 100] },
  { brand: 'Apple iTunes', slug: 'apple-itunes', codePrefix: 'ITUNES', values: [5, 10, 15, 25, 50, 100] },
  { brand: 'Amazon', slug: 'amazon', codePrefix: 'AMZN', values: [5, 10, 25, 50, 75, 100] },
  { brand: 'PlayStation Store', slug: 'playstation', codePrefix: 'PSN', values: [10, 25, 50, 75, 100] },
  { brand: 'Xbox', slug: 'xbox', codePrefix: 'XBOX', values: [10, 25, 50, 75, 100] },
  { brand: 'Nintendo eShop', slug: 'nintendo', codePrefix: 'NINTENDO', values: [10, 20, 35, 50, 99] },
  { brand: 'Razer Gold', slug: 'razer-gold', codePrefix: 'RAZER', values: [10, 20, 50, 100] },
  { brand: 'Starbucks', slug: 'starbucks', codePrefix: 'STARBUCKS', values: [10, 25, 50, 100] },
  { brand: "Dunkin' Donuts", slug: 'dunkin-donuts', codePrefix: 'DUNKIN', values: [10, 25, 50, 100] },
] as const;

const images: Record<string, string> = Object.fromEntries(
  giftCardFamilies.map((family) => [family.slug, `https://placehold.co/640x400/111827/ffffff?text=${encodeURIComponent(family.brand)}`]),
);

export const giftCardSeed: GiftCardSeed[] = giftCardFamilies.flatMap((family) =>
  family.values.map((value) => ({
    slug: `${family.slug}-${value}`,
    name: `${family.brand} $${value} Gift Card`,
    brand: family.brand,
    value,
    currentPrice: Number((value * 0.98).toFixed(2)),
    imageUrl: images[family.slug],
    categorySlug: 'gift-cards',
    codePrefix: family.codePrefix,
    reviewCount: 200 + value,
    rating: 4.8,
  })),
);
