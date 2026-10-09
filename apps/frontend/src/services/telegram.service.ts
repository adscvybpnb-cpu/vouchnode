import { apiClient } from './api.client';

interface TelegramLinkStatus {
  linked: boolean;
}

interface TelegramLink {
  url: string;
  expiresAt: string;
}

export const telegramService = {
  async getLinkStatus() {
    const response = await apiClient.get<TelegramLinkStatus>('/users/me/telegram/status', { cache: 'no-store' });
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Telegram link status response was empty.');
    return response.data;
  },

  async createLink() {
    const response = await apiClient.post<TelegramLink>('/users/me/telegram/link', {});
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Telegram link response was empty.');
    return response.data;
  },
};
