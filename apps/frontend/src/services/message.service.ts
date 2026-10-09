import { apiClient } from './api.client';
import type { Message, Conversation } from '../types/api.types';

export const messageService = {
  async startConversation(sellerId: string) {
    const response = await apiClient.post<Conversation>('/messages/conversations', { sellerId });
    if (response.error || !response.data) throw new Error(response.error || 'Unable to start conversation');
    return response.data;
  },
  async getConversations() {
    const response = await apiClient.get<Conversation[]>('/messages/conversations');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },
  async uploadEvidence(conversationId: string, file: File, visibility: 'EVERYONE' | 'ADMIN_ONLY' = 'EVERYONE') {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.upload<{ fileUrl: string; messageType: 'IMAGE' | 'VIDEO'; visibility: 'EVERYONE' | 'ADMIN_ONLY' }>(
      `/messages/conversations/${conversationId}/media?visibility=${visibility}`,
      formData
    );
    if (response.error) throw new Error(response.error);
    return response.data!;
  },
  async sendMessage(conversationId: string, content: string) {
    const response = await apiClient.post<Message>(`/messages/conversations/${conversationId}/messages`, { content });
    if (response.error) throw new Error(response.error);
    return response.data!;
  },
  async getMessages(conversationId: string, page = 1) {
    const response = await apiClient.get<Message[]>(`/messages/conversations/${conversationId}/messages?page=${page}`);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },
  async markRead(conversationId: string) {
    await apiClient.patch(`/messages/conversations/${conversationId}/read`, {});
  },
};
