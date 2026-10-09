import { FastifyInstance } from 'fastify';
import { ReportService } from '../services/report.service';
import { authenticate } from '../middleware/auth.middleware';
import { Prisma } from '@prisma/client';

export default async function reportRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [authenticate] }, async (req: any, res) => {
    try {
      const body = req.body || {};
      const targetId = typeof body.targetId === 'string' ? body.targetId : body.reportedUserId;
      const reporterId = req.user?.id;
      req.log.info({ reporterId, targetType: body.targetType, targetId, reason: body.reason }, 'Report submission received');
      if (!reporterId) return res.status(401).send({ message: 'Authenticated reporter is required' });
      if (typeof body.targetType !== 'string' || typeof targetId !== 'string' || !targetId.trim() || typeof body.reason !== 'string' || !body.reason.trim()) {
        return res.status(400).send({ message: 'targetType, targetId, and reason are required' });
      }
      const allowedTypes = new Set(['PRODUCT', 'SELLER', 'BUYER', 'FRAUD', 'MESSAGE']);
      if (!allowedTypes.has(body.targetType)) return res.status(400).send({ message: 'Invalid report target type' });
      return res.status(201).send(await ReportService.createReport(reporterId, {
        targetType: body.targetType,
        targetId: targetId.trim(),
        reason: body.reason.trim(),
        description: typeof body.description === 'string' ? body.description.trim() : undefined,
      }));
    } catch (error) {
      req.log.error({ error }, 'Report creation failed');
      if (error instanceof Error && error.message === 'Reported user not found') {
        return res.status(404).send({ message: error.message });
      }
      if (error instanceof Error && error.message === 'Authenticated reporter not found') {
        return res.status(401).send({ message: error.message });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return res.status(400).send({ message: `Unable to save report (${error.code})` });
      }
      return res.status(500).send({ message: error instanceof Error ? error.message : 'Unable to submit report' });
    }
  });
}
