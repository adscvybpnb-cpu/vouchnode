import { Namespace } from 'socket.io';
import { prisma } from '../lib/prisma';

export function setupNotificationHandlers(notifNamespace: Namespace) {
  notifNamespace.on('connection', (socket) => {
    const user = socket.data.user;
    if (!user?.id) {
      socket.emit('error', 'Authentication required');
      socket.disconnect(true);
      return;
    }
    const room = `user:${user.id}`;
    
    socket.join(room);

    socket.on('mark_notification_read', async (notificationId: string) => {
      try {
        await prisma.notification.updateMany({
          where: { id: notificationId, userId: user.id },
          data: { isRead: true, readAt: new Date() }
        });
      } catch (err) {
        // ignore
      }
    });
  });
}
