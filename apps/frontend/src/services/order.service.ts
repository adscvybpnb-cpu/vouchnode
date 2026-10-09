import { apiClient } from './api.client';
import type { Order, Dispute } from '../types/api.types';

export const orderService = {
  async createDirectCheckout(productId: string, asset: string, network: string) {
    const res = await apiClient.post<{
      orderId: string;
      orderNumber: string;
      sessionId: string;
      address: string;
      network: string;
      amount: number;
      usdAmount: number;
      exchangeRate: number;
      expiresAt: string;
      status: string;
    }>('/orders/direct-checkout', { productId, asset, network });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async createOrder(productId: string, quantity: number) {
    const res = await apiClient.post<Order>('/orders', { productId, quantity });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async payWithWallet(productId: string, quantity: number, options?: { autoConvert?: boolean; sourceAsset?: string | null }) {
    const res = await apiClient.post<Order>('/orders/wallet-pay', { productId, quantity, ...options });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getOrder(id: string) {
    const res = await apiClient.get<Order>(`/orders/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getDirectCheckoutStatus(sessionId: string) {
    const res = await apiClient.get<{
      sessionId: string;
      sessionStatus: string;
      orderId: string;
      orderStatus: string;
      paymentStatus: string;
    }>(`/orders/direct-checkout/${encodeURIComponent(sessionId)}/status`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getMyOrders(filters?: any) {
    const query = new URLSearchParams(filters || {}).toString();
    const res = await apiClient.get<Order[]>(`/orders/me${query ? `?${query}` : ''}`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async confirmOrder(id: string) {
    const res = await apiClient.post<Order>(`/orders/${id}/confirm`, {});
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async escalateDispute(id: string, description: string, proofImage: File) {
    const formData = new FormData();
    formData.append('description', description);
    formData.append('proofImage', proofImage);
    const res = await apiClient.upload<Dispute>(`/orders/${id}/dispute`, formData);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async escalateDisputeToAdmin(id: string) {
    const res = await apiClient.post(`/orders/${id}/dispute`, { action: 'ESCALATE' });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async refundDisputedOrder(id: string) {
    const res = await apiClient.post<Order>(`/orders/${id}/refund`, {});
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
};
