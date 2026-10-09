import { Worker } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { OrderService } from '../services/order.service';

export const disputeTimerWorker = new Worker('DISPUTE_TIMER_QUEUE', async job => {
  const { disputeId: orderId } = job.data;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !['DISPUTE_OPEN', 'DISPUTED_WAITING_SELLER'].includes(order.status) || order.isEscalated) return;
  if (!order.sellerResponseDeadline || order.sellerResponseDeadline > new Date()) return;

  await OrderService.cancelExpiredSellerDispute(orderId);
}, { connection: redis });
