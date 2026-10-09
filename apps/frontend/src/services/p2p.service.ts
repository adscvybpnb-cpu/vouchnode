import { apiClient } from './api.client';

export type P2POffer = {
  id: string;
  userId: string;
  merchantId: string;
  merchantName: string;
  username: string;
  avatarUrl: string | null;
  completionRate: number;
  cryptoCurrency: string;
  cryptoUsdPrice?: number;
  giftCardRate: number;
  lastActiveAt: string;
  isActiveWithinFiveMinutes: boolean;
  tradeType: 'BUY' | 'SELL';
  giftCardType: string;
  minLimit: number;
  maxLimit: number;
  effectiveMax?: number;
  availableQuantity: number | null;
  paymentTags: string[];
  tradeVolume: number;
  isOnline: boolean;
  terms: string | null;
  avgReleaseMinutes: number;
};

export type P2PProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  createdAt: string;
  verification: { email: boolean; sms: boolean; identity: boolean; hasP2PInsuranceDeposit: boolean };
  stats: {
    thirtyDayOrders: number; totalCompletedOrders: number; completedBuyOrders: number; completedSellOrders: number;
    completionRate: number; positiveRating: number; avgReleaseMinutes: number; avgPaymentMinutes: number;
    accountAgeDays: number; goodReviews: number; badReviews: number;
  };
  ads: Array<{ id: string; asset: string; price: number; side: string; limits: string | null; availableQuantity: number | null; paymentMethods: string[] }>;
  reviews: Array<{ id: string; username: string; paymentMethod: string; timestamp: string; feedback: string; rating: number }>;
  isFavorite: boolean;
};

export type P2POrder = {
  id: string; orderType: string; fiatAmount: number; rate: number; cryptoVolume: number;
  orderNumber: string; timestamp: string; counterpartyUsername: string; status: string;
  actionRequired?: boolean; conversationId?: string | null; isP2POrder?: boolean;
};

export type P2POrderDetail = {
  id: string; status: 'PENDING_PAYMENT' | 'PAID_PENDING_VERIFICATION' | 'DISPUTED' | 'COMPLETED' | 'CANCELLED' | 'UNPAID' | 'PAID' | 'PENDING_VERIFICATION';
  amountUSD: number; giftCardValueUSD: number; giftCardRate: number;
  cryptoUsdPrice: number | null; pricingVersion: number;
  cryptoAmount: number; cryptoAsset: string;
  paymentDeadline: string; paidAt: string | null; giftCardType: string;
  terms: string | null; exchangeRate: number; tradeType: 'BUY' | 'SELL'; buyerUsername: string;
  sellerUsername: string; conversationId: string | null; isBuyer: boolean; hasReviewed: boolean;
  paidVerificationDeadline: string | null; disputeEnabled: boolean;
};

export const p2pService = {
  async getOffers(filters?: { type?: 'BUY' | 'SELL'; asset?: string; paymentMethod?: string }) {
    const params = new URLSearchParams();
    if (filters?.type === 'BUY' || filters?.type === 'SELL') params.set('type', filters.type);
    if (filters?.asset) params.set('asset', filters.asset);
    if (filters?.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
    const response = await apiClient.get<P2POffer[]>(`/p2p/offers${params.toString() ? `?${params.toString()}` : ''}`);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },
  async getProfile(merchantId?: string) {
    const query = merchantId ? `?merchantId=${encodeURIComponent(merchantId)}` : '';
    const response = await apiClient.get<P2PProfile>(`/p2p/profile${query}`);
    if (response.error) throw new Error(response.error);
    return response.data!;
  },
  async getOrders() {
    const response = await apiClient.get<P2POrder[]>('/p2p/orders');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },
  async getOffer(id: string) {
    const response = await apiClient.get<P2POffer>(`/p2p/offers/${encodeURIComponent(id)}`);
    if (response.error) throw new Error(response.error);
    return response.data!;
  },
  async createOrder(data: { offerId: string; giftCardValueUSD: number }) {
    const response = await apiClient.post<{ order: P2POrderDetail; conversationId: string }>('/p2p/orders', data);
    if (response.error) throw new Error(response.error);
    if (!response.data?.order?.id) {
      throw new Error('The P2P order was created without a valid order response. Refresh your orders before retrying.');
    }
    return response.data;
  },
  async getOrder(id: string) {
    const response = await apiClient.get<P2POrderDetail>(`/p2p/orders/${encodeURIComponent(id)}`);
    if (response.error) throw new Error(response.error);
    return response.data!;
  },
  async markOrderPaid(id: string) {
    const response = await apiClient.post<P2POrderDetail>(`/p2p/orders/${encodeURIComponent(id)}/paid`, {});
    if (response.error) throw new Error(response.error);
    return response.data!;
  },
  async releaseOrder(id: string) {
    const response = await apiClient.post<P2POrderDetail>(`/p2p/orders/${encodeURIComponent(id)}/release`, {});
    if (response.error) throw new Error(response.error);
    return response.data!;
  },
  async cancelOrder(id: string) {
    const response = await apiClient.post<{ id: string; status: string }>(`/p2p/orders/${encodeURIComponent(id)}/cancel`, {});
    if (response.error) throw new Error(response.error);
    return response.data!;
  },
  async openDispute(id: string, reason: string, description: string) {
    const response = await apiClient.post(`/p2p/orders/${encodeURIComponent(id)}/dispute`, { reason, description });
    if (response.error) throw new Error(response.error);
    return response.data;
  },
  async submitReview(id: string, data: { sentiment: 'POSITIVE' | 'NEGATIVE'; content: string }) {
    const response = await apiClient.post<{ id: string; sentiment: string; content: string }>(
      `/p2p/orders/${encodeURIComponent(id)}/review`, data
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  },
  async deleteAd(id: string) {
    const response = await apiClient.delete<{ id: string }>(`/p2p/offers/${encodeURIComponent(id)}`);
    if (response.error) throw new Error(response.error);
    return response.data!;
  },
  async createAd(data: { side: 'BUY' | 'SELL'; giftCardType: string; cryptoAsset: string; minLimit: number; maxLimit: number; exchangeRate: number; terms?: string }) {
    const response = await apiClient.post<P2PProfile['ads'][number]>('/p2p/offers/create', data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }
};
