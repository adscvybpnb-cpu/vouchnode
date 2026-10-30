import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { emitPresenceUpdate, schedulePresenceExpiry } from '../websocket/socket.server';

const presenceUpdateSchema = z.object({
  online: z.boolean(),
  durationHours: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable().optional(),
}).strict().refine((value) => !value.online || value.durationHours != null, {
  message: 'Choose an online duration between 1 and 4 hours.',
});

export default async function presenceRoutes(app: FastifyInstance) {
  app.patch('/me/presence', { preHandler: authenticate }, async (request: any, reply) => {
    const parsed = presenceUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.issues[0]?.message || 'Invalid presence settings.' });
    }

    try {
      const onlineUntil = parsed.data.online
        ? new Date(Date.now() + Number(parsed.data.durationHours) * 60 * 60 * 1000)
        : null;
      const user = await prisma.user.update({
        where: { id: request.user.id },
        data: { isOnline: parsed.data.online, onlineUntil },
        select: { id: true, isOnline: true, onlineUntil: true },
      });
      schedulePresenceExpiry(user.id, user.onlineUntil);
      emitPresenceUpdate(user.id, user.isOnline, user.onlineUntil);
      return reply.send({ data: { isOnline: user.isOnline, onlineUntil: user.onlineUntil } });
    } catch (error) {
      request.log.error({ error, userId: request.user.id }, 'Unable to update user presence');
      return reply.status(500).send({ message: 'Unable to update your online status.' });
    }
  });
}
