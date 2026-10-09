import type { Product } from '@/types/api.types';
import { API_URL } from '@/lib/constants';
import HomePageContent from './HomePageContent';

export const revalidate = 0;

type RecordValue = Record<string, unknown>;
const productStatuses: Product['status'][] = [
  'ACTIVE', 'HIDDEN', 'DRAFT', 'SUSPENDED', 'SOLD', 'SOLD_OUT', 'COMPLETED',
  'ON_SALE', 'EXPIRED', 'PENDING_REVIEW', 'INACTIVE', 'DISPUTED', 'UNDER_REVIEW',
];

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProductStatus(value: unknown): value is Product['status'] {
  return typeof value === 'string' && productStatuses.some((status) => status === value);
}

function toPublicProduct(value: unknown): Product {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.slug !== 'string' || typeof value.name !== 'string') {
    throw new Error('Product response did not contain a valid public listing.');
  }

  const seller = isRecord(value.seller) ? value.seller : {};
  const sellerProfile = isRecord(seller.user) && isRecord(seller.user.profile) ? seller.user.profile : {};
  const sellerId = typeof value.sellerId === 'string'
    ? value.sellerId
    : typeof seller.userId === 'string'
      ? seller.userId
      : null;
  if (!sellerId || !isProductStatus(value.status)) {
    throw new Error('Product response did not contain required public listing fields.');
  }
  const sellerRating = Number(seller.avgRating ?? 0) || 0;
  const reviewCount = Number(seller.reviewCount ?? 0) || 0;
  const images = Array.isArray(value.images)
    ? value.images.filter(isRecord).flatMap((image, index) => (
      typeof image.url === 'string'
        ? [{
          id: typeof image.id === 'string' ? image.id : `${value.id}-image-${index}`,
          url: image.url,
          isPrimary: image.isPrimary === true,
        }]
        : []
    ))
    : [];

  return {
    id: value.id,
    name: value.name,
    slug: value.slug,
    description: typeof value.description === 'string' ? value.description : '',
    currentPrice: Number(value.currentPrice) || 0,
    originalPrice: Number(value.originalPrice) || 0,
    discountPercent: Number(value.discountPercent) || 0,
    currency: typeof value.currency === 'string' ? value.currency : 'USD',
    stock: Number(value.stock) || 0,
    deliveryType: value.deliveryType === 'MANUAL' ? 'MANUAL' : 'INSTANT',
    status: value.status,
    sellerId,
    categoryId: typeof value.categoryId === 'string' ? value.categoryId : undefined,
    category: isRecord(value.category) ? {
      id: typeof value.category.id === 'string' ? value.category.id : undefined,
      name: typeof value.category.name === 'string' ? value.category.name : undefined,
      slug: typeof value.category.slug === 'string' ? value.category.slug : undefined,
    } : undefined,
    brand: typeof value.brand === 'string' ? value.brand : undefined,
    rating: sellerRating,
    reviewCount,
    region: typeof value.regionCode === 'string' ? value.regionCode : undefined,
    regionCode: typeof value.regionCode === 'string' ? value.regionCode : undefined,
    images,
    seller: {
      id: typeof seller.id === 'string' ? seller.id : '',
      userId: typeof seller.userId === 'string' ? seller.userId : '',
      shopName: typeof seller.shopName === 'string' ? seller.shopName : 'Marketplace seller',
      shopSlug: typeof seller.shopSlug === 'string' ? seller.shopSlug : undefined,
      username: typeof sellerProfile.username === 'string' ? sellerProfile.username : undefined,
      status: seller.status === 'ACTIVE' || seller.status === 'PENDING' || seller.status === 'SUSPENDED' || seller.status === 'REJECTED'
        ? seller.status
        : undefined,
      verificationLevel: Number(seller.verificationLevel ?? 0),
      isVerified: Number(seller.verificationLevel) > 0,
      rating: sellerRating,
      avgRating: sellerRating,
      ratingAverage: sellerRating,
      reviewCount,
      ratingCount: reviewCount,
      totalSales: 0,
      avatarUrl: typeof sellerProfile.avatarUrl === 'string' ? sellerProfile.avatarUrl : undefined,
    },
  };
}

async function loadProducts(endpoint: string) {
  try {
    const serverApiUrl = process.env.INTERNAL_API_URL || API_URL;
    const response = await fetch(`${serverApiUrl}${endpoint}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload: unknown = await response.json();
    const rows = Array.isArray(payload)
      ? payload
      : isRecord(payload) && Array.isArray(payload.data)
        ? payload.data
        : isRecord(payload) && isRecord(payload.data) && Array.isArray(payload.data.data)
          ? payload.data.data
          : null;
    if (!rows) throw new Error('Product response was not a listing array.');
    return { products: rows.map(toPublicProduct), available: true };
  } catch (error) {
    console.error(`Unable to prefetch storefront data from ${endpoint}:`, error);
    return { products: [] as Product[], available: false };
  }
}

export default async function HomePage() {
  const featured = await loadProducts('/products/new-arrivals?limit=48');

  return (
    <HomePageContent
      initialFeaturedProducts={featured.products}
      initialDataReady={featured.available}
    />
  );
}
