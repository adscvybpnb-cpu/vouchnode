import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { FavoriteService } from '../services/favorite.service';

export default async function favoriteRoutes(app: FastifyInstance) {
  app.post('/favorites/profiles/:profileId', { preHandler: [authenticate] }, async (req: any, reply) => {
    try {
      const profileId = typeof req.params?.profileId === 'string' ? req.params.profileId.trim() : '';
      if (!profileId) return reply.status(400).send({ message: 'A profile id is required' });

      return reply.send(await FavoriteService.addProfileFavorite(req.user.id, profileId));
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ message: error.message || 'Unable to favorite profile' });
    }
  });

  app.delete('/favorites/profiles/:profileId', { preHandler: [authenticate] }, async (req: any, reply) => {
    const profileId = typeof req.params?.profileId === 'string' ? req.params.profileId.trim() : '';
    if (!profileId) return reply.status(400).send({ message: 'A profile id is required' });

    try {
      return reply.send(await FavoriteService.removeProfileFavorite(req.user.id, profileId));
    } catch (error: any) {
      return reply.status(error.statusCode || 500).send({ message: error.message || 'Unable to remove profile favorite' });
    }
  });

  app.get('/favorites', { preHandler: [authenticate] }, async (req: any, reply) => {
    const [listings, searches, profiles] = await Promise.all([
      prisma.favoriteListing.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        include: { product: { include: { images: true, seller: true } } },
      }),
      prisma.savedSearch.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } }),
      prisma.follow.findMany({
        where: { followerId: req.user.id },
        orderBy: { createdAt: 'desc' },
        include: { following: { include: { profile: true, sellerProfile: true } } },
      }),
    ]);
    return reply.send({ listings, searches, profiles });
  });
}
