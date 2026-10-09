import { prisma } from '../lib/prisma';
import { DisputeService } from './dispute.service';

export class MessageService {
  static async startConversation(userId: string, sellerId: string) {
    if (sellerId === userId) throw new Error('Cannot start a conversation with yourself');
    const seller = await prisma.user.findUnique({
      where: { id: sellerId },
      select: { id: true, sellerProfile: { select: { id: true } } },
    });
    if (!seller) throw new Error('Seller not found');
    if (!seller.sellerProfile) throw new Error('User is not a seller');

    const conversationSellerId = seller.id;
    const buyerId = userId;

    const existingConversation = await prisma.conversation.findFirst({
      where: { buyerId, sellerId: conversationSellerId, isActive: true },
    });
    if (existingConversation) return existingConversation;

    return prisma.conversation.create({
      data: { buyerId, sellerId: conversationSellerId, isActive: true },
    });
  }

  static async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    media?: { messageType: 'IMAGE' | 'VIDEO'; fileUrl: string; visibility?: 'EVERYONE' | 'ADMIN_ONLY' },
    visibility: 'EVERYONE' | 'ADMIN_ONLY' = media?.visibility || 'EVERYONE'
  ) {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new Error('Conversation not found');
    if (conv.buyerId !== senderId && conv.sellerId !== senderId) throw new Error('Unauthorized');

    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId,
          content,
          imageUrl: media?.messageType === 'IMAGE' ? media.fileUrl : undefined,
          fileUrl: media?.fileUrl,
          messageType: media?.messageType || 'TEXT',
          visibility
        }
      });
      
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() }
      });
      
      return msg;
    });
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { orderId: true },
    });
    if (conversation?.orderId) await DisputeService.handleSellerMessage(conversation.orderId, senderId);
    return message;
  }

  static async canAccessConversation(conversationId: string, userId: string) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { buyerId: true, sellerId: true },
    });
    return Boolean(conversation && (conversation.buyerId === userId || conversation.sellerId === userId));
  }

  static async getConversations(userId: string) {
    const conversations = await prisma.conversation.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        buyer: { select: { id: true, profile: { select: { username: true, displayName: true, avatarUrl: true } } } },
        seller: { select: { id: true, profile: { select: { username: true, displayName: true, avatarUrl: true } } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            conversationId: true,
            senderId: true,
            content: true,
            isRead: true,
            createdAt: true,
          },
        },
        order: {
          select: {
            orderNumber: true,
            buyer: { select: { profile: true } },
            seller: { include: { sellerProfile: { select: { shopName: true } } } }
          }

        }
      }
    });
    return conversations.map(({ messages, ...conversation }) => ({
      ...conversation,
      lastMessage: messages[0] ?? null,
      participant: conversation.buyerId === userId ? conversation.seller : conversation.buyer,
    }));
  }

  static async getAllConversations() {
    return prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  static async getMessages(conversationId: string, userId: string, hasDedicatedAdminToken = false) {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new Error('Conversation not found');
    const account = await prisma.user.findUnique({
      where: { id: userId },
      select: { roles: { select: { role: { select: { name: true } } } } }
    });
    const isAdmin = hasDedicatedAdminToken || Boolean(account?.roles.some(({ role }) => role.name === 'ADMIN' || role.name === 'SUPPORT'));
    if (!isAdmin && conv.buyerId !== userId && conv.sellerId !== userId) throw new Error('Unauthorized');

    try {
      return await prisma.message.findMany({
        where: {
          conversationId,
          ...(isAdmin ? {} : {
            OR: [
              { visibility: 'EVERYONE' },
              { visibility: 'ADMIN_ONLY', senderId: userId }
            ]
          }),
        },
        orderBy: { createdAt: 'asc' },
        include: {
          sender: { select: { id: true, profile: { select: { username: true, displayName: true, avatarUrl: true } } } },
        },
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const schemaMismatch = /visibility|column .* does not exist|P2022/i.test(details);
      if (!schemaMismatch) throw error;

      console.error('Message visibility column is unavailable; using compatibility query. Run `pnpm --filter @vouchnode/backend db:push`.', error);
      try {
        return await prisma.message.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            conversationId: true,
            senderId: true,
            content: true,
            imageUrl: true,
            fileUrl: true,
            messageType: true,
            isRead: true,
            createdAt: true,
            sender: { select: { id: true, profile: { select: { username: true, displayName: true, avatarUrl: true } } } },
          },
        });
      } catch (mediaSchemaError) {
        console.error('Message media columns are unavailable; using legacy text-message query. Run `pnpm --filter @vouchnode/backend db:push`.', mediaSchemaError);
        return prisma.message.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            conversationId: true,
            senderId: true,
            content: true,
            imageUrl: true,
            isRead: true,
            createdAt: true,
            sender: { select: { id: true, profile: { select: { username: true, displayName: true, avatarUrl: true } } } },
          },
        });
      }
    }
  }

  static async markRead(conversationId: string, userId: string) {
    if (!(await this.canAccessConversation(conversationId, userId))) {
      throw new Error('Unauthorized');
    }
    await prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, isRead: false },
      data: { isRead: true, readAt: new Date() }
    });
  }
}
