import { FastifyInstance } from 'fastify';
import { DisputeService } from '../services/dispute.service';
import { authenticate } from '../middleware/auth.middleware';
import { DisputeRepository } from '../repositories/dispute.repository';

export default async function disputeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req: any, res) => {
    return res.send(await DisputeRepository.findForUser(req.user.id));
  });

  app.post('/', async (req: any, res) => {
    const { orderId, reason, description } = req.body || {};
    if (typeof orderId !== 'string' || typeof reason !== 'string' || typeof description !== 'string' ||
        !reason.trim() || !description.trim()) {
      return res.status(400).send({ message: 'Order, reason, and description are required' });
    }
    const dispute = await DisputeService.escalateDispute(orderId, req.user.id, reason.trim(), description.trim());
    return res.status(201).send(dispute);
  });

  app.get('/:id', async (req: any, res) => {
    const dispute = await DisputeRepository.findById(req.params.id);
    if (!dispute) return res.status(404).send();
    if (dispute.buyerId !== req.user.id && dispute.sellerId !== req.user.id) return res.status(403).send();
    return res.send(dispute);
  });

  app.patch('/:id/status', async (req: any, res) => {
    const status = req.body?.status;
    if (!['AWAITING_SELLER', 'AWAITING_BUYER', 'CLOSED'].includes(status)) {
      return res.status(400).send({ message: 'Invalid dispute status' });
    }
    return res.send(await DisputeService.updateStatus(req.params.id, req.user.id, status));
  });
  
  // Note: /api/v1/orders/:id/escalate is defined in orders, but routes to DisputeService
}
