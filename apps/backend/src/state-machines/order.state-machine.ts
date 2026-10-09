import { Prisma, PrismaClient, OrderStatus, Order } from '@prisma/client';

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ['PAYMENT_PENDING', 'CANCELLED'],
  PAYMENT_PENDING: ['PENDING_MANUAL_REVIEW', 'PAID', 'CANCELLED', 'EXPIRED'],
  PENDING_MANUAL_REVIEW: ['PAID', 'CANCELLED'],
  PAID: ['DELIVERED', 'COMPLETED', 'DISPUTE_OPEN', 'DISPUTED_WAITING_SELLER', 'CANCELLED'],
  DELIVERED: ['WAITING_BUYER_CONFIRMATION', 'COMPLETED', 'CANCELLED'],
  WAITING_BUYER_CONFIRMATION: ['COMPLETED', 'DISPUTE_OPEN', 'DISPUTED_WAITING_SELLER', 'CANCELLED'],
  DISPUTE_OPEN: ['DISPUTED_WAITING_BUYER', 'WAITING_BUYER_CONFIRMATION', 'CANCELLED', 'REFUNDED'],
  DISPUTED_WAITING_SELLER: ['DISPUTED_WAITING_BUYER', 'WAITING_BUYER_CONFIRMATION', 'CANCELLED', 'REFUNDED'],
  DISPUTED_WAITING_BUYER: ['COMPLETED', 'ESCALATED_TO_ADMIN', 'WAITING_BUYER_CONFIRMATION', 'CANCELLED'],
  ESCALATED_TO_ADMIN: ['COMPLETED', 'REFUNDED', 'CANCELLED'],
  COMPLETED: [],
  REFUNDED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export async function transition(
  order: Order,
  to: OrderStatus,
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  actorId: string | null,
  actorType: 'USER' | 'SYSTEM' | 'ADMIN' = 'USER',
  reason?: string
): Promise<Order> {
  if (!canTransition(order.status, to)) {
    throw new Error(`Invalid order transition from ${order.status} to ${to}`);
  }

  const claimed = await tx.order.updateMany({
    where: { id: order.id, status: order.status },
    data: { status: to }
  });
  if (claimed.count !== 1) {
    throw new Error(`Order transition lost a race for ${order.id}`);
  }
  const updatedOrder = await tx.order.findUniqueOrThrow({ where: { id: order.id } });

  await tx.auditLog.create({
    data: {
      actorId,
      actorType,
      action: 'order.status_change',
      entityType: 'Order',
      entityId: order.id,
      before: { status: order.status },
      after: { status: to },
      metadata: reason ? { reason } : {}
    }
  });

  return updatedOrder;
}
