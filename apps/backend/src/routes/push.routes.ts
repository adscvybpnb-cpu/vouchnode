import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { PushNotificationService, PushSubscriptionInput } from '../services/push-notification.service';
import { config } from '../config';

export default async function pushRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/config', async (_req, res) => {
    return res.send({ enabled: PushNotificationService.isConfigured(), publicKey: config.push.publicKey || null });
  });

  app.post<{ Body: PushSubscriptionInput }>('/subscription', async (req: any, res) => {
    const subscription = await PushNotificationService.upsertSubscription(
      req.user.id,
      req.body,
      req.headers['user-agent'],
    );
    return res.code(201).send({ id: subscription.id });
  });

  app.delete<{ Body: { endpoint: string } }>('/subscription', async (req: any, res) => {
    await PushNotificationService.removeSubscription(req.user.id, req.body?.endpoint);
    return res.send({ status: 'ok' });
  });
}
