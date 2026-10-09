import { apiClient } from './api.client';

export interface SiteConfig {
  siteName: string;
  logoUrl: string;
  description: string;
  keywords: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
}

export const siteConfigService = {
  async getPublic() {
    const response = await apiClient.get<SiteConfig>('/public-config');
    if (response.error || !response.data) throw new Error(response.error || 'Unable to load site configuration.');
    return response.data;
  },
};
