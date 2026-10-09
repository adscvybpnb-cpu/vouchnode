import { apiClient } from './api.client';
import type { Seller, SellerStats, Product, Order, PaginatedResponse } from '../types/api.types';

export const sellerService = {
  async getMySellerStatus() {
    const res = await apiClient.get<{
      status: 'approved' | 'pending' | 'rejected' | 'none';
      kycSkipped: boolean;
    }>('/sellers/me/status');
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getOnboardingPolicy() {
    const res = await apiClient.get<{ fastLaunchEnabled: boolean }>('/sellers/onboarding-policy', { cache: 'no-store' });
    if (res.error) throw new Error(res.error);
    if (typeof res.data?.fastLaunchEnabled !== 'boolean') {
      throw new Error('Seller onboarding policy response was invalid.');
    }
    return res.data;
  },
  async checkShopNameAvailability(shopName: string) {
    const query = new URLSearchParams({ shopName }).toString();
    const res = await apiClient.get<{ available: boolean }>(`/sellers/shop-name-availability?${query}`, { cache: 'no-store' });
    if (res.error) throw new Error(res.error);
    if (typeof res.data?.available !== 'boolean') {
      throw new Error('Shop name availability response was invalid.');
    }
    return res.data.available;
  },
  async getSeller(username: string) {
    const res = await apiClient.get<Seller>(`/sellers/${username}`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getSellerProducts(userId: string, filters?: any) {
    const query = new URLSearchParams(filters || {}).toString();
    const res = await apiClient.get<PaginatedResponse<Product>>(`/sellers/${userId}/products?${query}`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async applyToSell(data: FormData) {
    const res = await apiClient.upload<{ status: string; data?: Seller; kycSkipped?: boolean }>('/sellers/apply', data);
    if (res.error) {
      const error = new Error(res.error) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }
    if (!res.data) {
      throw new Error('Seller application response was empty.');
    }
    return res.data;
  },
  async getMySellerProfile() {
    const res = await apiClient.get<Seller>('/sellers/me');
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async updateSellerSettings(data: any) {
    const res = await apiClient.patch<Seller>('/sellers/me', data);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getTopSellers() {
    const res = await apiClient.get<Seller[]>('/sellers/top');
    return res.data || [];
  },
  async getSellerOrders(filters?: any) {
    const query = new URLSearchParams(filters || {}).toString();
    const res = await apiClient.get<PaginatedResponse<Order>>(`/sellers/me/orders?${query}`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getSellerStats() {
    const res = await apiClient.get<SellerStats>('/sellers/me/stats');
    if (res.error) throw new Error(res.error);
    return res.data!;
  }
};
