import { Namespace } from 'socket.io';
import { MessageService } from '../services/message.service';
import { NotificationService } from '../services/notification.service';
import { prisma } from '../lib/prisma';

type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO';
type MessageVisibility = 'EVERYONE' | 'ADMIN_ONLY';

const isMessageType = (value: unknown): value is MessageType =>
  value === 'TEXT' || value === 'IMAGE' || value === 'VIDEO';

const isMessageVisibility = (value: unknown): value is MessageVisibility =>
  value === 'EVERYONE' || value === 'ADMIN_ONLY';

export function setupChatHandlers(chatNamespace: Namespace) {
  chatNamespace.on('connection', (socket) => {
    const user = socket.data.user;
    if (!user?.id) {
      socket.emit('error', 'Authentication required');
      socket.disconnect(true);
      return;
    }
    
    socket.on('join_conversation', async (conversationId: string) => {
      try {
        const account = await prisma.user.findUnique({
          where: { id: user.id },
          select: { roles: { select: { role: { select: { name: true } } } } },
        });
        const isAdmin = account?.roles.some(({ role }) => role.name === 'ADMIN' || role.name === 'SUPPORT');
        if (isAdmin || await MessageService.canAccessConversation(conversationId, user.id)) socket.join(conversationId);
        else socket.emit('error', 'Unauthorized conversation');
      } catch {
        socket.emit('error', 'Unable to join conversation');
      }
    });

    socket.on('join_admin_chat', async () => {
      const account = await prisma.user.findUnique({
        where: { id: user.id },
        select: { roles: { select: { role: { select: { name: true } } } } },
      });
      if (account?.roles.some(({ role }) => role.name === 'ADMIN' || role.name === 'SUPPORT')) {
        socket.join('admin-chat');
      } else {
        socket.emit('error', 'Unauthorized admin chat');
      }
    });

    socket.on('join_p2p_order', async (orderId: string) => {
      try {
        const order = await prisma.p2POrder.findUnique({
          where: { id: orderId },
          select: { buyerId: true, sellerId: true }
        });

        const account = await prisma.user.findUnique({
          where: { id: user.id },
          select: { roles: { select: { role: { select: { name: true } } } } },
        });
        const isAdmin = account?.roles.some(({ role }) => role.name === 'ADMIN' || role.name === 'SUPPORT');
        if (!order || (!isAdmin && order.buyerId !== user.id && order.sellerId !== user.id)) {
          socket.emit('error', 'Unauthorized P2P order');
          return;
        }
        socket.join(`p2p-order:${orderId}`);
        // Keep the order-scoped room available for clients using the
        // order-${orderId} broadcast convention.
        socket.join(`order-${orderId}`);
      } catch {
        socket.emit('error', 'Unable to join P2P order');
      }
    });

    socket.on('leave_p2p_order', (orderId: string) => {
      if (typeof orderId === 'string') void socket.leave(`p2p-order:${orderId}`);
      if (typeof orderId === 'string') void socket.leave(`order-${orderId}`);
    });

    socket.on('join_order', async (orderId: string, acknowledge?: (response: { ok: boolean }) => void) => {
      try {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: { buyerId: true, sellerId: true },
        });
        if (!order || (order.buyerId !== user.id && order.sellerId !== user.id)) {
          socket.emit('error', 'Unauthorized order');
          acknowledge?.({ ok: false });
          return;
        }
        socket.join(`order-${orderId}`);
        acknowledge?.({ ok: true });
      } catch {
        socket.emit('error', 'Unable to join order');
        acknowledge?.({ ok: false });
      }
    });

    socket.on('leave_order', (orderId: string) => {
      if (typeof orderId === 'string') void socket.leave(`order-${orderId}`);
    });

    socket.on('send_message', async (
      data: { conversationId?: unknown; content?: unknown; text?: unknown; messageType?: unknown; fileUrl?: unknown; visibility?: unknown },
      acknowledge?: (response: { ok: boolean; message?: unknown; error?: string }) => void,
    ) => {
      try {
        const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : '';
        const content = typeof data?.content === 'string' ? data.content.trim()
          : typeof data?.text === 'string' ? data.text.trim() : '';
        const messageType = data?.messageType === undefined ? 'TEXT' : data.messageType;
        const visibility = data?.visibility === undefined ? 'EVERYONE' : data.visibility;
        if (!conversationId || !isMessageType(messageType) || !isMessageVisibility(visibility)) throw new Error('Invalid message payload');
        if ((messageType === 'TEXT' && !content) || (messageType !== 'TEXT' && typeof data?.fileUrl !== 'string')) throw new Error('Invalid message payload');
        const msg = await MessageService.sendMessage(
          conversationId,
          user.id,
          content,
          messageType === 'TEXT' ? undefined : { messageType, fileUrl: data.fileUrl as string, visibility },
          visibility
        );
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            buyerId: true,
            sellerId: true,
            orderId: true,
            p2pOrderId: true,
            buyer: { select: { profile: { select: { username: true, displayName: true } } } },
            seller: { select: { profile: { select: { username: true, displayName: true } } } },
          },
        });
        if (!conversation) throw new Error('Conversation not found');
        if (conversation.orderId) {
          const order = await prisma.order.findUnique({
            where: { id: conversation.orderId },
            select: { status: true, buyerReviewDeadline: true },
          });
          if (order?.status === 'DISPUTED_WAITING_BUYER') {
            chatNamespace.to(`order-${conversation.orderId}`).emit('order_updated', {
              orderId: conversation.orderId,
              status: order.status,
              buyerReviewDeadline: order.buyerReviewDeadline,
              reason: 'SELLER_MESSAGE',
            });
          }
        }
        const recipientId = conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId;
        const senderProfile = conversation.buyerId === user.id ? conversation.buyer.profile : conversation.seller.profile;
        const senderName = senderProfile?.displayName || senderProfile?.username || 'New message';
        if (visibility === 'EVERYONE') await NotificationService.createNotification({
          userId: recipientId,
          type: 'MESSAGE_NEW',
          title: senderName,
          message: content.slice(0, 160),
          data: {
            conversationId,
            orderId: conversation.orderId,
            p2pOrderId: conversation.p2pOrderId,
            senderId: user.id,
            senderUsername: senderProfile?.username || senderName,
          },
          link: conversation.p2pOrderId
            ? `/p2p-offers/order/${conversation.p2pOrderId}`
            : conversation.orderId
              ? `/orders/${conversation.orderId}`
              : `/chat?conversationId=${conversationId}`,
          dedupeKey: `message:${msg.id}`,
        });
        // Join on send as well as join_conversation. This prevents a race where
        // the sender emits immediately after connecting, before the join event
        // has been processed.
        socket.join(conversationId);
        if (visibility === 'EVERYONE') {
          chatNamespace.to(conversationId).emit('new_message', msg);
          const orderId = conversation.p2pOrderId || conversation.orderId;
          if (orderId) chatNamespace.to(`order-${orderId}`).emit('new_message', msg);
        } else {
          socket.emit('new_message', msg);
          chatNamespace.to('admin-chat').emit('new_message', msg);
        }
        acknowledge?.({ ok: true, message: msg });
      } catch {
        acknowledge?.({ ok: false, error: 'Failed to send message' });
        socket.emit('error', 'Failed to send message');
      }
    });

    socket.on('typing', (data: string | { conversationId?: string; isTyping?: boolean }) => {
      const conversationId = typeof data === 'string' ? data : data?.conversationId;
      if (!conversationId) return;
      const isTyping = typeof data === 'string' ? true : data.isTyping !== false;
      socket.to(conversationId).emit('typing', { userId: user.id, isTyping });
    });

    socket.on('stop_typing', (data: string | { conversationId?: string }) => {
      const conversationId = typeof data === 'string' ? data : data?.conversationId;
      if (!conversationId) return;
      socket.to(conversationId).emit('typing', { userId: user.id, isTyping: false });
    });

    socket.on('leave_conversation', (conversationId: string) => {
      if (typeof conversationId === 'string') {
        void socket.leave(conversationId);
      }
    });
  });
}
