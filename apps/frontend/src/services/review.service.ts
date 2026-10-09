import { apiClient } from './api.client';
import type { Review, PaginatedResponse } from '../types/api.types';

export const reviewService = {
  async submitFeedback(orderId: string, ratingType: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE', content: string) {
    const res = await apiClient.post<Review>(`/orders/${orderId}/feedback`, { ratingType, content });
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async createReview(orderId: string, data: any) {
    const res = await apiClient.post<Review>(`/orders/${orderId}/reviews`, data);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getProductReviews(productId: string, page = 1) {
    const res = await apiClient.get<PaginatedResponse<Review>>(`/products/${productId}/reviews?page=${page}`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async getSellerReviews(sellerId: string, page = 1) {
    const res = await apiClient.get<PaginatedResponse<Review>>(`/sellers/${sellerId}/reviews?page=${page}`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  }
};
