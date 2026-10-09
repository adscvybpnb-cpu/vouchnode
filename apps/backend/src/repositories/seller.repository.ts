import { Prisma, SellerStatus as PrismaSellerStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { SellerStatus } from '@vouchnode/shared';

export class SellerRepository {
  static async findByUserId(userId: string) {
    return prisma.seller.findUnique({ where: { userId }, include: { settings: true, user: { select: { email: true, profile: true } } } });
  }

  static async findByShopSlug(shopSlug: string) {
    const requestedSlug = shopSlug.trim().toLowerCase();
    const legacySlug = requestedSlug === 'pixelreel-exchange' ? 'pixelvault-exchange' : requestedSlug;
    return prisma.seller.findFirst({
      where: {
        OR: [
          { shopSlug: legacySlug },
          { id: shopSlug },
          { user: { profile: { username: legacySlug } } },
        ],
      },
      include: { settings: true, user: { select: { profile: true } } },
    });
  }

  static async findAll(filters: { status?: PrismaSellerStatus }, pagination: { page: number, limit: number }) {
    const skip = (pagination.page - 1) * pagination.limit;
    let where: Prisma.SellerWhereInput = {};
    if (filters.status) where.status = filters.status;

    const [data, total] = await Promise.all([
      prisma.seller.findMany({
        where,
        skip,
        take: pagination.limit,
        orderBy: [{ avgRating: 'desc' }, { totalSales: 'desc' }],
        include: {
          settings: true,
          user: { select: { profile: { select: { avatarUrl: true, displayName: true, username: true } } } },
        },
      }),
      prisma.seller.count({ where })
    ]);
    return { data, total };
  }

  static async create(data: Prisma.SellerUncheckedCreateInput) {
    return prisma.seller.create({ data, include: { settings: true } });
  }

  static async update(id: string, data: Prisma.SellerUpdateInput) {
    return prisma.seller.update({ where: { id }, data, include: { settings: true } });
  }

  static async updateStats(sellerId: string) {
    // Recalculate stats from orders/reviews
    const seller = await prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller) return;

    const [completedOrders, allOrders, reviews] = await Promise.all([
      prisma.order.count({ where: { sellerId: seller.userId, status: 'COMPLETED' } }),
      prisma.order.count({ where: { sellerId: seller.userId } }),
      prisma.review.aggregate({ where: { sellerId: seller.userId }, _avg: { rating: true }, _count: { id: true } })
    ]);

    const disputeCount = await prisma.dispute.count({ where: { sellerId: seller.userId } });
    const cancelCount = await prisma.order.count({ where: { sellerId: seller.userId, status: { in: ['CANCELLED', 'EXPIRED'] } } });

    const disputeRate = allOrders > 0 ? (disputeCount / allOrders) * 100 : 0;
    const cancellationRate = allOrders > 0 ? (cancelCount / allOrders) * 100 : 0;
    const positiveReviews = reviews._count.id
      ? await prisma.review.count({ where: { sellerId: seller.userId, rating: { gte: 4 } } })
      : 0;
    const positiveRatingPercentage = reviews._count.id
      ? (positiveReviews / reviews._count.id) * 100
      : Number(seller.positiveRatingPercentage);

    await prisma.seller.update({
      where: { id: sellerId },
      data: {
        completedOrders,
        positiveRatingPercentage,
        disputeRate,
        cancellationRate,
        avgRating: reviews._avg.rating || 0,
        reviewCount: reviews._count.id
      }
    });
  }

  static async getTopSellers(limit: number = 10) {
    return prisma.seller.findMany({
      where: { status: 'ACTIVE' },
      take: limit,
      orderBy: [
        { avgRating: 'desc' },
        { totalSales: 'desc' }
      ]
    });
  }
}
