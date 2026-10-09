import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import configRoutes from '../routes/config.routes';
import { SystemSettingsService } from '../services/system-settings.service';

describe('public configuration branding', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('always returns the canonical brand instead of a persisted site-name setting', async () => {
    const getSetting = vi.spyOn(SystemSettingsService, 'getSetting')
      .mockImplementation(async (key, defaultValue) => key === 'site_name' ? 'LegacyBrand' : defaultValue);
    const app = Fastify();
    await app.register(configRoutes);

    try {
      const response = await app.inject({ method: 'GET', url: '/public-config' });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.siteName).toBe('VouchNode');
      expect(getSetting).not.toHaveBeenCalledWith('site_name', expect.anything());
    } finally {
      await app.close();
    }
  });
});
