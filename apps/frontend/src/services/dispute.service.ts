import { apiClient } from './api.client';
import { API_URL } from '@/lib/constants';
import type { Dispute, PaginatedResponse, DisputeEvidence } from '../types/api.types';

export const disputeService = {
  async getDisputes() {
    const res = await apiClient.get<Dispute[]>('/disputes');
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async openDispute(orderId: string, reason: string, description: string) {
    const res = await apiClient.post<Dispute>('/disputes', { orderId, reason, description });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getDispute(id: string) {
    const res = await apiClient.get<Dispute>(`/disputes/${id}`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async updateStatus(id: string, status: 'AWAITING_SELLER' | 'AWAITING_BUYER' | 'CLOSED') {
    const res = await apiClient.patch<Dispute>(`/disputes/${id}/status`, { status });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async respondToDispute(id: string, data: any) {
    const res = await apiClient.post<Dispute>(`/disputes/${id}/respond`, data);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async respondToOrderDispute(orderId: string, description: string) {
    const res = await apiClient.post<Dispute>(`/orders/${orderId}/dispute/respond`, { description });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async uploadEvidence(disputeId: string, file: File, description?: string) {
    const formData = new FormData();
    formData.append('file', file);
    if (description) formData.append('description', description);
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth-storage') : '';
    const res = await fetch(`${API_URL}/disputes/${disputeId}/evidence`, {
      method: 'POST',
      body: formData,
      headers: { Authorization: `Bearer ${JSON.parse(token || '{}')?.state?.accessToken}` }
    });
    if (!res.ok) throw new Error('Upload failed');
    return await res.json() as DisputeEvidence;
  }
};
