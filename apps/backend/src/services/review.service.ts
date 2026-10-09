import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ProductRepository } from '../repositories/product.repository';
import { SellerRepository } from '../repositories/seller.repository';
import { NotificationService } from './notification.service';
import { maskUsername } from '../utils/privacy';

export class ReviewService {
  static async createFeedback(orderId: string, buyerId: string, data: { ratingType: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE', content?: string }) {
    const ratingByType = { POSITIVE: 5, NEUTRAL: 3, NEGATIVE: 1 } as const;
    const content = data.content?.trim();
    if (content && content.length > 2000) throw new Error('Feedback must be 2000 characters or fewer');

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new Error('Order not found');
      if (order.buyerId !== buyerId) throw new Error('Unauthorized');
      if (order.status !== 'COMPLETED') throw new Error('Can only review completed orders');

      const review = await tx.review.create({
        data: {
          orderId,
          productId: order.productId,
          buyerId,
          sellerId: order.sellerId,
          rating: ratingByType[data.ratingType],
          content: content || undefined,
        },
      });

      const [ratingAggregate, reviewCount, positiveReviewCount] = await Promise.all([
        tx.review.aggregate({
          where: { sellerId: order.sellerId, isVisible: true },
          _avg: { rating: true },
        }),
        tx.review.count({ where: { sellerId: order.sellerId, isVisible: true } }),
        tx.review.count({ where: { sellerId: order.sellerId, isVisible: true, rating: { gte: 4 } } }),
      ]);
      await tx.seller.update({
        where: { userId: order.sellerId },
        data: {
          avgRating: ratingAggregate._avg.rating || 0,
          reviewCount,
          positiveRatingPercentage: reviewCount ? (positiveReviewCount / reviewCount) * 100 : 0,
        },
      });

      return review;
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Error('Review already exists for this order');
      }
      throw error;
    });

    await NotificationService.createNotification(
      result.sellerId,
      'REVIEW_RECEIVED',
      'New Review',
      `You received a ${data.ratingType.toLowerCase()} review`,
      { orderId },
    );
    return result;
  }

  static async createReview(orderId: string, buyerId: string, data: { rating: number, title?: string, content?: string }) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Order not found');
    if (order.buyerId !== buyerId) throw new Error('Unauthorized');
    if (order.status !== 'COMPLETED') throw new Error('Can only review completed orders');

    const existing = await prisma.review.findUnique({ where: { orderId } });
    if (existing) throw new Error('Review already exists for this order');

    const review = await prisma.review.create({
      data: {
        orderId,
        productId: order.productId,
        buyerId,
        sellerId: order.sellerId,
        rating: data.rating,
        title: data.title,
        content: data.content
      }
    });

    await ProductRepository.updateRating(order.productId);
    await SellerRepository.updateStats(order.sellerId);
    const seller = await prisma.seller.findUnique({
      where: { userId: order.sellerId },
      select: { avgRating: true, reviewCount: true, positiveRatingPercentage: true, completedSales: true },
    });

    await NotificationService.createNotification(
      order.sellerId,
      'REVIEW_RECEIVED',
      'New Review',
      `You received a ${data.rating}-star review`,
      { orderId }
    );

    return { review, seller };
  }

  static async getProductReviews(productId: string) {
    return prisma.review.findMany({
      where: { productId, isVisible: true },
      include: { reviewer: { select: { profile: true } } },
      orderBy: { createdAt: 'desc' }
    });
  }

  static async getSellerReviews(sellerId: string) {
    const reviews = await prisma.review.findMany({
      where: { sellerId, isVisible: true },
      include: { reviewer: { select: { profile: true } }, product: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' }
    });
    return reviews.map((review) => ({
      ...review,
      maskedBuyerUsername: maskUsername(review.reviewer.profile?.username),
      reviewer: undefined,
    }));
  }
}
