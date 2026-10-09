import { FastifyInstance } from 'fastify';
import { AdminService } from '../services/admin.service';
import { ReferralService } from '../services/referral.service';
import { authenticate, requireAdminToken, requireRole } from '../middleware/auth.middleware';
import { UserRole } from '@vouchnode/shared';
import { MessageService } from '../services/message.service';
import { config } from '../config';
import { randomUUID } from 'node:crypto';
import { SystemSettingsService } from '../services/system-settings.service';
import { createStorageProvider } from '../integrations/storage/storage.provider';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { OrderService } from '../services/order.service';

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requireAdminToken);
  app.addHook('preHandler', requireRole([UserRole.ADMIN, UserRole.SUPPORT, 'SUPER_ADMIN']));

  app.get('/stats', async (req, res) => res.send(await AdminService.getDashboardStats()));
  app.get('/analytics/dashboard', async (_req, res) => res.send(await AdminService.getDashboardStats()));
  
  // Users
  app.get('/users', async (req: any, res) => res.send(await AdminService.getUsers(req.query)));
  app.get('/users/suspended', async (req: any, res) => res.send(await AdminService.getUsers({ ...req.query, status: 'SUSPENDED' })));
  app.get('/users/banned', async (req: any, res) => res.send(await AdminService.getUsers({ ...req.query, status: 'BANNED' })));
  app.get('/users/:id', async (req: any, res) => res.send(await AdminService.getUserDetails(req.params.id)));
  app.get('/kyc', async (req: any, res) => res.send(await AdminService.getKycRequests(req.query)));
  app.patch('/kyc/:id/review', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    const decision = req.body?.decision;
    if (!['APPROVE', 'REJECT'].includes(decision)) return res.status(400).send({ message: 'decision must be APPROVE or REJECT' });
    return res.send(await AdminService.reviewKyc(req.params.id, req.user.id, decision, req.body?.reason));
  });
  app.get('/kyc/:id/document/:kind', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    const request = await prisma.kycRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).send({ message: 'KYC request not found' });
    const keys: Record<string, string | null> = { front: request.frontDocumentKey, back: request.backDocumentKey, selfie: request.selfieKey };
    const key = keys[req.params.kind];
    if (!key) return res.status(404).send({ message: 'KYC document not found' });
    const storage = createStorageProvider(config.storage.provider, config.storage.kycLocalPath, '/uploads', config.storage.s3);
    const document = await storage.read(key);
    return res.type(document.contentType).send(document.file);
  });
  app.patch('/users/:id/suspend', { preHandler: [requireRole([UserRole.ADMIN, 'SUPER_ADMIN'])] }, async (req: any, res) => {
    await AdminService.suspendUser(req.params.id, req.user.id, req.body?.reason || 'Admin action');
    return res.send({ success: true, message: 'User status updated' });
  });
  app.patch('/users/:id/ban', { preHandler: [requireRole([UserRole.ADMIN, 'SUPER_ADMIN'])] }, async (req: any, res) => {
    await AdminService.banUser(req.params.id, req.user.id, req.body?.reason || 'Banned by administrator');
    return res.send({ success: true, message: 'User status updated' });
  });
  app.patch('/users/:id/activate', { preHandler: [requireRole([UserRole.ADMIN, 'SUPER_ADMIN'])] }, async (req: any, res) => {
    await AdminService.activateUser(req.params.id, req.user.id);
    return res.send({ success: true, message: 'User activated successfully' });
  });
  
  // Sellers
  app.get('/sellers', async (req: any, res) => res.send(await AdminService.getSellers(req.query)));
  app.patch('/sellers/:id/approve', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    await AdminService.approveSeller(req.params.id, req.user.id);
    return res.send({ status: 'ok' });
  });
  app.patch('/sellers/:id/suspend', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length > 1000) return res.status(400).send({ message: 'Suspension reason must be 1000 characters or fewer' });
    try {
      await AdminService.suspendSeller(req.params.id, req.user.id, reason || 'Suspended by administrator');
      return res.send({ success: true, message: 'Seller suspended successfully' });
    } catch (cause) {
      req.log.error({ err: cause, sellerId: req.params.id, adminId: req.user.id }, 'Unable to suspend seller');
      const statusCode = typeof (cause as { statusCode?: unknown })?.statusCode === 'number'
        ? (cause as { statusCode: number }).statusCode
        : 500;
      return res.status(statusCode).send({
        success: false,
        message: statusCode === 500 ? 'Unable to suspend seller' : (cause instanceof Error ? cause.message : 'Unable to suspend seller'),
      });
    }
  });
  app.patch('/sellers/:id/reject', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) return res.status(400).send({ message: 'A rejection reason is required' });
    await AdminService.rejectSeller(req.params.id, req.user.id, reason);
    return res.send({ status: 'ok' });
  });

  // Catalog CRUD and single-use digital code inventory
  app.get('/products', async (req: any, res) => res.send(await AdminService.getProducts(req.query)));
  app.post('/products', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    return res.status(201).send(await AdminService.createProduct(req.body, req.user.id));
  });
  app.patch('/products/:id', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    return res.send(await AdminService.updateProduct(req.params.id, req.body, req.user.id));
  });
  app.patch('/products/:id/restore', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    return res.send(await AdminService.restoreProduct(req.params.id, req.user.id));
  });
  app.delete('/products/:id', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    await AdminService.deleteProduct(req.params.id, req.user.id);
    return res.status(204).send();
  });
  app.post('/products/:id/codes', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    if (!Array.isArray(req.body?.codes)) return res.status(400).send({ message: 'codes must be an array' });
    return res.send(await AdminService.addProductCodes(req.params.id, req.body.codes, req.user.id));
  });

  // Operations and financial views
  app.get('/orders', async (req: any, res) => res.send(await AdminService.getOrders({ ...req.query, active: 'true' })));
  app.get('/orders/:id', async (req: any, res) => {
    const order = await AdminService.getOrderDetails(req.params.id);
    if (!order) return res.status(404).send({ message: 'Order not found' });
    return res.send(order);
  });
  app.patch('/orders/:id/manual-approve', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    const parsed = z.object({
      txHash: z.string().trim().min(6).max(200),
      amount: z.coerce.number().finite().positive(),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).send({ message: 'txHash and a positive amount are required' });
    const order = await OrderService.approveManualPayment(
      req.params.id,
      req.user.id,
      parsed.data.txHash,
      parsed.data.amount,
    );
    return res.send(order);
  });
  app.get('/orders/archive', async (req: any, res) => res.send(await AdminService.getOrders(req.query)));
  app.get('/disputes/p2p/metrics', async (req: any, res) => {
    const rawIds = typeof req.query?.userIds === 'string' ? req.query.userIds.split(',') : [];
    return res.send(await AdminService.getP2PUserMetrics(rawIds));
  });
  app.get('/disputes/p2p', async (req: any, res) => {
    try {
      const rawStatus = req.query?.status;
      const status = (Array.isArray(rawStatus) ? rawStatus : [rawStatus])
        .flatMap((value) => typeof value === 'string' ? value.split(',') : [])
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
      return res.send(await AdminService.getP2PDisputes({
        page: req.query?.page,
        limit: req.query?.limit,
        status,
      }));
    } catch (cause) {
      console.error('Admin P2P disputes request failed', cause);
      return res.status(500).send({ message: 'Unable to load P2P disputes' });
    }
  });
  app.get('/finance/deposits', async (req: any, res) => res.send(await AdminService.getDeposits(req.query)));
  app.get('/address-pool', async (req: any, res) => {
    const asset = typeof req.query?.asset === 'string' ? req.query.asset.toUpperCase() : undefined;
    return res.send(await prisma.staticAddressPool.findMany({
      where: asset ? { asset } : undefined,
      orderBy: [{ asset: 'asc' }, { status: 'asc' }, { id: 'asc' }]
    }));
  });
  app.post('/address-pool', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    const asset = typeof req.body?.asset === 'string' ? req.body.asset.trim().toUpperCase() : '';
    const addresses: unknown[] = Array.isArray(req.body?.addresses)
      ? req.body.addresses
      : typeof req.body?.addresses === 'string' ? req.body.addresses.split(/\r?\n/) : [];
    const supportedAssets = new Set(['BTC', 'SOL', 'BCH', 'LTC', 'TRX']);
    const normalizedAddresses: string[] = Array.from(new Set(addresses
      .filter((address: unknown): address is string => typeof address === 'string')
      .map((address: string) => address.trim())
      .filter(Boolean)));
    if (!supportedAssets.has(asset) || normalizedAddresses.length === 0) {
      return res.status(400).send({ message: 'asset and at least one wallet address are required' });
    }
    const result = await prisma.staticAddressPool.createMany({
      data: normalizedAddresses.map((address) => ({ asset, address, status: 'AVAILABLE' as const })),
      skipDuplicates: true
    });
    return res.status(201).send({ inserted: result.count });
  });
  app.delete('/address-pool/:id', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    await prisma.staticAddressPool.delete({
      where: { id: req.params.id }
    });
    return res.send({ success: true });
  });
  app.put('/deposits/:id/force-approve', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    try {
      const finalAmount = req.body?.finalAmount;
      if (typeof finalAmount !== 'string' && typeof finalAmount !== 'number') {
        return res.status(400).send({ message: 'finalAmount is required' });
      }
      return res.send(await AdminService.forceApproveDeposit(req.params.id, String(finalAmount), req.user.id));
    } catch (cause: any) {
      console.error('Admin deposit force approval failed', cause);
      return res.status(cause?.statusCode || 500).send({ message: cause?.message || 'Unable to force approve deposit' });
    }
  });
  app.get('/finance/withdrawals', async (req: any, res) => res.send(await AdminService.getWithdrawals(req.query)));
  app.put('/withdrawals/:id/status', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    try {
      const status = req.body?.status;
      if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
        return res.status(400).send({ message: 'status must be APPROVED, REJECTED, or CANCELLED' });
      }
      return res.send(await AdminService.updateWithdrawalStatus(
        req.params.id,
        status,
        req.user.id,
        req.body?.txHash,
        req.body?.reason,
      ));
    } catch (cause: any) {
      console.error('Admin withdrawal status update failed', cause);
      return res.status(cause?.statusCode || 500).send({ message: cause?.message || 'Unable to update withdrawal status' });
    }
  });
  app.get('/catalog', async (req: any, res) => res.send(await AdminService.getProducts({ ...req.query, status: req.query?.status || 'ACTIVE' })));
  app.get('/transactions', async (req: any, res) => res.send(await AdminService.getTransactions(req.query)));
  app.get('/reports', async (req: any, res) => res.send(await AdminService.getReports(req.query)));
  app.patch('/reports/:id/suspend-user', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    return res.send(await AdminService.moderateReport(req.params.id, req.user.id, 'SUSPEND', req.body?.reason));
  });
  app.patch('/reports/:id/warn-user', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    return res.send(await AdminService.moderateReport(req.params.id, req.user.id, 'WARN', req.body?.reason));
  });
  app.get('/fraud', async (req: any, res) => res.send(await AdminService.getFraudFlags(req.query)));
  app.patch('/fraud/:id/resolve', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    return res.send(await AdminService.resolveFraudFlag(req.params.id, req.user.id));
  });
  app.get('/audit-logs', async (req: any, res) => res.send(await AdminService.getAuditLogs(req.query)));
  app.get('/settings', async (_req: any, res) => res.send(await AdminService.getSettings()));
  app.patch('/settings', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => res.send(await AdminService.updateSettings(req.user.id, req.body || {})));
  app.post('/settings/logo', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    const part = await req.file();
    if (!part || part.fieldname !== 'logo') return res.status(400).send({ message: 'A logo file is required' });
    if (!part.mimetype.startsWith('image/')) return res.status(415).send({ message: 'Logo must be an image file' });
    const buffer = await part.toBuffer();
    if (buffer.length > 5 * 1024 * 1024) return res.status(413).send({ message: 'Logo must be 5MB or smaller' });
    const extension = part.filename.includes('.') ? part.filename.slice(part.filename.lastIndexOf('.')).toLowerCase() : '.png';
    const storage = createStorageProvider(config.storage.provider, config.storage.local.path, '/uploads', config.storage.s3);
    const uploaded = await storage.upload(buffer, 'branding', `${randomUUID()}${extension}`);
    await AdminService.updateSettings(req.user.id, { site_logo_url: uploaded.url });
    await SystemSettingsService.invalidate('site_logo_url');
    return res.send({ data: { logoUrl: uploaded.url } });
  });

  app.get('/referrals/summary', { preHandler: [requireRole([UserRole.ADMIN])] }, async (_req, res) => {
    const [referredUsers, activeReferrers, commissionTotals] = await Promise.all([
      prisma.user.count({ where: { referredById: { not: null } } }),
      prisma.user.count({ where: { referredUsers: { some: {} } } }),
      prisma.referralCommission.groupBy({
        by: ['currency'],
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    return res.send({
      referredUsers,
      activeReferrers,
      commissions: commissionTotals.map((row) => ({
        currency: row.currency,
        amount: row._sum.amount?.toString() ?? '0',
        count: row._count._all,
      })),
    });
  });
  app.get('/referrals/settings', { preHandler: [requireRole([UserRole.ADMIN])] }, async (_req, res) => {
    return res.send(await ReferralService.getPolicySettings());
  });
  app.patch('/referrals/settings', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    const parsed = z.object({
      enabled: z.boolean(),
      commissionRatePercent: z.number().finite().min(0).max(100),
      platformFeeCapPercent: z.number().finite().min(0).max(100),
    }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).send({ message: 'Referral settings require a boolean and percentage values from 0 to 100' });
    await AdminService.updateSettings(req.user.id, {
      referral_bonuses_enabled: parsed.data.enabled,
      referral_commission_rate_percent: parsed.data.commissionRatePercent,
      referral_platform_fee_cap_percent: parsed.data.platformFeeCapPercent,
    });
    return res.send(parsed.data);
  });
  app.get('/referrals', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      search: z.string().trim().max(120).optional(),
    }).safeParse(req.query);
    if (!query.success) return res.status(400).send({ message: 'Invalid referral list filters' });

    const { page, limit, search } = query.data;
    const where = {
      referredUsers: { some: {} },
      ...(search ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { referralCode: { contains: search, mode: 'insensitive' as const } },
          { profile: { is: { username: { contains: search, mode: 'insensitive' as const } } } },
        ],
      } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          referralCode: true,
          createdAt: true,
          profile: { select: { username: true, displayName: true } },
          _count: { select: { referredUsers: true } },
          referredUsers: {
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
              id: true,
              email: true,
              createdAt: true,
              profile: { select: { username: true, displayName: true } },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);
    const commissions = await prisma.referralCommission.groupBy({
      by: ['referrerId', 'currency'],
      where: { referrerId: { in: data.map((user) => user.id) } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const commissionsByReferrer = new Map<string, Array<{ currency: string; amount: string; count: number }>>();
    for (const commission of commissions) {
      const items = commissionsByReferrer.get(commission.referrerId) ?? [];
      items.push({
        currency: commission.currency,
        amount: commission._sum.amount?.toString() ?? '0',
        count: commission._count._all,
      });
      commissionsByReferrer.set(commission.referrerId, items);
    }

    return res.send({
      data: data.map((user) => ({
        id: user.id,
        email: user.email,
        referralCode: user.referralCode,
        createdAt: user.createdAt,
        profile: user.profile,
        referredCount: user._count.referredUsers,
        referredUsers: user.referredUsers,
        commissions: commissionsByReferrer.get(user.id) ?? [],
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  });

  // Disputes
  app.get('/disputes', async (req: any, res) => res.send(await AdminService.getAllDisputes(req.query)));
  app.get('/disputes/:id', async (req: any, res) => {
    const dispute = await AdminService.getDisputeDetails(req.params.id);
    if (!dispute) return res.status(404).send({ message: 'Dispute not found' });
    return res.send(dispute);
  });
  app.get('/conversations', async (_req: any, res) => res.send(await MessageService.getAllConversations()));
  app.patch('/disputes/:id/resolve-buyer', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    const resolution = req.body?.resolution;
    if (typeof resolution !== 'string' || !resolution.trim()) {
      return res.status(400).send({ message: 'resolution is required' });
    }
    await AdminService.resolveForBuyer(req.params.id, req.user.id, resolution.trim());
    return res.send({ status: 'ok' });
  });
  app.patch('/disputes/:id/resolve-seller', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    const resolution = req.body?.resolution;
    if (typeof resolution !== 'string' || !resolution.trim()) {
      return res.status(400).send({ message: 'resolution is required' });
    }
    await AdminService.resolveForSeller(req.params.id, req.user.id, resolution.trim());
    return res.send({ status: 'ok' });
  });
  app.patch('/p2p-disputes/:id/resolve', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    const resolution = req.body?.resolution;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!['BUYER', 'SELLER', 'RESOLVED_BUYER', 'RESOLVED_SELLER'].includes(resolution) || !note) {
      return res.status(400).send({ message: 'resolution and note are required' });
    }
    try {
      return res.send(await AdminService.resolveP2PDispute(
        req.params.id,
        req.user.id,
        resolution === 'BUYER' || resolution === 'RESOLVED_BUYER' ? 'BUYER' : 'SELLER',
        note
      ));
    } catch (cause) {
      req.log.error({ err: cause, disputeId: req.params.id, resolution }, 'Admin P2P dispute resolution failed');
      throw cause;
    }
  });

  app.post('/notifications/broadcast', { preHandler: [requireRole([UserRole.ADMIN])] }, async (req: any, res) => {
    const { title, message, type, link, userIds } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || typeof message !== 'string' || !message.trim()) {
      return res.status(400).send({ statusCode: 400, error: 'Invalid notification', message: 'title and message are required' });
    }
    if (userIds !== undefined && (!Array.isArray(userIds) || userIds.some((id: unknown) => typeof id !== 'string'))) {
      return res.status(400).send({ statusCode: 400, error: 'Invalid notification', message: 'userIds must be an array of ids' });
    }
    return res.status(201).send(await AdminService.broadcastNotification(req.user.id, { title, message, type, link, userIds }));
  });
}
