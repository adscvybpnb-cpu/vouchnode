import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { TradeService } from '../services/trade.service';

export default async function tradeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.post('/', async (request: any, reply) => {
    const { sellerId, cryptoType, cryptoAmount, amountUSD } = request.body || {};
    if (
      typeof sellerId !== 'string' || typeof cryptoType !== 'string' ||
      !Number.isFinite(Number(cryptoAmount)) || !Number.isFinite(Number(amountUSD))
    ) {
      return reply.status(400).send({ message: 'sellerId, cryptoType, cryptoAmount, and amountUSD are required' });
    }
    return reply.status(201).send(await TradeService.createTrade(request.user.id, {
      sellerId, cryptoType, cryptoAmount: Number(cryptoAmount), amountUSD: Number(amountUSD)
    }));
  });

  app.post('/:id/dispute', async (request: any, reply) => {
    return reply.status(201).send(await TradeService.openDispute(request.params.id, request.user.id));
  });

  app.post('/:id/dispute/escalate', async (request: any, reply) => {
    return reply.send(await TradeService.escalateDispute(request.params.id, request.user.id));
  });
}
