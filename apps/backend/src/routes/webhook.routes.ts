import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { OrderService } from '../services/order.service';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { DepositScannerService } from '../services/deposit-scanner.service';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const verifyAlchemySignature = (rawBody: string, signature: string | undefined) => {
  if (!env.ALCHEMY_WEBHOOK_SIGNING_KEY || !signature) return false;
  const expected = createHmac('sha256', env.ALCHEMY_WEBHOOK_SIGNING_KEY).update(rawBody).digest('hex');
  const supplied = signature.replace(/^sha256=/i, '');
  return expected.length === supplied.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
};

const sortIpnPayload = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortIpnPayload);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = sortIpnPayload((value as Record<string, unknown>)[key]);
        return sorted;
      }, {});
  }
  return value;
};

export const verifyNowPaymentsSignature = (payload: unknown, signature: string | undefined, secret = env.NOWPAYMENTS_IPN_SECRET) => {
  if (!secret || !signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secret)
    .update(JSON.stringify(sortIpnPayload(payload)))
    .digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
};

const nowPaymentsIpnSchema = z.object({
  order_id: z.string().trim().min(1).max(128),
  payment_id: z.union([z.string().trim().min(1).max(128), z.number().int().positive()]),
  payment_status: z.string().trim().min(1).max(40),
  price_amount: z.union([z.string(), z.number()]),
  price_currency: z.string().trim().min(1).max(20),
  pay_amount: z.union([z.string(), z.number()]),
  pay_currency: z.string().trim().min(1).max(40),
  actually_paid: z.union([z.string(), z.number()]),
  outcome_tx_hash: z.string().trim().min(1).max(200).optional(),
  payin_hash: z.string().trim().min(1).max(200).optional(),
}).passthrough();

const parsePositiveDecimal = (value: string | number) => {
  const normalized = String(value);
  if (!/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(normalized)) return null;
  try {
    const amount = new Prisma.Decimal(normalized);
    return amount.isFinite() && amount.gt(0) ? amount : null;
  } catch {
    return null;
  }
};

export default async function webhookRoutes(app: FastifyInstance) {
  app.post('/alchemy-webhook', async (request: any, reply: any) => {
    if (env.NODE_ENV === 'production' && !verifyAlchemySignature(request.rawBody || '', request.headers['x-alchemy-signature'])) {
      return reply.status(401).send({ message: 'Invalid webhook signature.' });
    }
    const body = request.body as Record<string, unknown>;
    const event = body?.event as Record<string, unknown> | undefined;
    const activities: unknown[] = Array.isArray(event?.activity)
      ? event.activity
      : Array.isArray(body?.activity) ? body.activity : [];
    const result = await DepositScannerService.processAlchemyActivities(activities);
    return reply.send({ status: 'ok', ...result });
  });

  app.post('/nowpayments', async (request: any, reply: any) => {
    const signature = request.headers['x-nowpayments-sig'];
    if (!env.NOWPAYMENTS_IPN_SECRET) {
      request.log.error('NOWPAYMENTS_IPN_SECRET is required in production');
      return reply.status(503).send({ message: 'Payment webhook is not configured.' });
    }
    if (!verifyNowPaymentsSignature(
      request.body,
      Array.isArray(signature) ? signature[0] : signature
    )) {
      return reply.status(401).send({ message: 'Invalid webhook signature.' });
    }
    const parsed = nowPaymentsIpnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Invalid payment notification.' });
    }
    const event = parsed.data;
    if (event.payment_status !== 'finished') return reply.send({ status: 'ok' });
    const priceAmount = parsePositiveDecimal(event.price_amount);
    const providerPayAmount = parsePositiveDecimal(event.pay_amount);
    const actuallyPaid = parsePositiveDecimal(event.actually_paid);
    if (!priceAmount || !providerPayAmount || !actuallyPaid) {
      return reply.status(400).send({ message: 'Invalid payment amount.' });
    }

    const providerTxId = String(event.payment_id);
    const transactionHash = event.outcome_tx_hash || event.payin_hash || providerTxId;
    const order = await prisma.order.findUnique({
      where: { id: event.order_id },
      select: {
        id: true,
        currency: true,
        totalAmount: true,
        status: true,
        transaction: {
          select: {
            id: true,
            amount: true,
            currency: true,
            providerTxId: true,
            cryptoTxHash: true,
          },
        },
      },
    });
    if (!order?.transaction) return reply.status(404).send({ message: 'Payment order not found.' });
    const transaction = order.transaction;

    if (event.price_currency.toUpperCase() !== transaction.currency.toUpperCase()) {
      return reply.status(400).send({ message: 'Payment currency does not match the order.' });
    }
    if (priceAmount.lt(transaction.amount)) {
      return reply.status(400).send({ message: 'Payment quote is below the expected order amount.' });
    }
    if (actuallyPaid.lt(providerPayAmount)) {
      return reply.status(400).send({ message: 'Payment amount is below the provider quote.' });
    }

    if (transaction.providerTxId && transaction.providerTxId !== providerTxId) {
      return reply.status(409).send({ message: 'Order is already associated with a different provider payment.' });
    }
    if (transaction.cryptoTxHash && transaction.cryptoTxHash !== transactionHash) {
      return reply.status(409).send({ message: 'Order is already associated with a different payment transaction.' });
    }
    if (order.status === 'PAID' && transaction.providerTxId === providerTxId) {
      return reply.send({ status: 'ok' });
    }
    if (!['PAYMENT_PENDING', 'PENDING_MANUAL_REVIEW'].includes(order.status)) {
      return reply.status(409).send({ message: 'Order is no longer awaiting payment.' });
    }

    const conflictingPayment = await prisma.transaction.findFirst({
      where: {
        OR: [
          { providerTxId, orderId: { not: order.id } },
          { cryptoTxHash: transactionHash, orderId: { not: order.id } },
        ],
      },
      select: { id: true },
    });
    if (conflictingPayment) {
      return reply.status(409).send({ message: 'Payment identifier has already been used.' });
    }
    await OrderService.processPaymentConfirmed(
      order.id,
      transactionHash,
      actuallyPaid.toString(),
      providerTxId,
    );
    return reply.send({ status: 'ok' });
  });
}
