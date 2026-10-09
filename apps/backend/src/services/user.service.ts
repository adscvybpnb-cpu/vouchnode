import { prisma } from '../lib/prisma';
import { randomUUID } from 'node:crypto';

export class UserService {
  static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        kycStatus: true,
        roles: { include: { role: true } },
        profile: {
          select: {
            displayName: true,
            username: true,
            avatarUrl: true,
            bio: true,
            countryCode: true,
            countryFlagEmoji: true,
            timezone: true,
            language: true,
            twitterUrl: true,
            linkedinUrl: true,
            githubUrl: true,
            websiteUrl: true,
          }
        },
        sellerProfile: { select: { id: true, shopSlug: true, shopName: true, status: true, avgRating: true } }
      }
    });
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    const sellerStatus = user.sellerProfile?.status === 'ACTIVE'
      ? 'approved'
      : user.sellerProfile?.status === 'PENDING'
        ? 'pending'
        : user.sellerProfile?.status === 'SUSPENDED'
          ? 'suspended'
          : user.sellerProfile?.status === 'REJECTED'
            ? 'rejected'
            : 'none';

    return {
      ...user,
      username: user.profile?.username || '',
      avatarUrl: user.profile?.avatarUrl || null,
      displayName: user.profile?.displayName || null,
      bio: user.profile?.bio || null,
      countryCode: user.profile?.countryCode || null,
      timezone: user.profile?.timezone || null,
      language: user.profile?.language || null,
      twitterUrl: user.profile?.twitterUrl || null,
      linkedinUrl: user.profile?.linkedinUrl || null,
      githubUrl: user.profile?.githubUrl || null,
      websiteUrl: user.profile?.websiteUrl || null,
      sellerStatus,
    };
  }

  static async updateProfile(userId: string, data: { displayName?: string; bio?: string; countryCode?: string; timezone?: string; language?: string; twitterUrl?: string; linkedinUrl?: string; githubUrl?: string; websiteUrl?: string }) {
    const profile = await prisma.userProfile.update({
      where: { userId },
      data
    });
    return profile;
  }

  static async uploadAvatar(userId: string, avatarUrl: string) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
      const emailName = user.email.split('@')[0]?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
      return tx.userProfile.upsert({
        where: { userId },
        update: { avatarUrl },
        create: {
          userId,
          username: `user-${randomUUID()}`,
          displayName: emailName || 'User',
          avatarUrl,
        },
      });
    });
  }

  static async updateEmail(userId: string, email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
    if (existing && existing.id !== userId) {
      throw Object.assign(new Error('Email address is already in use'), { statusCode: 409 });
    }
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { email: normalizedEmail, emailVerified: false },
        select: { id: true, email: true, emailVerified: true },
      });
      await tx.session.updateMany({ where: { userId, isRevoked: false }, data: { isRevoked: true } });
      return user;
    });
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const argon2 = await import('argon2');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    const isValid = await argon2.verify(user.passwordHash, currentPassword);
    if (!isValid) throw Object.assign(new Error('Current password is incorrect'), { statusCode: 400 });

    const passwordHash = await argon2.hash(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Revoke all other sessions for security
    await prisma.session.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true }
    });
  }
}
