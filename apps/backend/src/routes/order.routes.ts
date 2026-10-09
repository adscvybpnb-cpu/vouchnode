import { FastifyInstance } from 'fastify';
import { OrderController } from '../controllers/order.controller';
import { authenticate } from '../middleware/auth.middleware';
import { DisputeService } from '../services/dispute.service';
import { config } from '../config';
import { createStorageProvider } from '../integrations/storage/storage.provider';
import { ReviewService } from '../services/review.service';
import { OrderService } from '../services/order.service';
import { UnifiedWalletEngineService } from '../services/unified-wallet-engine.service';
import { DepositScannerService } from '../services/deposit-scanner.service';
import { z } from 'zod';
import { createLockedCheckoutQuote } from '../services/price.service';
import { requiresManualReview } from '../config/blockchain';
import { prisma } from '../lib/prisma';
import { normalizeCryptoAmount } from '../utils/crypto-amount';
import { isTestPaymentSimulationAuthorized } from '../middleware/test-payment-simulation';

const directCheckoutSchema = z.object({
  productId: z.string().min(1),
  asset: z.string().trim().min(2).max(10),
  network: z.string().trim().min(2).max(20)
});

const directCheckoutSimulationSchema = z.object({
  sessionId: z.string().min(1),
  amount: z.number().finite().positive(),
  transactionHash: z.string().trim().min(6).max(200)
});

export default async function orderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  
  app.post('/', OrderController.createOrder);
  app.post('/direct-checkout', async (req: any, res) => {
    const parsed = directCheckoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send({ message: 'productId, asset, and network are required.' });
    let orderId: string | undefined;
    try {
      const order = await OrderService.createOrder(req.user.id, parsed.data.productId, 1, 'DIRECT_INVOICE');
      orderId = order.id;
      const quote = await createLockedCheckoutQuote(Number(order.totalAmount), parsed.data.asset);
      const normalizedAmount = Number(normalizeCryptoAmount(quote.cryptoAmount, parsed.data.asset, parsed.data.network));
      const session = await UnifiedWalletEngineService.createDepositSession(
        req.user.id,
        parsed.data.asset,
        parsed.data.network,
        normalizedAmount,
        order.id,
        { usdAmount: quote.usdAmount, exchangeRate: quote.exchangeRate }
      );
      if (requiresManualReview(parsed.data.asset, parsed.data.network)) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: 'PENDING_MANUAL_REVIEW' },
        });
        await prisma.transaction.update({
          where: { orderId: order.id },
          data: {
            metadata: {
              paymentMethod: 'DIRECT_INVOICE',
              depositAsset: parsed.data.asset.toUpperCase(),
              depositNetwork: session.network,
            },
          },
        });
      }
      return res.status(201).send({
        orderId: order.id,
        orderNumber: order.orderNumber,
        sessionId: session.id,
        address: session.address,
        network: session.network,
        amount: normalizedAmount,
        usdAmount: Number(quote.usdAmount),
        exchangeRate: quote.exchangeRate.toNumber(),
        expiresAt: session.expiresAt,
        status: requiresManualReview(parsed.data.asset, parsed.data.network) ? 'PENDING_MANUAL_REVIEW' : order.status
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create direct checkout session.';
      req.log.error({ error, userId: req.user.id }, 'Direct checkout session creation failed');
      if (orderId) {
        try {
          await OrderService.releaseUnpaidOrder(orderId, 'Invoice creation failed', false);
        } catch (cleanupError) {
          req.log.error({ error: cleanupError, orderId }, 'Unable to release inventory after invoice creation failed');
          return res.status(500).send({ message: 'Invoice creation failed and its inventory reservation requires attention.' });
        }
      }
      return res.status(400).send({ message });
    }
  });
  app.post('/direct-checkout/simulate-payment', async (req: any, res) => {
    if (!isTestPaymentSimulationAuthorized(req)) {
      return res.status(404).send({ message: 'Payment simulation is available only in development.' });
    }
    const parsed = directCheckoutSimulationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send({ message: 'sessionId, amount, and transactionHash are required.' });
    try {
      const session = await DepositScannerService.simulateCheckoutPayment(
        req.user.id,
        parsed.data.sessionId,
        parsed.data.amount,
        parsed.data.transactionHash
      );
      return res.send({ sessionId: session.id, orderId: session.orderId, status: 'PAID' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to simulate checkout payment.';
      req.log.error({ error, userId: req.user.id }, 'Direct checkout payment simulation failed');
      return res.status(/not found/i.test(message) ? 404 : 409).send({ message });
    }
  });
  app.get('/direct-checkout/:sessionId/status', async (req: any, res) => {
    const sessionFilter = { id: req.params.sessionId, userId: req.user.id, orderId: { not: null } };
    let session = await prisma.depositSession.findFirst({
      where: sessionFilter,
      select: {
        id: true,
        status: true,
        order: { select: { id: true, buyerId: true, status: true, paymentStatus: true } },
      },
    });
    if (!session?.order || session.order.buyerId !== req.user.id) {
      return res.status(404).send({ message: 'Checkout payment session not found.' });
    }
    if (session.status === 'PENDING' && session.order.status === 'PAYMENT_PENDING') {
      const sessionId = session.id;
      try {
        await DepositScannerService.scanCheckoutSession(sessionId);
        session = await prisma.depositSession.findFirst({
          where: sessionFilter,
          select: {
            id: true,
            status: true,
            order: { select: { id: true, buyerId: true, status: true, paymentStatus: true } },
          },
        });
      } catch (error) {
        req.log.error({ error, sessionId }, 'Direct checkout fresh blockchain scan failed');
      }
      if (!session?.order || session.order.buyerId !== req.user.id) {
        return res.status(404).send({ message: 'Checkout payment session not found.' });
      }
    }
    return res.send({
      sessionId: session.id,
      sessionStatus: session.status,
      orderId: session.order.id,
      orderStatus: session.order.status,
      paymentStatus: session.order.paymentStatus,
    });
  });
  app.post('/wallet-pay', OrderController.payWithWallet);
  app.get('/me', OrderController.getOrders);
  app.get('/', OrderController.getOrders);
  app.get('/:id', OrderController.getOrder);
  app.post('/:id/confirm', OrderController.confirmOrder);
  app.post('/:id/feedback', async (req: any, res) => {
    const { ratingType, content } = req.body || {};
    if (!['POSITIVE', 'NEUTRAL', 'NEGATIVE'].includes(ratingType)) {
      return res.status(400).send({ message: 'A valid rating type is required' });
    }
    return res.status(201).send(await ReviewService.createFeedback(req.params.id, req.user.id, { ratingType, content }));
  });
  app.post('/:id/dispute', async (req: any, res) => {
    if (!String(req.headers['content-type'] || '').startsWith('multipart/form-data')) {
      if (req.body?.action === 'ESCALATE') {
        return res.send(await DisputeService.escalateDispute(req.params.id, req.user.id, 'Buyer escalation', 'Buyer escalated the dispute to admin'));
      }
      return res.status(415).send({ message: 'A proof image is required' });
    }
    let description = '';
    let evidence: { fileUrl: string; fileName: string; fileType: string; fileSize: number } | undefined;
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'proofImage' || !part.mimetype.startsWith('image/')) {
          return res.status(415).send({ message: 'A valid proof image is required' });
        }
        const buffer = await part.toBuffer();
        if (!buffer.length) return res.status(422).send({ message: 'The proof image cannot be empty' });
        const storage = createStorageProvider(config.storage.provider, config.storage.local.path, '/uploads', config.storage.s3);
        const uploaded = await storage.upload(buffer, `disputes/${req.user.id}`, `${Date.now()}-${part.filename.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
        evidence = { fileUrl: uploaded.url, fileName: part.filename, fileType: part.mimetype, fileSize: buffer.length };
      } else if (part.fieldname === 'description') {
        description = String(part.value).trim();
      }
    }
    if (!description || !evidence) return res.status(422).send({ message: 'Description and proof image are required' });
    return res.status(201).send(await DisputeService.escalateDispute(req.params.id, req.user.id, 'Buyer dispute', description, evidence));
  });
  app.post('/:id/dispute/respond', async (req: any, res) => {
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    if (!description) return res.status(400).send({ message: 'A response is required' });
    return res.status(200).send(await DisputeService.respondToDispute(req.params.id, req.user.id, description));
  });
  app.post('/:id/refund', async (req: any, res) => {
    try {
      const refunded = await OrderService.refundDisputedOrder(req.params.id, req.user.id);
      return res.status(200).send({ success: refunded, status: 'CANCELLED' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel order and refund escrow';
      const statusCode = /not available|Unauthorized|no longer|Insufficient|Escrow transaction/i.test(message) ? 409 : 500;
      req.log.error({ error, orderId: req.params.id, sellerId: req.user.id }, 'Seller order cancellation failed');
      return res.status(statusCode).send({ success: false, message });
    }
  });
}
