import { FastifyInstance } from 'fastify';
import { SystemSettingsService } from '../services/system-settings.service';
import { BRAND_NAME } from '@vouchnode/shared';

export default async function configRoutes(app: FastifyInstance) {
  app.get('/public-config', async (_request, reply) => {
    const [logoUrl, description, keywords, maintenanceMode, maintenanceMessage] = await Promise.all([
      SystemSettingsService.getSetting('site_logo_url', '/favicon.svg'),
      SystemSettingsService.getSetting('site_description', 'Buy and sell gift cards instantly with crypto.'),
      SystemSettingsService.getSetting('site_keywords', 'gift cards, crypto marketplace'),
      SystemSettingsService.getSetting('maintenance_mode', false),
      SystemSettingsService.getSetting('maintenance_message', 'The platform is temporarily undergoing maintenance.'),
    ]);
    return reply.send({
      data: {
        siteName: BRAND_NAME,
        logoUrl,
        description,
        keywords,
        maintenanceMode,
        maintenanceMessage,
      },
    });
  });
}
