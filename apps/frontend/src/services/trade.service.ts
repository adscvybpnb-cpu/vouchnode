import { apiClient } from './api.client';

export type Trade = {
  id: string;
  buyerId: string;
  sellerId: string;
  amountUSD: number;
  cryptoAmount: number;
  cryptoType: string;
  status: string;
  lockedAt?: string;
  escrowUnlockAt?: string;
  createdAt: string;
};

export const tradeService = {
  async createTrade(data: { sellerId: string; cryptoType: string; cryptoAmount: number; amountUSD: number }) {
    const res = await apiClient.post<Trade>('/trades', data);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async openDispute(tradeId: string) {
    const res = await apiClient.post<Trade>(`/trades/${tradeId}/dispute`, {});
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async escalateDispute(tradeId: string) {
    const res = await apiClient.post<Trade>(`/trades/${tradeId}/dispute/escalate`, {});
    if (res.error) throw new Error(res.error);
    return res.data!;
  }
};
