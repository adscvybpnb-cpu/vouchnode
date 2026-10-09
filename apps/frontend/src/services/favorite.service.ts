import { apiClient } from './api.client';

export interface FavoritesResponse {
  listings: Array<{ id: string; product: { id: string; name: string; currentPrice: number; currency: string; images?: Array<{ url: string }> } }>;
  searches: Array<{ id: string; name: string; query: string; createdAt: string }>;
  profiles: Array<{ id: string; following: { id: string; username?: string; profile?: { displayName?: string; avatarUrl?: string }; sellerProfile?: { shopName?: string } } }>;
}

export const favoriteService = {
  async getAll() {
    const response = await apiClient.get<FavoritesResponse>('/favorites');
    if (response.error || !response.data) throw new Error(response.error || 'Unable to load favorites');
    return response.data;
  },
  async addProfile(profileId: string) {
    const response = await apiClient.post<{ isFavorite: boolean }>(
      `/favorites/profiles/${encodeURIComponent(profileId)}`,
      {}
    );
    if (response.error || !response.data) throw new Error(response.error || 'Unable to favorite profile');
    return response.data;
  },
  async removeProfile(profileId: string) {
    const response = await apiClient.delete<{ isFavorite: boolean }>(
      `/favorites/profiles/${encodeURIComponent(profileId)}`
    );
    if (response.error || !response.data) throw new Error(response.error || 'Unable to remove profile favorite');
    return response.data;
  },
};
