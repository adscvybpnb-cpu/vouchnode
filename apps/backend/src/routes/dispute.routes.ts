import { FastifyInstance } from 'fastify';
import { DisputeService } from '../services/dispute.service';
import { authenticate } from '../middleware/auth.middleware';
import { DisputeRepository } from '../repositories/dispute.repository';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { createStorageProvider } from '../integrations/storage/storage.provider';
import { fileTypeFromBuffer } from 'file-type';

const allowedEvidenceTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const maxEvidenceSize = 10 * 1024 * 1024;

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

  app.post('/:disputeId/evidence', async (req: any, res) => {
    if (!String(req.headers['content-type'] || '').startsWith('multipart/form-data')) {
      return res.status(415).send({ message: 'Multipart form data is required' });
    }

    let dispute;
    try {
      dispute = await prisma.dispute.findUnique({
        where: { id: req.params.disputeId },
        select: { id: true, buyerId: true, sellerId: true },
      });
    } catch (error) {
      req.log.error({ error, disputeId: req.params.disputeId }, 'Unable to load dispute for evidence upload');
      return res.status(503).send({ message: 'Dispute service is temporarily unavailable. Please try again.' });
    }
    if (!dispute) return res.status(404).send({ message: 'Dispute not found' });
    if (dispute.buyerId !== req.user.id && dispute.sellerId !== req.user.id) {
      return res.status(403).send({ message: 'You cannot upload evidence to this dispute' });
    }

    let file: Buffer | undefined;
    let filename = '';
    let mimetype = '';
    let description: string | undefined;
    let invalidField = false;

    try {
      for await (const part of req.parts({
        limits: { fileSize: maxEvidenceSize, files: 1, fields: 1 },
      })) {
        if (part.type === 'file') {
          if (part.fieldname !== 'file') invalidField = true;
          filename = part.filename;
          mimetype = part.mimetype;
          file = await part.toBuffer();
        } else if (part.fieldname === 'description') {
          description = String(part.value).trim() || undefined;
        } else {
          invalidField = true;
        }
      }
    } catch (error) {
      const code = error instanceof Error && 'code' in error
        ? (error as NodeJS.ErrnoException).code
        : undefined;
      if (code === 'FST_REQ_FILE_TOO_LARGE') {
        return res.status(413).send({ message: 'Evidence images must be 10MB or smaller' });
      }
      req.log.warn({ error, disputeId: dispute.id }, 'Invalid dispute evidence multipart payload');
      return res.status(400).send({ message: 'Unable to read the uploaded evidence' });
    }

    if (invalidField) return res.status(400).send({ message: 'Only the file and optional description fields are supported' });
    if (!file?.length) return res.status(400).send({ message: 'An evidence image is required' });
    if (!allowedEvidenceTypes.has(mimetype)) {
      return res.status(415).send({ message: 'Evidence must be a JPG, PNG, WEBP, or GIF image' });
    }
    let detected;
    try {
      detected = await fileTypeFromBuffer(file);
    } catch (error) {
      req.log.warn({ error, disputeId: dispute.id }, 'Unable to inspect dispute evidence image');
      return res.status(415).send({ message: 'The uploaded file is not a valid supported image' });
    }
    if (!detected || detected.mime !== mimetype || !allowedEvidenceTypes.has(detected.mime)) {
      return res.status(415).send({ message: 'The uploaded file is not a valid supported image' });
    }
    if (description && description.length > 2000) {
      return res.status(422).send({ message: 'Evidence description must be 2000 characters or fewer' });
    }

    let storageKey: string | undefined;
    try {
      const storage = createStorageProvider(
        config.storage.provider,
        config.storage.local.path,
        '/uploads',
        config.storage.s3,
        config.storage.cloudinary,
      );
      const safeFilename = filename.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9._-]/g, '-') || 'evidence';
      const uploaded = await storage.upload(
        file,
        `disputes/${dispute.id}`,
        `${Date.now()}-${safeFilename}`,
      );
      storageKey = uploaded.key;
      const fileUrl = uploaded.url.startsWith('http')
        ? uploaded.url
        : `${config.app.apiUrl.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '')}${uploaded.url}`;
      const evidence = await prisma.disputeEvidence.create({
        data: {
          disputeId: dispute.id,
          uploadedBy: req.user.id,
          fileUrl,
          fileName: safeFilename,
          fileType: mimetype,
          fileSize: file.length,
          description,
        },
      });
      return res.status(201).send({ data: evidence });
    } catch (error) {
      req.log.error({ error, disputeId: dispute.id, userId: req.user.id }, 'Dispute evidence upload failed');
      if (storageKey) {
        try {
          const storage = createStorageProvider(
            config.storage.provider,
            config.storage.local.path,
            '/uploads',
            config.storage.s3,
            config.storage.cloudinary,
          );
          await storage.delete(storageKey);
        } catch (cleanupError) {
          req.log.error({ error: cleanupError, disputeId: dispute.id }, 'Unable to clean up unreferenced dispute evidence');
        }
      }
      return res.status(503).send({ message: 'Evidence upload is temporarily unavailable. Please try again.' });
    }
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
