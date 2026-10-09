import { apiClient } from './api.client';
import type { Notification } from '../types/api.types';

export const notificationService = {
  async getNotifications(page = 1, limit = 25) {
    const res = await apiClient.get<{ items: Notification[]; page: number; limit: number; total: number; unreadCount: number; totalPages: number }>(`/notifications?page=${page}&limit=${limit}`);
    if (res.error) throw new Error(res.error);
    return res.data!;
  },
  async markRead(id: string) {
    await apiClient.patch(`/notifications/${id}/read`, {});
  },
  async markAllRead() {
    await apiClient.patch('/notifications/read-all', {});
  },
  async getUnreadCount() {
    const res = await apiClient.get<{ count: number }>('/notifications/unread-count');
    if (res.error) throw new Error(res.error);
    return res.data?.count ?? 0;
  }
};
