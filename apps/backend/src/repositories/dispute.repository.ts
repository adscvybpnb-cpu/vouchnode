import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class DisputeRepository {
  static async create(data: Prisma.DisputeUncheckedCreateInput, client: Prisma.TransactionClient = prisma) {
    const count = await client.dispute.count();
    const disputeNumber = data.disputeNumber || `GFD-${new Date().toISOString().slice(0,7).replace('-','')}-${String(count + 1).padStart(4, '0')}`;
    return client.dispute.create({
      data: { ...data, disputeNumber },
      include: { order: true, messages: true }
    });
  }

  static async findForUser(userId: string) {
    return prisma.dispute.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      orderBy: { updatedAt: 'desc' },
      include: {
        order: { select: { id: true, orderNumber: true, totalAmount: true, currency: true, status: true } },
        timeline: { orderBy: { createdAt: 'asc' } }
      }
    });
  }

  static async findById(id: string, includeRelations: boolean = true) {
    return prisma.dispute.findUnique({
      where: { id },
      include: includeRelations ? { order: true, buyer: { select: { profile: true } }, seller: { include: { sellerProfile: { select: { shopName: true } } } }, messages: true, evidence: true, timeline: true } : undefined
    });
  }

  static async update(id: string, data: Prisma.DisputeUpdateInput) {
    return prisma.dispute.update({ where: { id }, data });
  }

  static async addMessage(disputeId: string, senderId: string, senderType: string, content: string, isInternal = false) {
    return prisma.disputeMessage.create({
      data: { disputeId, senderId, senderType, content, isInternal }
    });
  }

  static async addTimeline(disputeId: string, action: string, actorType: string, actorId?: string, description?: string) {
    return prisma.disputeTimeline.create({
      data: { disputeId, action, actorType, actorId, description }
    });
  }
}
