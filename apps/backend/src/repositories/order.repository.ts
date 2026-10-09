import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class OrderRepository {
  static async create(data: Omit<Prisma.OrderUncheckedCreateInput, 'orderNumber'>) {
    const count = await prisma.order.count();
    const orderNumber = `GF-${new Date().toISOString().slice(0,7).replace('-','')}-${String(count + 1).padStart(4, '0')}`;
    return prisma.order.create({
      data: { ...data, orderNumber } as Prisma.OrderUncheckedCreateInput,
      include: { transaction: true, product: true }
    });
  }

  static async findById(id: string, includeRelations: boolean = true) {
    return prisma.order.findUnique({
      where: { id },
      include: includeRelations ? { 
        product: {
          include: {
            images: {
              orderBy: { sortOrder: 'asc' },
              select: { url: true, altText: true, sortOrder: true }
            }
          }
        },
        buyer: { select: { id: true, profile: { select: { username: true, displayName: true, avatarUrl: true } } } },
        seller: {
          select: {
            id: true,
            profile: { select: { username: true, displayName: true, avatarUrl: true } },
            sellerProfile: { select: { shopName: true, shopSlug: true, avgRating: true } },
          },
        },
        conversation: { select: { id: true } },
        dispute: { select: { createdAt: true, sellerResponseDeadline: true } },
        transaction: true,
      } : undefined
    });
  }

  static async findByBuyerId(buyerId: string, filters: any, pagination: any) {
    const skip = (pagination.page - 1) * pagination.limit;
    return prisma.order.findMany({
      where: { buyerId, ...filters },
      skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: {
            images: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, url: true, altText: true, sortOrder: true }
            }
          }
        },
        seller: { include: { sellerProfile: { select: { shopName: true } } } }
      }
    });
  }

  static async findBySellerId(sellerId: string, filters: any, pagination: any) {
    const skip = (pagination.page - 1) * pagination.limit;
    return prisma.order.findMany({
      where: { sellerId, ...filters },
      skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
      include: { product: true, buyer: { select: { profile: true } } }
    });
  }

  static async updateStatus(id: string, status: any) {
    return prisma.order.update({ where: { id }, data: { status } });
  }

  static async setSellerDeadline(id: string, deadline: Date, jobId: string) {
    return prisma.order.update({ where: { id }, data: { sellerResponseDeadline: deadline, sellerTimerJobId: jobId } });
  }

  static async setBuyerDeadline(id: string, deadline: Date, jobId: string) {
    return prisma.order.update({ where: { id }, data: { buyerConfirmationDeadline: deadline, buyerTimerJobId: jobId } });
  }

  static async cancelTimerJobs(id: string) {
    return prisma.order.update({
      where: { id },
      data: {
        sellerTimerJobId: null,
        buyerTimerJobId: null,
        paymentTimerJobId: null
      }
    });
  }
}
