import { apiClient } from './api.client';
import { marketplaceCategories } from '@/lib/marketplace-data';
import { API_ORIGIN, API_URL } from '@/lib/constants';
import type { Product, ProductFilters, PaginatedResponse, Category } from '../types/api.types';

const normalizeAssetUrl = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback;
  const url = value.trim();
  return url.startsWith('/') || /^https?:\/\//i.test(url) ? url : fallback;
};

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null;

const createListingId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `listing-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const normalizeProduct = (value: unknown): Product => {
  const product = isRecord(value) ? value : {};
  const id = typeof product.id === 'string' && product.id ? product.id : createListingId();
  const sellerId = typeof product.sellerId === 'string' ? product.sellerId : '';
  const rawImages = Array.isArray(product.images) ? product.images : [];
  const images = rawImages
    .filter(isRecord)
    .map((image, index) => ({
      ...image,
      id: typeof image.id === 'string' && image.id ? image.id : `${id}-img-${index}`,
      url: normalizeAssetUrl(image.url, '/placeholder-product.png'),
      isPrimary: image.isPrimary ?? index === 0,
    }));

  return {
  ...product,
  id,
  name: typeof product.name === 'string' ? product.name : 'Untitled listing',
  slug: typeof product.slug === 'string' ? product.slug : id,
  description: typeof product.description === 'string' ? product.description : '',
  sellerId,
  stock: Number.isFinite(Number(product.stock)) ? Number(product.stock) : 0,
  deliveryType: product.deliveryType === 'MANUAL' ? 'MANUAL' : 'INSTANT',
  status: typeof product.status === 'string' ? product.status : 'HIDDEN',
  currentPrice: Number(product.currentPrice ?? product.price ?? 0) || 0,
  originalPrice: Number(product.originalPrice ?? product.currentPrice ?? product.price ?? 0) || 0,
  currency: typeof product.currency === 'string' && product.currency ? product.currency : 'USD',
  images: images.length > 0 ? images : [{ id: `${id}-img`, url: '/placeholder-product.png', isPrimary: true }],
  orders: Array.isArray(product.orders)
    ? product.orders.filter(isRecord).map((order) => ({
        id: typeof order.id === 'string' ? order.id : `${id}-order`,
        status: typeof order.status === 'string' ? order.status : 'UNKNOWN',
        paymentStatus: typeof order.paymentStatus === 'string' ? order.paymentStatus : 'UNKNOWN',
        deliveryStatus: typeof order.deliveryStatus === 'string' ? order.deliveryStatus : 'UNKNOWN',
        createdAt: typeof order.createdAt === 'string' ? order.createdAt : '',
        totalAmount: Number(order.totalAmount) || 0,
        currency: typeof order.currency === 'string' ? order.currency : 'USD',
        transaction: isRecord(order.transaction) ? order.transaction : null,
      }))
    : undefined,
  seller: isRecord(product.seller) ? {
    ...product.seller,
    avatarUrl: normalizeAssetUrl(product.seller.avatarUrl ?? product.seller.logoUrl ?? product.seller.user?.profile?.avatarUrl, '/placeholder-avatar.svg'),
    shopSlug: product.seller.shopSlug ?? product.seller.user?.profile?.username,
    rating: Number(product.seller.rating ?? product.seller.ratingAverage ?? product.seller.avgRating ?? 0),
    ratingAverage: Number(product.seller.ratingAverage ?? product.seller.avgRating ?? product.seller.rating ?? 0),
    reviewCount: Number(product.seller.reviewCount ?? product.seller.ratingCount ?? 0),
    ratingCount: Number(product.seller.ratingCount ?? product.seller.reviewCount ?? 0),
    isVerified: Number(product.seller.verificationLevel ?? 0) > 0,
    isOnline: Boolean(product.seller.isOnline ?? product.seller.user?.isOnline) &&
      (!product.seller.onlineUntil && !product.seller.user?.onlineUntil
        || new Date(product.seller.onlineUntil ?? product.seller.user?.onlineUntil).getTime() > Date.now()),
  } : {
    id: sellerId,
    userId: sellerId,
    shopName: 'Marketplace seller',
    description: 'Verified digital marketplace seller.',
    isVerified: false,
    rating: product.rating ?? 4.9,
    totalSales: 1200,
    responseTime: 8,
    avatarUrl: '/placeholder-avatar.svg',
  },
  offers: Array.isArray(product.offers) ? product.offers.filter(Boolean).map(normalizeProduct) : undefined,
  } as Product;
};

export const productService = {
  async getProducts(filters: ProductFilters = {}) {
    try {
      const query = new URLSearchParams(
        Object.entries(filters)
          .filter(([, value]) => value !== undefined && value !== '' && value !== null)
          .reduce((acc, [key, value]) => {
            acc[key] = String(value);
            return acc;
          }, {} as Record<string, string>)
      ).toString();
      const res = await apiClient.get<PaginatedResponse<Product>>(`/products?${query}`);
      if (res.error || !res.data) throw new Error(res.error || 'Unable to load products');
      if (Array.isArray(res.data)) {
        const normalizedProducts = res.data.map(normalizeProduct);
        return {
          data: normalizedProducts,
          total: normalizedProducts.length,
          page: Number(filters.page ?? 1) || 1,
          limit: Number(filters.limit ?? 20) || 20,
          totalPages: Math.max(1, Math.ceil(normalizedProducts.length / (Number(filters.limit ?? 20) || 20))),
        } satisfies PaginatedResponse<Product>;
      }
      return {
        ...res.data,
        data: res.data.data.map(normalizeProduct),
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unable to load products');
    }
  },
  async getProduct(slug: string) {
    try {
      const res = await apiClient.get<Product>(`/products/${slug}`, { cache: 'no-store' });
      if (res.error || !res.data) throw new Error(res.error || 'Product not found');
      return normalizeProduct(res.data);
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unable to load product');
    }
  },
  async getMyProducts(userId: string, filters: { page?: number; limit?: number; sortOrder?: 'asc' | 'desc'; status?: 'SOLD' } = {}) {
    const query = new URLSearchParams(
      Object.entries({ ...filters, userId }).reduce((result, [key, value]) => {
        if (value !== undefined) result[key] = String(value);
        return result;
      }, {} as Record<string, string>),
    ).toString();
    type ProductListPayload = Product[] | {
      data?: Product[];
      products?: Product[];
      total?: number;
      page?: number;
      limit?: number;
      totalPages?: number;
    };
    const res = await apiClient.get<ProductListPayload>(`/products/mine?${query}`);
    if (res.error || !res.data) throw new Error(res.error || 'Unable to load your listings');
    const payload = res.data;
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : Array.isArray(payload.products) ? payload.products : [];
    return {
      data: rows.map(normalizeProduct),
      total: Array.isArray(payload) ? rows.length : Number(payload.total ?? rows.length),
      page: Array.isArray(payload) ? Number(filters.page ?? 1) : Number(payload.page ?? filters.page ?? 1),
      limit: Array.isArray(payload) ? Number(filters.limit ?? 50) : Number(payload.limit ?? filters.limit ?? 50),
      totalPages: Array.isArray(payload) ? 1 : Number(payload.totalPages ?? 1),
    };
  },
  async getOffers(slug: string) {
    const res = await apiClient.get<Product[]>(`/products/${slug}/offers`);
    if (res.error || !res.data) return [];
    return (Array.isArray(res.data) ? res.data : []).map(normalizeProduct);
  },
  async createProduct(data: {
    name: string; description: string; categoryId: string; category: string; brand?: string; region?: string;
    originalPrice: number; currentPrice: number; deliveryType: 'INSTANT' | 'MANUAL';
    images: string[]; inventoryDetails?: string[]; tags?: string[];
  }) {
    const payload = {
      ...data,
      originalPrice: Number(data.originalPrice),
      currentPrice: Number(data.currentPrice),
      tags: data.tags || [],
      images: data.images.map((url) => /^https?:\/\//i.test(url) ? url : `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`),
    };
    const res = await apiClient.post<Product>('/products', payload);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async updateProduct(id: string, data: any) {
    const res = await apiClient.patch<Product>(`/products/${id}`, data);
    if (res.error || !res.data) throw new Error(res.error || 'Unable to update listing');
    return normalizeProduct(res.data);
  },
  async updateProductStatus(id: string, status: 'ACTIVE' | 'HIDDEN') {
    const res = await apiClient.patch<Product>(`/products/${id}/status`, { status });
    if (res.error || !res.data) throw new Error(res.error || 'Unable to update listing visibility');
    return normalizeProduct(res.data);
  },
  async cloneProduct(id: string, digitalCode: string) {
    const res = await apiClient.post<Product>(`/products/${id}/clone`, { digitalCode });
    if (res.error || !res.data) throw new Error(res.error || 'Unable to duplicate listing');
    return normalizeProduct(res.data);
  },
  async addInventory(id: string, codes: string[]) {
    const res = await apiClient.post<{ message: string }>(`/products/${id}/inventory`, { codes });
    if (res.error) throw new Error(res.error);
    if (!res.data) throw new Error('Unable to create listing');
    return normalizeProduct(res.data);
  },
  async deleteProduct(id: string) {
    const res = await apiClient.delete(`/products/${id}`);
    if (res.error) throw new Error(res.error);
  },
  async getCategories() {
    try {
      const res = await apiClient.get<Category[]>('/categories');
      return res.data && res.data.length > 0 ? res.data : (marketplaceCategories as unknown as Category[]);
    } catch {
      return marketplaceCategories as unknown as Category[];
    }
  },
  async getFeaturedProducts() {
    const res = await apiClient.get<PaginatedResponse<Product>>('/products?status=ACTIVE&limit=6&sortBy=createdAt&sortOrder=desc');
    if (res.error || !res.data) throw new Error(res.error || 'Unable to load products');
    return (Array.isArray(res.data) ? res.data : res.data.data).map(normalizeProduct);
  },
  async getTrendingProducts() {
    const res = await apiClient.get<Product[]>('/products/trending?limit=6');
    if (res.error || !res.data) throw new Error(res.error || 'Unable to load products');
    return res.data.map(normalizeProduct);
  },
  async getBestSellers() {
    const res = await apiClient.get<Product[]>('/products/best-sellers?limit=6');
    if (res.error || !res.data) throw new Error(res.error || 'Unable to load products');
    return res.data.map(normalizeProduct);
  },
  async getNewArrivals(limit = 48) {
    const res = await apiClient.get<Product[]>(`/products/new-arrivals?limit=${limit}`, { cache: 'no-store' });
    if (res.error || !res.data) throw new Error(res.error || 'Unable to load products');
    return res.data.map(normalizeProduct);
  },
  async getInstantDeliveryProducts() {
    const res = await apiClient.get<Product[]>('/products/instant?limit=6');
    if (res.error || !res.data) throw new Error(res.error || 'Unable to load products');
    return res.data.map(normalizeProduct);
  },
  async uploadProductImage(file: File) {
    const formData = new FormData();
    formData.append('image', file);
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth-storage') : '';
    const apiUrl = API_URL.replace(/\/+$/, '');
    const res = await fetch(`${apiUrl}/products/upload-image`, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${(JSON.parse(token || '{}') as any)?.state?.accessToken}` },
    });
    if (!res.ok) throw new Error('Upload failed');
    return (await res.json()) as { url: string };
  },
};
