import { FastifyInstance } from 'fastify';
import { OrderService } from '../services/order.service';
import { OrderRepository } from '../repositories/order.repository';
import { CreateOrderSchema } from '@vouchnode/shared';
import crypto from 'crypto';
import { config } from '../config';
import { getEncryptionKey } from '../lib/encryption';
import { prisma } from '../lib/prisma';

function decryptInventoryContent(value: string) {
  const [ivHex, encryptedHex, authTagHex] = value.split(':');
  if (!ivHex || !encryptedHex || !authTagHex) throw new Error('Invalid delivered inventory record');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(config.security.encryptionKey), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return `${decipher.update(encryptedHex, 'hex', 'utf8')}${decipher.final('utf8')}`;
}

function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, nestedValue: unknown) =>
    typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue,
  )) as T;
}

export class OrderController {
  static async createOrder(request: any, reply: any) {
    const { productId, quantity } = CreateOrderSchema.parse(request.body);
    const order = await OrderService.createOrder(request.user.id, productId, quantity);
    return reply.status(201).send(order);
  }

  static async payWithWallet(request: any, reply: any) {
    const startedAt = Date.now();
    try {
      const { productId, quantity } = CreateOrderSchema.parse(request.body);
      const autoConvert = request.body?.autoConvert === true;
      const sourceAsset = typeof request.body?.sourceAsset === 'string' ? request.body.sourceAsset : undefined;
      const order = await OrderService.payWithWallet(request.user.id, productId, quantity, autoConvert, sourceAsset);
      request.log.info({ orderId: order.id, durationMs: Date.now() - startedAt }, 'Wallet payment completed');
      return reply.status(201).send(order);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet payment failed';
      const status = message.includes('Insufficient') ? 409 : error instanceof Error ? 400 : 500;
      request.log.error({ error, durationMs: Date.now() - startedAt }, 'Wallet payment failed');
      return reply.status(status).send({ statusCode: status, error: 'Wallet Payment Failed', message });
    }
  }

  static async getOrders(request: any, reply: any) {
    const pagination = { page: 1, limit: 20 };
    const orders = await OrderRepository.findByBuyerId(request.user.id, {}, pagination);
    return reply.send(orders);
  }

  static async getOrder(request: any, reply: any) {
    const order = await OrderRepository.findById(request.params.id);
    if (!order) return reply.status(404).send();
    if (order.buyerId !== request.user.id && order.sellerId !== request.user.id) return reply.status(403).send();
    const canViewCodes = order.buyerId === request.user.id &&
      ['PAID', 'DELIVERED', 'WAITING_BUYER_CONFIRMATION', 'DISPUTE_OPEN',
        'DISPUTED_WAITING_SELLER', 'DISPUTED_WAITING_BUYER', 'ESCALATED_TO_ADMIN', 'COMPLETED'].includes(order.status);
    const inventory = canViewCodes
      ? await prisma.productInventory.findUnique({ where: { orderId: order.id }, select: { encryptedContent: true } })
      : null;
    const digitalCodes = canViewCodes
      ? inventory ? [decryptInventoryContent(inventory.encryptedContent)] : []
      : [];
    const review = await prisma.review.findUnique({
      where: { orderId: order.id },
      select: { id: true, rating: true, content: true, createdAt: true },
    });
    return reply.send(toJsonSafe({ ...order, review, digitalCodes, digitalCode: digitalCodes[0] ?? null }));
  }

  static async confirmOrder(request: any, reply: any) {
    await OrderService.confirmOrder(request.params.id, request.user.id);
    return reply.send({ status: 'COMPLETED', message: 'Order confirmed successfully' });
  }
}
