import { prisma } from '../lib/prisma';

export class FavoriteService {
  static async isProfileFavorite(userId: string, profileId: string) {
    const favorite = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: profileId
        }
      },
      select: { id: true }
    });

    return Boolean(favorite);
  }

  static async addProfileFavorite(userId: string, profileId: string) {
    if (userId === profileId) {
      throw Object.assign(new Error('You cannot favorite your own profile'), { statusCode: 400 });
    }

    const profile = await prisma.user.findUnique({
      where: { id: profileId },
      select: { id: true }
    });
    if (!profile) {
      throw Object.assign(new Error('P2P merchant profile not found'), { statusCode: 404 });
    }

    await prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: profileId
        }
      },
      create: { followerId: userId, followingId: profileId },
      update: {}
    });

    return { isFavorite: true };
  }

  static async removeProfileFavorite(userId: string, profileId: string) {
    await prisma.follow.deleteMany({
      where: { followerId: userId, followingId: profileId }
    });

    return { isFavorite: false };
  }
}
