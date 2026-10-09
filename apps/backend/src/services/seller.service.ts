import { SellerRepository } from '../repositories/seller.repository';
import { prisma } from '../lib/prisma';
import { SellerStatus, UserRole } from '@vouchnode/shared';
import { maskUsername } from '../utils/privacy';
import { NotificationService } from './notification.service';

class SellerApplicationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'SellerApplicationError';
  }
}

export class SellerService {
  private static async getProfileMetrics(userId: string) {
    const now = Date.now();
    const periods = [1, 3, 6, 12, null] as const;
    const feedback = await Promise.all(periods.map(async (months) => {
      const createdAt = months ? new Date(now - months * 30 * 24 * 60 * 60 * 1000) : undefined;
      const where = {
        sellerId: userId,
        isVisible: true,
        ...(createdAt ? { createdAt: { gte: createdAt } } : {}),
      };
      const [good, neutral, poor, totalRatings, itemsSold] = await Promise.all([
        prisma.review.count({ where: { ...where, rating: { gte: 4 } } }),
        prisma.review.count({ where: { ...where, rating: 3 } }),
        prisma.review.count({ where: { ...where, rating: { lte: 2 } } }),
        prisma.review.count({ where }),
        prisma.order.count({
          where: {
            sellerId: userId,
            status: 'COMPLETED',
            ...(createdAt ? { createdAt: { gte: createdAt } } : {}),
          },
        }),
      ]);
      return { good, neutral, poor, totalRatings, itemsSold };
    }));
    const aggregate = await prisma.review.aggregate({
      where: { sellerId: userId, isVisible: true },
      _avg: { rating: true },
      _count: { id: true },
    });
    const completedSales = await prisma.order.count({ where: { sellerId: userId, status: 'COMPLETED' } });
    const positive = feedback[4].good + feedback[4].neutral + feedback[4].poor;
    return {
      feedback,
      completedSales,
      averageRating: Number(aggregate._avg.rating || 0),
      reviewCount: aggregate._count.id,
      positiveRatingPercentage: positive ? (feedback[4].good / positive) * 100 : 0,
    };
  }
  static async autoApproveEligibleSellers() {
    const role = await prisma.role.findUnique({ where: { name: UserRole.SELLER } });
    if (!role) throw new Error('SELLER role not found in system');

    const sellers = await prisma.seller.findMany({
      where: { status: SellerStatus.PENDING },
      include: {
        user: {
          include: {
            profile: true,
            kycRequests: {
              where: {
                status: 'AUTOMATED_VERIFIED',
                frontDocumentUrl: { not: null },
                backDocumentUrl: { not: null },
                selfieUrl: { not: null },
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    let approved = 0;
    for (const seller of sellers) {
      const kyc = seller.user.kycRequests[0];
      if (!seller.shopName || !seller.description || !seller.user.profile || !kyc) continue;

      await prisma.$transaction(async (tx) => {
        await tx.seller.update({
          where: { id: seller.id },
          data: { status: SellerStatus.ACTIVE, verificationLevel: 1, approvedAt: new Date() },
        });
        await tx.user.update({
          where: { id: seller.userId },
          data: { kycStatus: 'AUTOMATED_VERIFIED' },
        });
        await tx.userProfile.update({
          where: { userId: seller.userId },
          data: { isIdentityVerified: true },
        });
        await tx.kycRequest.update({
          where: { id: kyc.id },
          data: { status: 'AUTOMATED_VERIFIED', processedAt: new Date() },
        });
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: seller.userId, roleId: role.id } },
          create: { userId: seller.userId, roleId: role.id },
          update: {},
        });
      });
      approved += 1;
    }

    return approved;
  }

  static async applyToSell(userId: string, data: {
    shopName?: string;
    description?: string;
    onboardingMode?: 'SECURE_VERIFICATION' | 'FAST_LAUNCH';
  }) {
    const shopName = data.shopName?.trim() || `seller-${userId.slice(0, 8)}`;
    const description = data.description?.trim() || 'Seller application pending identity verification.';
    const shopSlug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const onboardingMode = data.onboardingMode ?? 'SECURE_VERIFICATION';
    const kycSkippedAt = onboardingMode === 'FAST_LAUNCH' ? new Date() : null;
    const fastLaunch = onboardingMode === 'FAST_LAUNCH';
    const role = fastLaunch
      ? await prisma.role.findUnique({ where: { name: UserRole.SELLER } })
      : null;
    if (fastLaunch && !role) throw new Error('SELLER role not found in system');

    const existingSeller = await prisma.seller.findUnique({ where: { userId } });
    if (existingSeller?.status === SellerStatus.PENDING) {
      const latestKyc = await prisma.kycRequest.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      });
      if (latestKyc?.status !== 'REJECTED') {
        throw new Error('Your seller application is currently under review. Re-submission is locked.');
      }
    }
    if (existingSeller?.status === SellerStatus.ACTIVE) {
      throw new Error('Your seller account is already approved.');
    }

    const sellerWithSlug = await SellerRepository.findByShopSlug(shopSlug);
    if (sellerWithSlug && sellerWithSlug.userId !== userId) {
      throw new SellerApplicationError('Shop name is already taken', 400);
    }

    const seller = await prisma.$transaction(async (tx) => {
      const existing = await tx.seller.findUnique({ where: { userId } });
      if (existing?.status === SellerStatus.PENDING) {
        const latestKyc = await tx.kycRequest.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: { status: true },
        });
        if (latestKyc?.status !== 'REJECTED') {
          throw new Error('Your seller application is currently under review. Re-submission is locked.');
        }
      }
      if (existing?.status === SellerStatus.ACTIVE) {
        throw new Error('Your seller account is already approved.');
      }

      const s = await tx.seller.upsert({
        where: { userId },
        create: {
          userId,
          shopName,
          shopSlug,
          description,
          status: fastLaunch ? SellerStatus.ACTIVE : SellerStatus.PENDING,
          onboardingMode,
          kycSkippedAt,
          ...(fastLaunch ? { approvedAt: new Date(), verificationLevel: 0 } : {}),
          settings: { create: {} }
        },
        update: {
          shopName,
          shopSlug,
          description,
          status: fastLaunch ? SellerStatus.ACTIVE : SellerStatus.PENDING,
          onboardingMode,
          kycSkippedAt,
          ...(fastLaunch ? { approvedAt: new Date(), approvedBy: null, verificationLevel: 0 } : {}),
        }
      });

      await tx.wallet.upsert({
        where: { userId_currency: { userId, currency: 'USD' } },
        create: { userId, currency: 'USD', availableBalance: 0, pendingBalance: 0, frozenBalance: 0 },
        update: {}
      });
      if (role) {
        await tx.userRole.upsert({
          where: { userId_roleId: { userId, roleId: role.id } },
          create: { userId, roleId: role.id },
          update: {},
        });
      }
      
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'seller.apply',
          entityType: 'Seller',
          entityId: s.id,
          metadata: { onboardingMode, kycSkipped: fastLaunch },
        }
      });
      if (fastLaunch) {
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: 'seller.fast_launch.approve',
            entityType: 'Seller',
            entityId: s.id,
            metadata: { onboardingMode, kycSkipped: true, verificationLevel: 0 },
          },
        });
      }
      return s;
    });

    return seller;
  }

  static async approveSeller(sellerId: string, adminId: string) {
    const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller) throw new Error('Seller not found');

    const role = await prisma.role.findUnique({ where: { name: UserRole.SELLER } });
    if (!role) throw new Error('SELLER role not found in system');

    await prisma.$transaction(async (tx) => {
      await tx.seller.update({
        where: { id: sellerId },
        data: {
          status: 'ACTIVE',
          approvedAt: new Date(),
          approvedBy: adminId
        }
      });

      await tx.userRole.upsert({
        where: { userId_roleId: { userId: seller.userId, roleId: role.id } },
        create: { userId: seller.userId, roleId: role.id, grantedBy: adminId },
        update: {}
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorType: 'ADMIN',
          action: 'seller.approve',
          entityType: 'Seller',
          entityId: seller.id
        }
      });
      
    });
    await NotificationService.createNotification({
      userId: seller.userId,
      type: 'SELLER_APPROVED',
      title: 'Seller Application Approved!',
      message: 'You can now start listing products.',
      link: '/seller/create-listing',
    });
  }

  static async rejectSeller(sellerId: string, adminId: string, reason: string) {
    await prisma.$transaction(async (tx) => {
      const seller = await tx.seller.update({
        where: { id: sellerId },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
          rejectionReason: reason
        }
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorType: 'ADMIN',
          action: 'seller.reject',
          entityType: 'Seller',
          entityId: seller.id,
          metadata: { reason }
        }
      });

    });
    const seller = await prisma.seller.findUnique({ where: { id: sellerId }, select: { userId: true } });
    if (seller) {
      await NotificationService.createNotification({
        userId: seller.userId,
        type: 'SELLER_REJECTED',
        title: 'Seller Application Rejected',
        message: `Reason: ${reason}`,
        link: '/become-a-seller',
      });
    }
  }

  static async suspendSeller(sellerId: string, adminId: string, reason: string) {
    await prisma.$transaction(async (tx) => {
      const seller = await tx.seller.update({
        where: { id: sellerId },
        data: {
          status: 'SUSPENDED',
          suspendedAt: new Date(),
          suspensionReason: reason
        }
      });

      // Hide all their products
      await tx.product.updateMany({
        where: { sellerId },
        data: { status: 'INACTIVE' }
      });

      await tx.auditLog.create({
        data: {
          actorId: (await tx.user.findUnique({ where: { id: adminId }, select: { id: true } }))?.id ?? null,
          actorType: 'ADMIN',
          action: 'seller.suspend',
          entityType: 'Seller',
          entityId: seller.id,
          metadata: { reason, originalActorId: adminId },
        }
      });
    });
  }

  static async getSellerProfile(userId: string) {
    const seller = await SellerRepository.findByUserId(userId);
    if (!seller) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          createdAt: true,
          profile: {
            select: {
              username: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
              isIdentityVerified: true,
            },
          },
        },
      });

      if (!user?.profile) throw new Error('Seller not found');

      const metrics = await this.getProfileMetrics(user.id);
      return {
        id: user.id,
        userId: user.id,
        shopName: user.profile.displayName || user.profile.username,
        shopSlug: user.id,
        description: user.profile.bio,
        logoUrl: user.profile.avatarUrl,
        bannerUrl: null,
        status: 'ACTIVE',
        verificationLevel: user.profile.isIdentityVerified ? 1 : 0,
        totalSales: metrics.completedSales,
        completedOrders: metrics.completedSales,
        completedSales: metrics.completedSales,
        avgRating: metrics.averageRating,
        successfulSales: metrics.completedSales,
        averageRating: metrics.averageRating,
        trustScore: metrics.positiveRatingPercentage,
        positiveRatingPercentage: metrics.positiveRatingPercentage,
        reviewCount: metrics.reviewCount,
        feedback: metrics.feedback,
        listings: [],
        createdAt: user.createdAt,
        profile: user.profile,
        user: { profile: user.profile },
        reviews: [],
      };
    }

    const reviews = await prisma.review.findMany({
      where: { sellerId: seller.userId, isVisible: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderId: true,
        productId: true,
        sellerId: true,
        buyerId: true,
        rating: true,
        title: true,
        content: true,
        createdAt: true,
        reviewer: { select: { profile: { select: { username: true } } } },
      },
    });
    const metrics = await this.getProfileMetrics(seller.userId);
    return {
      ...seller,
      shopSlug: seller.userId,
      successfulSales: metrics.completedSales,
      completedSales: metrics.completedSales,
      completedOrders: metrics.completedSales,
      totalSales: metrics.completedSales,
      averageRating: metrics.averageRating,
      avgRating: metrics.averageRating,
      trustScore: metrics.positiveRatingPercentage,
      positiveRatingPercentage: metrics.positiveRatingPercentage,
      reviewCount: metrics.reviewCount,
      feedback: metrics.feedback,
      listings: [],
      reviews: reviews.map((review) => ({
        ...review,
        maskedBuyerUsername: maskUsername(review.reviewer.profile?.username),
        reviewer: undefined,
      })),
    };
  }

  static async updateSellerSettings(sellerId: string, data: any) {
    return prisma.sellerSettings.update({
      where: { sellerId },
      data
    });
  }

  static async getTopSellers(limit?: number) {
    return SellerRepository.getTopSellers(limit);
  }
}
