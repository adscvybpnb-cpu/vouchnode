import { FastifyInstance } from 'fastify';
import { SellerService } from '../services/seller.service';
import { authenticate, optionalAuth, requireRole } from '../middleware/auth.middleware';
import { SellerRepository } from '../repositories/seller.repository';
import { ProductRepository } from '../repositories/product.repository';
import { UserRole } from '@vouchnode/shared';
import { createStorageProvider } from '../integrations/storage/storage.provider';
import { createAuditLog } from '../middleware/audit.middleware';
import { KycDocumentType, SellerStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { z } from 'zod';
import { KycService } from '../services/kyc.service';

const sellerApplicationSchema = z.object({
  shopName: z.string().trim().min(3).max(60),
  description: z.string().trim().min(30),
  category: z.string().trim().min(1).optional(),
  country: z.string().trim().min(1),
  language: z.string().trim().min(1).optional(),
  agreeSellerTerms: z.literal(true),
  frontDocument: z.string().trim().min(1).optional(),
  backDocument: z.string().trim().min(1).optional(),
  selfie: z.string().trim().min(1).optional()
}).strip();

export default async function sellerRoutes(app: FastifyInstance) {
  app.get('/onboarding-policy', async (_req, res) => {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'seller_fast_launch_enabled' },
      select: { value: true },
    });
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.send({
      fastLaunchEnabled: setting?.value.trim().toLowerCase() === 'true',
    });
  });

  app.get('/shop-name-availability', { preHandler: [authenticate] }, async (req: any, res) => {
    const shopName = typeof req.query?.shopName === 'string' ? req.query.shopName.trim() : '';
    if (shopName.length < 3 || shopName.length > 60) {
      return res.status(400).send({ message: 'Shop name must be between 3 and 60 characters' });
    }
    const shopSlug = shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const existingSeller = await SellerRepository.findByShopSlug(shopSlug);
    return res.send({
      available: !existingSeller || existingSeller.userId === req.user.id,
    });
  });

  app.get('/kyc-documents/*', { preHandler: [authenticate] }, async (req: any, res) => {
    const key = String(req.params['*'] || '').replace(/\\/g, '/');
    const document = await prisma.kycRequest.findFirst({
      where: {
        OR: [
          { frontDocumentKey: key },
          { backDocumentKey: key },
          { selfieKey: key },
        ],
      },
      select: { id: true, userId: true },
    });
    const isAdmin = req.user.roles?.includes(UserRole.ADMIN);
    if (!document || (document.userId !== req.user.id && !isAdmin)) {
      return res.status(404).send({ message: 'KYC document not found' });
    }
    try {
      const storage = createStorageProvider(config.storage.provider, config.storage.kycLocalPath, '/api/v1/sellers/kyc-documents', config.storage.s3);
      const content = await storage.read(key);
      return res.type(content.contentType).send(content.file);
    } catch {
      return res.status(404).send({ message: 'KYC document not found' });
    }
  });
  app.post('/kyc-submit', { preHandler: [authenticate] }, async (req: any, res) => {
    try {
      const fields: Record<string, string> = {};
      const files: Record<string, { buffer: Buffer; filename: string; mimetype: string }> = {};
      const allowedFields = new Set(['frontDocument', 'backDocument', 'selfie']);

      for await (const part of req.parts()) {
        if (part.type === 'field') {
          fields[part.fieldname] = String(part.value);
        } else {
          if (!allowedFields.has(part.fieldname)) return res.status(400).send({ message: `Unexpected KYC file field: ${part.fieldname}` });
          const buffer = await part.toBuffer();
          files[part.fieldname] = { buffer, filename: part.filename, mimetype: part.mimetype };
        }
      }

      if (!files.frontDocument || !files.backDocument || !files.selfie) {
        return res.status(400).send({ message: 'Three identity files are required' });
      }
      if (fields.documentType && !Object.values(KycDocumentType).includes(fields.documentType as KycDocumentType)) {
        return res.status(422).send({ message: 'Invalid document type' });
      }
      const dateOfBirth = fields.dateOfBirth ? new Date(fields.dateOfBirth) : undefined;
      if (dateOfBirth && (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth >= new Date())) {
        return res.status(422).send({ message: 'Invalid date of birth' });
      }

      const storage = createStorageProvider(config.storage.provider, config.storage.kycLocalPath, '/api/v1/sellers/kyc-documents', config.storage.s3);
      const [front, back, selfie] = await Promise.all([
        storage.upload(files.frontDocument.buffer, `kyc/${req.user.id}`, `front-${Date.now()}-${files.frontDocument.filename}`),
        storage.upload(files.backDocument.buffer, `kyc/${req.user.id}`, `back-${Date.now()}-${files.backDocument.filename}`),
        storage.upload(files.selfie.buffer, `kyc/${req.user.id}`, `selfie-${Date.now()}-${files.selfie.filename}`)
      ]);
      const existing = await prisma.kycRequest.findFirst({ where: { userId: req.user.id, status: { in: ['PENDING_ADMIN_REVIEW', 'NOT_SUBMITTED'] } } });
      if (existing) return res.status(409).send({ message: 'Your KYC request is already under review' });
      const kyc = await KycService.submitDocuments(req.user.id, {
        frontUrl: front.url,
        backUrl: back.url,
        selfieUrl: selfie.url,
        frontKey: front.key,
        backKey: back.key,
        selfieKey: selfie.key,
      }, {
        fullName: fields.fullName?.trim(),
        dateOfBirth,
        address: fields.address?.trim(),
        documentType: fields.documentType as KycDocumentType | undefined,
      });
      if (!kyc) {
        return res.status(500).send({ message: 'KYC request could not be processed' });
      }
      await createAuditLog({
        actorId: req.user.id,
        action: 'seller.kyc_submitted',
        entityType: 'KycRequest',
        entityId: kyc.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { documentType: fields.documentType }
      });
      return res.status(201).send({ data: { id: kyc.id, status: kyc.status }, message: 'KYC submitted for automated verification' });
    } catch (error) {
      req.log.error(error, 'KYC submission failed');
      const message = error instanceof Error ? error.message : 'KYC submission failed';
      return res.status(500).send({ statusCode: 500, error: 'KYC Submission Failed', message });
    }
  });
  app.get('/', async (req: any, res) => {
    try {
      const rawStatus = typeof req.query?.status === 'string' ? req.query.status.toUpperCase() : undefined;
      const status = rawStatus && Object.values(SellerStatus).includes(rawStatus as SellerStatus)
        ? rawStatus as SellerStatus
        : undefined;
      const requestedLimit = Number(req.query?.limit);
      const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 20;
      const requestedPage = Number(req.query?.page);
      const page = Number.isInteger(requestedPage) ? Math.max(requestedPage, 1) : 1;
      const result = await SellerRepository.findAll({ status }, { page, limit });
      return res.send({ ...result, page, limit, totalPages: Math.max(1, Math.ceil(result.total / limit)) });
    } catch (error) {
      req.log.error({ error }, 'Seller list failed');
      return res.status(200).send({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 });
    }
  });

  app.get('/:username', async (req: any, res) => {
    try {
      const seller = await SellerService.getSellerProfile(req.params.username);
      if (!seller) return res.status(404).send({ message: 'Seller not found' });
      return res.status(200).send(seller);
    } catch (error) {
      req.log.error({ error, username: req.params.username }, 'Seller profile lookup failed');
      return res.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Seller not found' });
    }
  });

  app.get('/:username/products', { preHandler: [optionalAuth] }, async (req: any, res) => {
    try {
      const query = req.query ?? {};
      const rawLimit = Number(query.limit);
      const rawPage = Number(query.page);
      const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
      const page = Number.isInteger(rawPage) ? Math.max(rawPage, 1) : 1;
      const allowedSorts = new Set(['price', 'rating', 'createdAt', 'soldCount', 'relevance']);
      const sortBy = 'createdAt';
      const sortOrder = 'desc';
      const result = await ProductRepository.getBySellerUserId(
        req.params.username,
        { status: 'ACTIVE' },
        { page, limit, sortBy, sortOrder },
      );
      return res.send({ ...result, page, limit, totalPages: Math.max(1, Math.ceil(result.total / limit)) });
    } catch (error) {
      req.log.error({ error, username: req.params.username }, 'Seller products lookup failed');
      return res.status(200).send({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 });
    }
  });

  app.get('/me/status', { preHandler: [authenticate] }, async (req: any, res) => {
    const seller = await prisma.seller.findUnique({
      where: { userId: req.user.id },
      select: { status: true, onboardingMode: true }
    });

    if (!seller) return res.send({ status: 'none', kycSkipped: false });
    const kycSkipped = seller.onboardingMode === 'FAST_LAUNCH';
    if (seller.status === 'ACTIVE') return res.send({ status: 'approved', kycSkipped });
    if (seller.status === 'PENDING') {
      const latestKyc = await prisma.kycRequest.findFirst({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      });
      if (latestKyc?.status === 'REJECTED') return res.send({ status: 'rejected', kycSkipped });
      return res.send({ status: 'pending', kycSkipped });
    }
    return res.send({ status: 'none', kycSkipped });
  });

  app.get('/me', { preHandler: [authenticate, requireRole([UserRole.SELLER])] }, async (req: any, res) => {
    return res.send(await SellerRepository.findByUserId(req.user.id));
  });

  app.patch('/me/settings', { preHandler: [authenticate, requireRole([UserRole.SELLER])] }, async (req: any, res) => {
    const seller = await SellerRepository.findByUserId(req.user.id);
    if (!seller) return res.status(404).send({ message: 'Not found' });
    return res.send(await SellerService.updateSellerSettings(seller.id, req.body));
  });

  app.post('/apply', { preHandler: [authenticate] }, async (req: any, res) => {
    try {
      const fields: Record<string, unknown> = {};
      const uploadedFiles: string[] = [];
      const kycFiles: Record<string, { buffer: Buffer; filename: string; mimetype: string }> = {};
      if (String(req.headers['content-type'] || '').startsWith('multipart/form-data')) {
        for await (const part of req.parts()) {
          if (part.type === 'field') {
            fields[part.fieldname] = String(part.value);
          } else {
            if (!['frontDocument', 'backDocument', 'selfie'].includes(part.fieldname)) continue;
            uploadedFiles.push(`${part.fieldname}:${part.filename}`);
            fields[part.fieldname] = part.filename;
            kycFiles[part.fieldname] = { buffer: await part.toBuffer(), filename: part.filename, mimetype: part.mimetype };
          }
        }
      } else {
        Object.assign(fields, req.body || {});
      }
      req.log.info({ fields: Object.keys(fields), files: uploadedFiles }, 'Seller application received');
      const parsedApplication = sellerApplicationSchema.safeParse({
        ...fields,
        agreeSellerTerms: fields.agreeSellerTerms === true || fields.agreeSellerTerms === 'true',
      });
      if (!parsedApplication.success) {
        return res.status(400).send({ message: 'Valid shop details and seller terms acceptance are required' });
      }
      const skipKycValue = fields.skipKyc;
      if (skipKycValue !== undefined && skipKycValue !== 'true' && skipKycValue !== 'false' && skipKycValue !== true && skipKycValue !== false) {
        return res.status(400).send({ message: 'skipKyc must be true or false' });
      }
      const skipKyc = skipKycValue === true || skipKycValue === 'true';
      const uploadedKycFileCount = Object.values(kycFiles).filter(Boolean).length;
      if (skipKyc && uploadedKycFileCount > 0) {
        return res.status(400).send({ message: 'Choose either KYC documents or Skip for Now, not both' });
      }
      if (!skipKyc && uploadedKycFileCount !== 3) {
        return res.status(400).send({ message: 'frontDocument, backDocument, and selfie are required' });
      }
      const fastLaunchSetting = skipKyc
        ? await prisma.systemSetting.findUnique({
          where: { key: 'seller_fast_launch_enabled' },
          select: { value: true, type: true },
        })
        : null;
      const fastLaunchEnabled = fastLaunchSetting?.type === 'BOOLEAN' && fastLaunchSetting.value === 'true';
      if (skipKyc && !fastLaunchEnabled) {
        return res.status(403).send({ message: 'Skipping identity verification is currently unavailable' });
      }

      const existingSeller = await prisma.seller.findUnique({ where: { userId: req.user.id } });
      const latestKyc = await prisma.kycRequest.findFirst({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      });
      const hasRejectedKyc = latestKyc?.status === 'REJECTED';
      if ((existingSeller?.status === 'PENDING' && !hasRejectedKyc) || existingSeller?.status === 'ACTIVE') {
        return res.status(409).send({
          statusCode: 409,
          error: 'Seller Application Locked',
          message: 'Your seller application is currently under review. Re-submission is locked.'
        });
      }

      const application = await SellerService.applyToSell(req.user.id, {
        shopName: parsedApplication.data.shopName,
        description: parsedApplication.data.description,
        onboardingMode: skipKyc ? 'FAST_LAUNCH' : 'SECURE_VERIFICATION',
      });
      if (skipKyc) {
        return res.status(200).send({
          success: true,
          data: application,
          status: 'ACTIVE',
          kycSkipped: true,
          message: 'Your seller account is approved. Identity verification remains incomplete.',
        });
      }
      const storage = createStorageProvider(config.storage.provider, config.storage.kycLocalPath, '/api/v1/sellers/kyc-documents', config.storage.s3);
      const [front, back, selfie] = await Promise.all([
        storage.upload(kycFiles.frontDocument.buffer, `kyc/${req.user.id}`, `front-${Date.now()}-${kycFiles.frontDocument.filename}`),
        storage.upload(kycFiles.backDocument.buffer, `kyc/${req.user.id}`, `back-${Date.now()}-${kycFiles.backDocument.filename}`),
        storage.upload(kycFiles.selfie.buffer, `kyc/${req.user.id}`, `selfie-${Date.now()}-${kycFiles.selfie.filename}`),
      ]);
      const kyc = await KycService.submitDocuments(req.user.id, {
        frontUrl: front.url, backUrl: back.url, selfieUrl: selfie.url,
        frontKey: front.key, backKey: back.key, selfieKey: selfie.key,
      });
      const updatedSeller = await prisma.seller.findUnique({ where: { userId: req.user.id } });
      return res.status(202).send({
        success: true,
        data: updatedSeller,
        status: kyc?.status ?? 'PENDING_ADMIN_REVIEW',
        kycSkipped: false,
        message: 'Your application is being processed.',
      });
    } catch (error) {
      console.error('[POST /sellers/apply] failed:', error);
      req.log.error(error, 'Seller application failed');
      const message = error instanceof Error ? error.message : 'Unable to submit seller application';
      const explicitStatusCode = typeof error === 'object' && error !== null && 'statusCode' in error
        ? (error as { statusCode?: unknown }).statusCode
        : undefined;
      const statusCode = typeof explicitStatusCode === 'number'
        ? explicitStatusCode
        : message.includes('currently under review') || message.includes('already approved') ? 409 : 500;
      return res.status(statusCode).send({ statusCode, error: 'Seller Application Failed', message });
    }
  });

  app.get('/me/stats', { preHandler: [authenticate, requireRole([UserRole.SELLER])] }, async (req: any, res) => {
    const seller = await SellerRepository.findByUserId(req.user.id);
    if (!seller) return res.status(404).send();
    await SellerRepository.updateStats(seller.id);
    return res.send(await SellerRepository.findByUserId(req.user.id));
  });
}
