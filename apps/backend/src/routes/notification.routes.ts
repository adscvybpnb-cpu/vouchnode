import { FastifyInstance } from 'fastify';
import { NotificationService } from '../services/notification.service';
import { authenticate } from '../middleware/auth.middleware';

export default async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req: any, res) => {
    return res.send(await NotificationService.getNotificationPage(req.user.id, {
      page: req.query?.page,
      limit: req.query?.limit,
      unreadOnly: req.query?.unreadOnly === 'true',
    }));
  });

  app.get('/unread-count', async (req: any, res) => {
    const result = await NotificationService.getNotificationPage(req.user.id, { limit: 1 });
    return res.send({ count: result.unreadCount });
  });

  app.patch('/:id/read', async (req: any, res) => {
    await NotificationService.markRead(req.params.id, req.user.id);
    return res.send({ status: 'ok' });
  });

  app.patch('/read-all', async (req: any, res) => {
    return res.send(await NotificationService.markAllRead(req.user.id));
  });
}
