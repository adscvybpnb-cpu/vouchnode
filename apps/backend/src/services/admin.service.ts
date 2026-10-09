import { prisma } from '../lib/prisma';
import { SellerService } from './seller.service';
import { DisputeService } from './dispute.service';
import { P2POrderService } from './p2p-order.service';
import { SystemSettingsService } from './system-settings.service';
import { ReportService } from './report.service';
import { ProductRepository } from '../repositories/product.repository';
import { ProductService } from './product.service';
import { FraudFlagType, NotificationType, P2PDisputeStatus, Prisma, ReportStatus, TransactionStatus } from '@prisma/client';
import { UserRole } from '@vouchnode/shared';
import { BRAND_NAME } from '@vouchnode/shared';
import { NotificationService } from './notification.service';
import { emitAccountStatusRevoked } from '../websocket/socket.server';

export class AdminService {
  private static pagination(filters: any) {
    const page = Math.max(1, Number(filters?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters?.limit) || 25));
    return { page, limit, skip: (page - 1) * limit };
  }

  // Users
  static async getUsers(filters: any) {
    const { page, limit, skip } = this.pagination(filters);
    const search = typeof filters?.search === 'string' ? filters.search.trim() : '';
    const status = typeof filters?.status === 'string' ? filters.status : 'ACTIVE';
    const where = {
      status: status as any,
      ...(search ? { OR: [{ email: { contains: search, mode: 'insensitive' as const } }, { id: search }] } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          emailVerified: true,
          status: true,
          profile: { select: { displayName: true, username: true, avatarUrl: true } },
          roles: { select: { role: { select: { name: true } } } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    const rolePriority = ['SUPER_ADMIN', 'ADMIN', 'SELLER', 'SUPPORT', 'BUYER'];
    const users = data.map((user) => {
      const roleNames = user.roles.map(({ role }) => role.name);
      const primaryRole = rolePriority.find((role) => roleNames.includes(role)) ?? roleNames[0] ?? 'UNASSIGNED';
      return {
        id: user.id,
        email: user.email,
        username: user.profile?.username ?? '',
        profile: user.profile,
        status: user.status,
        isVerified: user.emailVerified,
        roles: roleNames,
        role: primaryRole,
      };
    });
    return { data: users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async getUserDetails(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        roles: { include: { role: true } },
        sellerProfile: {
          include: {
            products: {
              where: { status: { not: 'INACTIVE' } },
              select: { id: true, name: true, status: true, currentPrice: true, currency: true, stock: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        wallets: {
          include: {
            deposits: { orderBy: { createdAt: 'desc' }, take: 100 },
            withdrawals: { orderBy: { createdAt: 'desc' }, take: 100 },
          },
        },
        sellerOrders: { where: { status: 'COMPLETED' }, select: { id: true, orderNumber: true, totalAmount: true, currency: true, completedAt: true, createdAt: true } },
        orders: { select: { id: true, orderNumber: true, status: true, totalAmount: true, currency: true, createdAt: true } },
        reviewsReceived: { orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, rating: true, title: true, content: true, createdAt: true, buyerId: true } },
        disputesAsBuyer: { select: { id: true, disputeNumber: true, status: true, reason: true, createdAt: true, resolvedAt: true } },
        disputesAsSeller: { select: { id: true, disputeNumber: true, status: true, reason: true, createdAt: true, resolvedAt: true } },
        sessions: { orderBy: { lastUsedAt: 'desc' }, take: 100, select: { id: true, deviceInfo: true, ipAddress: true, userAgent: true, isRevoked: true, createdAt: true, lastUsedAt: true } },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, action: true, ipAddress: true, userAgent: true, createdAt: true, metadata: true } },
      },
    });
    if (!user) return null;

    const wallets = user.wallets.map((wallet) => ({
      id: wallet.id,
      currency: wallet.currency,
      availableBalance: wallet.availableBalance.toString(),
      pendingBalance: wallet.pendingBalance.toString(),
      frozenBalance: wallet.frozenBalance.toString(),
      escrowBalance: wallet.escrowBalance.toString(),
    }));
    const deposits = user.wallets.flatMap((wallet) => wallet.deposits.map((deposit) => ({
      id: deposit.id,
      currency: deposit.currency,
      amount: deposit.amount?.toString() ?? null,
      status: deposit.status,
      network: deposit.network,
      cryptoTxHash: deposit.cryptoTxHash,
      createdAt: deposit.createdAt,
      confirmedAt: deposit.confirmedAt,
    })));
    const withdrawals = user.wallets.flatMap((wallet) => wallet.withdrawals.map((withdrawal) => ({
      id: withdrawal.id,
      currency: withdrawal.currency,
      amount: withdrawal.amount.toString(),
      netAmount: withdrawal.netAmount.toString(),
      status: withdrawal.status,
      network: withdrawal.network,
      cryptoTxHash: withdrawal.cryptoTxHash,
      createdAt: withdrawal.createdAt,
      processedAt: withdrawal.processedAt,
    })));
    const disputes = [...user.disputesAsBuyer, ...user.disputesAsSeller]
      .filter((dispute, index, all) => all.findIndex((candidate) => candidate.id === dispute.id) === index);
    const feedbackCount = user.reviewsReceived.length;
    const feedbackAverage = feedbackCount
      ? user.reviewsReceived.reduce((sum, review) => sum + review.rating, 0) / feedbackCount
      : 0;
    const completedSalesTotal = user.sellerOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);
    const totalDeposits = deposits.reduce((sum, deposit) => sum + Number(deposit.amount || 0), 0);
    const totalWithdrawals = withdrawals.reduce((sum, withdrawal) => sum + Number(withdrawal.amount), 0);
    const criticalRiskTrigger = disputes.length >= 10 && user.sellerOrders.length === 1;

    return {
      id: user.id,
      email: user.email,
      status: user.status,
      kycStatus: user.kycStatus,
      riskScore: criticalRiskTrigger ? 90 : user.riskScore,
      riskLevel: criticalRiskTrigger ? 'CRITICAL' : user.riskLevel,
      criticalRiskTrigger,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      profile: user.profile,
      roles: user.roles.map((entry) => entry.role.name),
      seller: user.sellerProfile ? {
        id: user.sellerProfile.id,
        shopName: user.sellerProfile.shopName,
        shopSlug: user.sellerProfile.shopSlug,
        status: user.sellerProfile.status,
        verificationLevel: user.sellerProfile.verificationLevel,
      } : null,
      financials: { wallets, deposits, withdrawals, totalDeposits, totalWithdrawals },
      trading: {
        completedSales: user.sellerOrders.length,
        completedSalesTotal,
        activeListings: user.sellerProfile?.products ?? [],
        feedback: { count: feedbackCount, averageRating: feedbackAverage, reviews: user.reviewsReceived },
      },
      disputes: {
        total: disputes.length,
        open: disputes.filter((dispute) => !['RESOLVED_BUYER', 'RESOLVED_SELLER', 'CLOSED'].includes(dispute.status)).length,
        closed: disputes.filter((dispute) => ['RESOLVED_BUYER', 'RESOLVED_SELLER', 'CLOSED'].includes(dispute.status)).length,
        records: disputes,
      },
      security: {
        sessions: user.sessions,
        auditLogs: user.auditLogs,
        knownIps: [...new Set([user.lastLoginIp, ...user.sessions.map((session) => session.ipAddress), ...user.auditLogs.map((log) => log.ipAddress)].filter((ip): ip is string => Boolean(ip)))],
      },
      recentOrders: user.orders,
    };
  }
  static async getKycRequests(filters: any) {
    const { page, limit, skip } = this.pagination(filters);
    const requestedStatuses = typeof filters?.status === 'string'
      ? filters.status.split(',').map((status: string) => status.trim()).filter(Boolean)
      : [];
    const where = requestedStatuses.length
      ? { status: requestedStatuses.length === 1 ? requestedStatuses[0] as any : { in: requestedStatuses as any } }
      : { status: { in: ['PENDING_ADMIN_REVIEW', 'PENDING_MANUAL_REVIEW', 'PENDING'] as any } };
    const [data, total] = await Promise.all([
      prisma.kycRequest.findMany({ where, skip, take: limit, orderBy: { createdAt: 'asc' }, include: { user: { include: { profile: true } } } }),
      prisma.kycRequest.count({ where }),
    ]);
    return { data: Array.isArray(data) ? data : [], total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async reviewKyc(id: string, adminId: string, decision: 'APPROVE' | 'REJECT', reason?: string) {
    const request = await prisma.kycRequest.findUnique({ where: { id } });
    if (!request) throw Object.assign(new Error('KYC request not found'), { statusCode: 404 });
    const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const result = await prisma.$transaction(async (tx) => {
      const sellerRole = decision === 'APPROVE'
        ? await tx.role.findUnique({ where: { name: UserRole.SELLER } })
        : null;
      if (decision === 'APPROVE' && !sellerRole) {
        throw Object.assign(new Error('SELLER role is not configured'), { statusCode: 500 });
      }
      const reviewUpdate = await tx.kycRequest.updateMany({
        where: {
          id,
          status: { in: ['PENDING_ADMIN_REVIEW', 'PENDING_MANUAL_REVIEW', 'PENDING'] },
        },
        data: { status, reviewedAt: new Date(), reviewedBy: adminId, rejectionReason: decision === 'REJECT' ? reason || 'Rejected by administrator' : null },
      });
      if (reviewUpdate.count === 0) {
        throw Object.assign(new Error('KYC request is no longer pending review'), { statusCode: 409 });
      }
      const updated = await tx.kycRequest.findUniqueOrThrow({ where: { id } });
      const userUpdate = await tx.user.updateMany({
        where: { id: request.userId, kycStatus: { not: 'APPROVED' } },
        data: {
          kycStatus: status,
          status: 'ACTIVE',
          ...(decision === 'APPROVE' ? { tokenVersion: { increment: 1 } } : {}),
        },
      });
      if (userUpdate.count !== 1) {
        throw Object.assign(new Error('User KYC is already approved'), { statusCode: 409 });
      }
      if (sellerRole) {
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: request.userId, roleId: sellerRole.id } },
          create: { userId: request.userId, roleId: sellerRole.id, grantedBy: adminId },
          update: { grantedBy: adminId },
        });
        await tx.seller.updateMany({
          where: { userId: request.userId },
          data: { status: 'ACTIVE', verificationLevel: 1, approvedAt: new Date(), rejectedAt: null, rejectionReason: null },
        });
      }
      const notification = await NotificationService.createInTransaction(tx, {
        userId: request.userId,
        type: decision === 'APPROVE' ? NotificationType.SELLER_APPROVED : NotificationType.SELLER_REJECTED,
        title: decision === 'APPROVE' ? 'Identity verification approved' : 'Identity verification rejected',
        message: decision === 'APPROVE'
          ? 'Your identity verification request has been approved! You can now start selling.'
          : 'Your identity verification request has been rejected. Please review your documents and try again.',
        link: decision === 'APPROVE' ? '/seller' : '/dashboard/profile',
      });
      return {
        updated,
        notification,
        audit: {
          actorId: adminId,
          actorType: 'ADMIN',
          action: `kyc.${decision.toLowerCase()}`,
          entityType: 'KycRequest',
          entityId: id,
          metadata: { reason },
        },
      };
    });

    NotificationService.emit(result.notification);

    try {
      await prisma.auditLog.create({ data: result.audit });
    } catch (error) {
      const isForeignKeyViolation =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003';

      if (!isForeignKeyViolation) {
        console.error(
          'KYC review committed, but audit logging failed.',
          error
        );
        return result.updated;
      }

      try {
        await prisma.auditLog.create({
          data: {
            ...result.audit,
            actorId: null,
            actorType: 'SYSTEM',
            metadata: {
              ...(result.audit.metadata ?? {}),
              auditFallback: true,
              originalActorId: adminId,
              reason:
                'Audit foreign-key reference was unavailable',
            },
          },
        });
      } catch (fallbackError) {
        console.error(
          'KYC review committed, but audit fallback logging failed.',
          fallbackError
        );
      }
    }

    return result.updated;
  }
  private static async updateUserStatus(id: string, adminId: string, status: 'SUSPENDED' | 'BANNED', reason: string) {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
      if (id === adminId) {
        throw Object.assign(new Error('Administrators cannot suspend or ban their own account'), { statusCode: 409 });
      }
      const seller = await tx.seller.findUnique({ where: { userId: id }, select: { id: true } });
      await tx.user.update({
        where: { id },
        data: { status, isOnline: false },
      });
      await tx.session.updateMany({ where: { userId: id }, data: { isRevoked: true } });
      if (seller) await tx.product.updateMany({ where: { sellerId: seller.id, status: 'ACTIVE' }, data: { status: 'HIDDEN' } });
      const auditActor = await tx.user.findUnique({ where: { id: adminId }, select: { id: true } });
      await tx.auditLog.create({
        data: {
          actorId: auditActor?.id ?? null,
          actorType: 'ADMIN',
          action: status === 'SUSPENDED' ? 'user.suspend' : 'user.ban',
          entityType: 'User',
          entityId: id,
          before: { status: user.status },
          after: { status },
          metadata: {
            reason,
            productsDelisted: Boolean(seller),
            ...(!auditActor ? { originalActorId: adminId, auditActorUnavailable: true } : {}),
          },
        },
      });
    });
    emitAccountStatusRevoked(id, status);
  }
  static async suspendUser(id: string, adminId: string, reason: string) {
    return this.updateUserStatus(id, adminId, 'SUSPENDED', reason);
  }
  static async banUser(id: string, adminId: string, reason: string) {
    return this.updateUserStatus(id, adminId, 'BANNED', reason);
  }
  static async getOrderDetails(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        product: true,
        buyer: { include: { profile: true } },
        seller: { include: { profile: true } },
        transaction: true,
        dispute: { include: { messages: true, evidence: true, timeline: true } },
        conversation: { include: { messages: true } },
      },
    });
  }
  static async activateUser(id: string, adminId: string) {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

      await tx.user.update({ where: { id }, data: { status: 'ACTIVE' } });
      const auditActor = await tx.user.findUnique({ where: { id: adminId }, select: { id: true } });
      await tx.auditLog.create({
        data: {
          actorId: auditActor?.id ?? null,
          actorType: 'ADMIN',
          action: 'user.activate',
          entityType: 'User',
          entityId: id,
          before: { status: user.status },
          after: { status: 'ACTIVE' },
          ...(!auditActor ? { metadata: { originalActorId: adminId, auditActorUnavailable: true } } : {}),
        },
      });
    });
  }

  // Sellers
  static async getSellers(filters: any) {
    const { page, limit, skip } = this.pagination(filters);
    const search = typeof filters?.search === 'string' ? filters.search.trim() : '';
    const where = search ? { OR: [{ shopName: { contains: search, mode: 'insensitive' as const } }, { user: { email: { contains: search, mode: 'insensitive' as const } } }] } : {};
    const [data, total] = await Promise.all([
      prisma.seller.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { user: { select: { email: true, profile: true } } } }),
      prisma.seller.count({ where }),
    ]);
    return { data: Array.isArray(data) ? data : [], total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async approveSeller(id: string, adminId: string) { return SellerService.approveSeller(id, adminId); }
  static async rejectSeller(id: string, adminId: string, reason: string) { return SellerService.rejectSeller(id, adminId, reason); }
  static async suspendSeller(id: string, adminId: string, reason: string) { return SellerService.suspendSeller(id, adminId, reason); }

  // Products
  static async getProducts(filters: any) {
    const page = Math.max(1, Number(filters?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters?.limit) || 50));
    return ProductRepository.findAdminMany(page, limit, filters?.search, filters?.status);
  }
  static async createProduct(data: {
    name: string; slug?: string; description: string; categoryId: string; sellerId: string;
    brand?: string; originalPrice: number; currentPrice: number; currency?: string;
    deliveryType?: 'INSTANT' | 'MANUAL'; imageUrl?: string; codes?: string[];
  }, adminId: string) {
    const slug = data.slug ?? data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const product = await prisma.product.create({
      data: {
        name: data.name, slug, description: data.description, categoryId: data.categoryId,
        sellerId: data.sellerId, brand: data.brand, originalPrice: data.originalPrice,
        currentPrice: data.currentPrice, currency: data.currency ?? 'USD',
        deliveryType: data.deliveryType ?? 'INSTANT', status: 'ACTIVE', tags: data.brand ? [data.brand.toLowerCase()] : [],
        images: data.imageUrl ? { create: { url: data.imageUrl, altText: data.name } } : undefined,
      },
    });
    if (data.codes?.length) await ProductService.addInventoryAsAdmin(product.id, data.codes);
    await prisma.auditLog.create({ data: { actorId: adminId, actorType: 'ADMIN', action: 'product.create', entityType: 'Product', entityId: product.id } });
    return ProductRepository.findById(product.id);
  }
  static async updateProduct(id: string, data: Prisma.ProductUpdateInput, adminId: string) {
    const product = await prisma.product.update({ where: { id }, data });
    await prisma.auditLog.create({ data: { actorId: adminId, actorType: 'ADMIN', action: 'product.update', entityType: 'Product', entityId: id } });
    return product;
  }
  static async deleteProduct(id: string, adminId: string) {
    await prisma.product.update({ where: { id }, data: { status: 'INACTIVE' } });
    await prisma.auditLog.create({ data: { actorId: adminId, actorType: 'ADMIN', action: 'product.delete', entityType: 'Product', entityId: id } });
  }
  static async restoreProduct(id: string, adminId: string) {
    const product = await prisma.product.update({ where: { id }, data: { status: 'ACTIVE' } });
    await prisma.auditLog.create({ data: { actorId: adminId, actorType: 'ADMIN', action: 'product.restore', entityType: 'Product', entityId: id } });
    return product;
  }
  static async addProductCodes(id: string, codes: string[], adminId: string) {
    const result = await ProductService.addInventoryAsAdmin(id, codes);
    await prisma.auditLog.create({ data: { actorId: adminId, actorType: 'ADMIN', action: 'product.codes.add', entityType: 'Product', entityId: id, metadata: result } });
    return result;
  }
  static async approveProduct(id: string, adminId: string) { return prisma.product.update({ where: { id }, data: { status: 'ACTIVE' } }); }
  static async rejectProduct(id: string, adminId: string, reason: string) { return prisma.product.update({ where: { id }, data: { status: 'REJECTED' } }); }
  static async featureProduct(id: string, adminId: string, featured: boolean) { return prisma.product.update({ where: { id }, data: { isFeatured: featured } }); }

  // Financial
  static async getTransactions(filters: any) {
    const { page, limit, skip } = this.pagination(filters);
    const search = typeof filters?.search === 'string' ? filters.search.trim().slice(0, 120) : '';
    const transactionStatus = typeof filters?.status === 'string'
      ? Object.values(TransactionStatus).find((status) => status === filters.status)
      : undefined;
    const where: Prisma.TransactionWhereInput = {
      ...(transactionStatus ? { status: transactionStatus } : {}),
      ...(search ? {
        OR: [
          { id: { contains: search, mode: 'insensitive' } },
          { orderId: { contains: search, mode: 'insensitive' } },
          { buyerId: { contains: search, mode: 'insensitive' } },
          { sellerId: { contains: search, mode: 'insensitive' } },
          { currency: { contains: search, mode: 'insensitive' } },
          { cryptoTxHash: { contains: search, mode: 'insensitive' } },
          { cryptoNetwork: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.transaction.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { order: { select: { orderNumber: true } } } }),
      prisma.transaction.count({ where }),
    ]);
    return { data: Array.isArray(data) ? data : [], total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async getDeposits(filters: any) {
    const { page, limit, skip } = this.pagination(filters);
    const statuses = typeof filters?.status === 'string' ? filters.status.split(',').map((status: string) => status.trim()).filter(Boolean) : [];
    const where = statuses.length > 1 ? { status: { in: statuses as any } } : statuses.length === 1 ? { status: statuses[0] as any } : {};
    const [data, total] = await Promise.all([
      prisma.depositSession.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, email: true, profile: { select: { username: true, displayName: true } } } } } }),
      prisma.depositSession.count({ where }),
    ]);
    return { data: Array.isArray(data) ? data : [], total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async forceApproveDeposit(id: string, finalAmount: string, adminId: string) {
    const amount = Number(finalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw Object.assign(new Error('finalAmount must be a positive number'), { statusCode: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const deposit = await tx.depositSession.findUnique({
        where: { id },
        include: { user: { select: { id: true, email: true } } },
      });
      if (!deposit) {
        throw Object.assign(new Error('Deposit not found'), { statusCode: 404 });
      }
      if (!['PENDING', 'EXPIRED', 'CANCELLED'].includes(String(deposit.status))) {
        throw Object.assign(new Error('Invalid deposit status for force approval'), { statusCode: 409 });
      }

      const wallet = await tx.wallet.findUnique({
        where: { userId_currency: { userId: deposit.userId, currency: deposit.currency } },
      });
      if (!wallet) {
        throw Object.assign(new Error('User wallet not found'), { statusCode: 404 });
      }

      const updatedDeposit = await tx.depositSession.update({
        where: { id },
        data: { status: 'COMPLETED', amount, completedAt: new Date() },
      });
      await tx.cryptoDeposit.updateMany({
        where: { address: deposit.assignedAddress, network: deposit.network, status: 'PENDING' },
        data: { amount, status: 'SUCCESS' },
      });
      await tx.staticAddressPool.updateMany({
        where: { address: deposit.assignedAddress, status: 'BUSY' },
        data: { status: 'AVAILABLE', orderId: null, expiresAt: null },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { availableBalance: { increment: amount } },
      });
      const completedLedger = await tx.ledgerEntry.updateMany({
        where: {
          referenceId: deposit.id,
          walletId: wallet.id,
          type: 'DEPOSIT',
          status: 'PENDING',
        },
        data: {
          amount,
          status: 'COMPLETED',
          completedAt: new Date(),
          description: `Manually approved ${deposit.network} deposit`,
        },
      });
      if (completedLedger.count === 0) {
        await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            type: 'DEPOSIT',
            amount,
            currency: deposit.currency,
            direction: 'CREDIT',
            status: 'COMPLETED',
            referenceId: deposit.id,
            description: `Manually approved ${deposit.network} deposit`,
          },
        });
      }
      const notification = await NotificationService.createInTransaction(tx, {
        userId: deposit.userId,
        type: NotificationType.DEPOSIT_CONFIRMED,
        title: 'Deposit Approved Successfully',
        message: `Your deposit of ${amount} ${deposit.currency} has been manually approved and credited to your wallet balance.`,
        data: { depositSessionId: deposit.id, amount, currency: deposit.currency },
        link: '/dashboard/wallet',
      });

      return {
        updatedDeposit,
        notification,
        audit: {
          actorId: adminId,
          actorType: 'ADMIN',
          action: 'deposit.force_approve',
          entityType: 'DepositSession',
          entityId: id,
          before: { status: deposit.status, amount: deposit.amount.toString() },
          after: {
            status: updatedDeposit.status,
            amount: String(finalAmount),
            userId: deposit.userId,
            currency: deposit.currency,
          },
        },
      };
    });

    NotificationService.emit(result.notification);

    try {
      await prisma.auditLog.create({ data: result.audit });
    } catch (error) {
      const isForeignKeyViolation =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003';

      if (!isForeignKeyViolation) {
        console.error('Manual deposit approval committed, but audit logging failed.', error);
        return result.updatedDeposit;
      }

      try {
        await prisma.auditLog.create({
          data: {
            ...result.audit,
            actorId: null,
            actorType: 'SYSTEM',
            metadata: {
              auditFallback: true,
              originalActorId: adminId,
              reason: 'Audit foreign-key reference was unavailable',
            },
          },
        });
      } catch (fallbackError) {
        console.error(
          'Manual deposit approval committed, but both audit log writes failed.',
          fallbackError
        );
      }
    }

    return result.updatedDeposit;
  }
  static async getWithdrawals(filters: any) {
    const { page, limit, skip } = this.pagination(filters);
    const statuses = typeof filters?.status === 'string' ? filters.status.split(',').map((status: string) => status.trim()).filter(Boolean) : [];
    const where = statuses.length > 1 ? { status: { in: statuses as any } } : statuses.length === 1 ? { status: statuses[0] as any } : {};
    const [data, total] = await Promise.all([
      prisma.withdrawal.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { wallet: { select: { userId: true, currency: true } } } }),
      prisma.withdrawal.count({ where }),
    ]);
    return { data: Array.isArray(data) ? data : [], total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async approveWithdrawal(id: string, adminId: string) {
    // In real app, push to BULLMQ
    return prisma.withdrawal.update({ where: { id }, data: { status: 'PROCESSING' } });
  }
  static async rejectWithdrawal(id: string, adminId: string, reason: string) {
    const w = await prisma.withdrawal.findUnique({ where: { id } });
    if (!w) return;
    await prisma.$transaction(async (tx) => {
      await tx.withdrawal.update({ where: { id }, data: { status: 'CANCELLED', adminNote: reason } });
      await tx.wallet.update({ where: { id: w.walletId }, data: { availableBalance: { increment: w.amount } } });
    });
  }
  static async updateWithdrawalStatus(
    id: string,
    status: 'APPROVED' | 'REJECTED' | 'CANCELLED',
    adminId: string,
    txHash?: string,
    reason?: string,
  ) {
    if (status === 'APPROVED' && !txHash?.trim()) {
     throw Object.assign(new Error('txHash is required when approving a withdrawal'), { statusCode: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
     const withdrawal = await tx.withdrawal.findUnique({ where: { id } });
     if (!withdrawal) {
       throw Object.assign(new Error('Withdrawal not found'), { statusCode: 404 });
     }
     if (!['PENDING', 'UNDER_REVIEW', 'PROCESSING'].includes(withdrawal.status)) {
       throw Object.assign(new Error('Withdrawal is no longer actionable'), { statusCode: 409 });
     }

     if (status === 'APPROVED') {
       const updated = await tx.withdrawal.update({
         where: { id },
         data: {
           status: 'COMPLETED',
           cryptoTxHash: txHash!.trim(),
           reviewedBy: adminId,
           reviewedAt: new Date(),
           processedAt: new Date(),
         },
       });
       await tx.ledgerEntry.updateMany({
         where: { referenceId: id, type: 'WITHDRAWAL' },
         data: { status: 'COMPLETED', completedAt: new Date() },
       });
       return { withdrawal: updated, userId: (await tx.wallet.findUniqueOrThrow({ where: { id: withdrawal.walletId }, select: { userId: true } })).userId };
     }

     const updated = await tx.withdrawal.update({
       where: { id },
       data: {
         status: 'CANCELLED',
         adminNote: reason?.trim() || 'Rejected by administrator',
         reviewedBy: adminId,
         reviewedAt: new Date(),
       },
     });
     await tx.wallet.update({
       where: { id: withdrawal.walletId },
       data: { availableBalance: { increment: withdrawal.amount } },
     });
     await tx.ledgerEntry.updateMany({
       where: { referenceId: id, type: 'WITHDRAWAL' },
       data: { status: 'CANCELLED', completedAt: new Date() },
     });
     return { withdrawal: updated, userId: (await tx.wallet.findUniqueOrThrow({ where: { id: withdrawal.walletId }, select: { userId: true } })).userId };
    });

    await NotificationService.createNotification({
     userId: result.userId,
     type: status === 'APPROVED' ? NotificationType.WITHDRAWAL_PROCESSED : NotificationType.WITHDRAWAL_FAILED,
     title: status === 'APPROVED' ? 'Withdrawal Successful' : 'Withdrawal Rejected',
     message: status === 'APPROVED'
       ? `Your withdrawal request has been processed. TxHash: ${txHash!.trim()}`
       : 'Your withdrawal request was rejected, and the funds have been safely returned to your wallet balance.',
     data: { withdrawalId: id, ...(status === 'APPROVED' ? { txHash: txHash!.trim() } : {}) },
     link: '/dashboard/wallet',
    });
    return result.withdrawal;
  }

  // Disputes
  static async getAllDisputes(filters: any) {
    const { page, limit, skip } = this.pagination(filters);
    const statuses = typeof filters?.status === 'string' ? filters.status.split(',').map((status: string) => status.trim()).filter(Boolean) : [];
    const where = statuses.length > 1 ? { status: { in: statuses as any } } : statuses.length === 1 ? { status: statuses[0] as any } : {};
    const [data, total] = await Promise.all([
      prisma.dispute.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { order: { select: { orderNumber: true, totalAmount: true, currency: true, status: true } } } }),
      prisma.dispute.count({ where }),
    ]);
    return { data: Array.isArray(data) ? data : [], total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async getP2PDisputes(filters: any) {
    const { page, limit, skip } = this.pagination(filters);
    const rawStatus = filters?.status;
    const requestedStatuses: string[] = (Array.isArray(rawStatus) ? rawStatus : [rawStatus])
      .flatMap((value: unknown) => typeof value === 'string' ? value.split(',') : [])
      .map((value: string) => value.trim().toUpperCase())
      .filter((value: string) => value.length > 0);
    const supportedStatuses = new Set<P2PDisputeStatus>([
      P2PDisputeStatus.OPEN,
      P2PDisputeStatus.RESOLVED_BUYER,
      P2PDisputeStatus.RESOLVED_SELLER,
      P2PDisputeStatus.CLOSED,
    ]);
    const statusArray = [...new Set(requestedStatuses)].filter(
      (status): status is P2PDisputeStatus => supportedStatuses.has(status as P2PDisputeStatus)
    );
    if (requestedStatuses.length > 0 && statusArray.length === 0) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }
    const where: Prisma.P2PDisputeWhereInput = statusArray.length > 0
      ? { status: { in: statusArray } }
      : {};
    try {
      const [data, total] = await Promise.all([
        prisma.p2PDispute.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            reason: true,
            status: true,
            createdAt: true,
            order: { select: { id: true, amountUSD: true, cryptoAsset: true, paymentDeadline: true } },
          },
        }),
        prisma.p2PDispute.count({ where }),
      ]);
      return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    } catch (cause) {
      console.error('Admin P2P dispute list query failed', { where, page, limit, cause });
      throw Object.assign(new Error('Unable to load P2P disputes'), { statusCode: 503, cause });
    }
  }
  static async getP2PUserMetrics(userIds: string[]) {
    const ids = [...new Set(userIds.filter((id) => typeof id === 'string' && id.trim()))];
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const metrics = await Promise.all(ids.map(async (userId) => {
      const [user, recentOrders, recentCompletedOrders, completedOrders, allOrders, reviews] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { id: true, createdAt: true } }),
        prisma.p2POrder.count({ where: { sellerId: userId, createdAt: { gte: since } } }),
        prisma.p2POrder.count({ where: { sellerId: userId, status: 'COMPLETED', createdAt: { gte: since } } }),
        prisma.p2POrder.count({ where: { sellerId: userId, status: 'COMPLETED' } }),
        prisma.p2POrder.count({ where: { sellerId: userId } }),
        prisma.review.findMany({ where: { p2pOrderId: { not: null }, sellerId: userId, isVisible: true }, select: { rating: true } }),
      ]);
      const positiveRating = reviews.length ? (reviews.filter((review) => review.rating >= 4).length / reviews.length) * 100 : 0;
      return {
        userId,
        thirtyDayOrders: recentOrders,
        totalCompletedOrders: completedOrders,
        thirtyDayCompletionRate: recentOrders ? (recentCompletedOrders / recentOrders) * 100 : 0,
        positiveRating,
        accountAgeDays: user ? Math.max(0, Math.floor((Date.now() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000))) : 0,
        totalOrders: allOrders,
      };
    }));
    return metrics;
  }
  static async getDisputeDetails(id: string) {
    const standard = await prisma.dispute.findUnique({
      where: { id },
      include: {
        messages: true,
        evidence: true,
        timeline: true,
        order: { select: { orderNumber: true, conversation: { select: { id: true } } } },
      },
    });
    if (standard) return { ...standard, disputeType: 'STANDARD' as const };

    const p2p = await prisma.p2PDispute.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            conversation: { select: { id: true } },
          },
        },
      },
    });
    if (!p2p) return null;

    return {
      id: p2p.id,
      disputeNumber: `P2P-${p2p.id}`,
      orderId: p2p.p2pOrderId,
      buyerId: p2p.buyerId,
      sellerId: p2p.sellerId,
      reason: p2p.reason,
      description: p2p.description,
      status: p2p.status,
      resolution: p2p.resolution,
      resolvedBy: p2p.resolvedBy,
      resolvedAt: p2p.resolvedAt,
      createdAt: p2p.createdAt,
      updatedAt: p2p.updatedAt,
      messages: [],
      evidence: [],
      timeline: [],
      order: {
        orderNumber: p2p.order.id,
        conversation: p2p.order.conversation,
      },
      disputeType: 'P2P' as const,
    };
  }
  static async resolveForBuyer(id: string, adminId: string, resolution: string) {
    const standard = await prisma.dispute.findUnique({ where: { id }, select: { id: true } });
    if (standard) return DisputeService.adminResolveForBuyer(id, adminId, resolution);
    throw Object.assign(new Error('Standard dispute not found'), { statusCode: 404 });
  }
  static async resolveForSeller(id: string, adminId: string, resolution: string) {
    const standard = await prisma.dispute.findUnique({ where: { id }, select: { id: true } });
    if (standard) return DisputeService.adminResolveForSeller(id, adminId, resolution);
    throw Object.assign(new Error('Standard dispute not found'), { statusCode: 404 });
  }
  static async resolveP2PDispute(id: string, adminId: string, resolution: 'BUYER' | 'SELLER', note: string) {
    return P2POrderService.resolveDispute(id, adminId, resolution, note);
  }

  static async broadcastNotification(adminId: string, data: {
    title: string; message: string; type?: string; link?: string; userIds?: string[];
  }) {
    const result = await NotificationService.broadcast({
      title: data.title.trim(),
      message: data.message.trim(),
      type: data.type || 'ADMIN_BROADCAST',
      link: data.link,
      userIds: data.userIds,
    });
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorType: 'ADMIN',
        action: 'notification.broadcast',
        entityType: 'Notification',
        metadata: { ...data, sent: result.sent },
      },
    });
    return result;
  }

  // Reports
  static async getReports(filters: any) {
    const { page, limit, skip } = this.pagination(filters);
    const search = typeof filters?.search === 'string' ? filters.search.trim().slice(0, 120) : '';
    const reportStatus = typeof filters?.status === 'string'
      ? Object.values(ReportStatus).find((status) => status === filters.status)
      : undefined;
    const where: Prisma.ReportWhereInput = {
      ...(reportStatus ? { status: reportStatus } : {}),
      ...(search ? {
        OR: [
          { id: { contains: search, mode: 'insensitive' } },
          { reporterID: { contains: search, mode: 'insensitive' } },
          { reportedUserId: { contains: search, mode: 'insensitive' } },
          { targetId: { contains: search, mode: 'insensitive' } },
          { reason: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.report.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.report.count({ where }),
    ]);
    return { data: Array.isArray(data) ? data : [], total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  static async resolveReport(id: string, adminId: string, resolution: string) { return ReportService.resolveReport(id, adminId, resolution); }
  static async dismissReport(id: string, adminId: string) { return ReportService.dismissReport(id, adminId); }

  static async getOrders(filters: any) {
    const { page, limit, skip } = this.pagination(filters);
    const search = typeof filters?.search === 'string' ? filters.search.trim().slice(0, 120) : '';
    const activeStatuses = ['CREATED', 'PAYMENT_PENDING', 'PENDING_MANUAL_REVIEW', 'PAID', 'DELIVERED', 'WAITING_BUYER_CONFIRMATION', 'DISPUTE_OPEN', 'DISPUTED_WAITING_SELLER', 'DISPUTED_WAITING_BUYER', 'ESCALATED_TO_ADMIN'];
    const statusFilter = filters?.active === 'true'
      ? { status: { in: activeStatuses as any } }
      : filters?.status ? { status: filters.status } : {};
    const where: Prisma.OrderWhereInput = search
      ? {
          ...statusFilter,
          OR: [
            { id: { contains: search, mode: 'insensitive' } },
            { orderNumber: { contains: search, mode: 'insensitive' } },
            { buyerId: { contains: search, mode: 'insensitive' } },
            { sellerId: { contains: search, mode: 'insensitive' } },
            { product: { is: { name: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : statusFilter;
    const [data, total] = await Promise.all([
      prisma.order.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { product: { select: { name: true } }, conversation: { select: { id: true } } } }),
      prisma.order.count({ where }),
    ]);
    return { data: Array.isArray(data) ? data : [], total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async getFraudFlags(filters: any) {
    const { page, limit, skip } = this.pagination(filters);
    const search = typeof filters?.search === 'string' ? filters.search.trim().slice(0, 120) : '';
    const fraudType = Object.values(FraudFlagType).find((type) => type.toLowerCase() === search.toLowerCase());
    const where: Prisma.FraudFlagWhereInput = {
      ...(filters?.resolved === 'true' ? { isResolved: true } : filters?.resolved === 'false' ? { isResolved: false } : {}),
      ...(search ? {
        OR: [
          { id: { contains: search, mode: 'insensitive' } },
          { userId: { contains: search, mode: 'insensitive' } },
          { orderId: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          ...(fraudType ? [{ type: fraudType }] : []),
        ],
      } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.fraudFlag.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: { user: { select: { email: true } } } }),
      prisma.fraudFlag.count({ where }),
    ]);
    return { data: Array.isArray(data) ? data : [], total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async resolveFraudFlag(id: string, adminId: string) {
    return prisma.$transaction(async (tx) => {
      const flag = await tx.fraudFlag.findUnique({ where: { id } });
      if (!flag) throw Object.assign(new Error('Fraud alert not found'), { statusCode: 404 });
      if (flag.isResolved) return flag;

      const result = await tx.fraudFlag.updateMany({
        where: { id, isResolved: false },
        data: { isResolved: true, resolvedBy: adminId, resolvedAt: new Date() },
      });
      const updated = await tx.fraudFlag.findUnique({ where: { id } });
      if (!updated) throw Object.assign(new Error('Fraud alert not found'), { statusCode: 404 });
      if (result.count > 0) {
        await tx.auditLog.create({
          data: {
            actorId: adminId,
            actorType: 'ADMIN',
            action: 'fraud_flag.resolve',
            entityType: 'FraudFlag',
            entityId: id,
            before: { isResolved: false },
            after: { isResolved: true },
          },
        });
      }
      return updated;
    });
  }

  static async getAuditLogs(filters: any) {
    const { page, limit, skip } = this.pagination(filters);
    const search = typeof filters?.search === 'string' ? filters.search.trim().slice(0, 120) : '';
    const where: Prisma.AuditLogWhereInput = search ? {
      OR: [
        { id: { contains: search, mode: 'insensitive' } },
        { actorId: { contains: search, mode: 'insensitive' } },
        { actorType: { contains: search, mode: 'insensitive' } },
        { action: { contains: search, mode: 'insensitive' } },
        { entityType: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search, mode: 'insensitive' } },
        { userAgent: { contains: search, mode: 'insensitive' } },
      ],
    } : {};
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count({ where }),
    ]);
    return { data: Array.isArray(data) ? data : [], total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async moderateReport(id: string, adminId: string, action: 'SUSPEND' | 'WARN', reason?: string) {
    return prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({ where: { id }, select: { id: true, targetType: true, targetId: true, reportedUserId: true } });
      if (!report) throw Object.assign(new Error('Report not found'), { statusCode: 404 });
      if (!['BUYER', 'SELLER'].includes(report.targetType) || !report.reportedUserId) {
        throw Object.assign(new Error('This report does not target a user account'), { statusCode: 400 });
      }

      const targetUserId = report.reportedUserId;
      if (action === 'SUSPEND') {
        const seller = await tx.seller.findUnique({ where: { userId: targetUserId }, select: { id: true } });
        await tx.user.update({ where: { id: targetUserId }, data: { status: 'SUSPENDED' } });
        await tx.session.updateMany({ where: { userId: targetUserId }, data: { isRevoked: true } });
        if (seller) await tx.product.updateMany({ where: { sellerId: seller.id, status: 'ACTIVE' }, data: { status: 'HIDDEN' } });
      }

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          actorType: 'ADMIN',
          action: action === 'SUSPEND' ? 'report.user_suspend' : 'report.user_warn',
          entityType: 'User',
          entityId: targetUserId,
          metadata: { reportId: id, reason: reason || (action === 'SUSPEND' ? 'Suspended after admin report review' : 'Warned after admin report review') },
        },
      });
      return tx.report.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          reviewedBy: adminId,
          reviewedAt: new Date(),
          resolution: action === 'SUSPEND' ? 'User suspended' : 'User warned',
        },
      });
    });
  }

  static async getSettings() {
    const defaults: Array<{ key: string; value: string; type: 'STRING' | 'NUMBER' | 'BOOLEAN'; group: string; description: string }> = [
      { key: 'site_name', value: BRAND_NAME, type: 'STRING', group: 'branding', description: 'Global site name displayed in the header and browser title.' },
      { key: 'site_logo_url', value: '/favicon.svg', type: 'STRING', group: 'branding', description: 'Global platform logo URL.' },
      { key: 'site_description', value: 'Buy and sell gift cards instantly with crypto.', type: 'STRING', group: 'branding', description: 'Global metadata description.' },
      { key: 'site_keywords', value: 'gift cards, crypto marketplace', type: 'STRING', group: 'branding', description: 'Global metadata keywords.' },
      { key: 'maintenance_mode', value: 'false', type: 'BOOLEAN', group: 'operations', description: 'Place public customer flows into maintenance mode.' },
      { key: 'maintenance_message', value: 'The platform is temporarily undergoing maintenance.', type: 'STRING', group: 'operations', description: 'Message shown while maintenance mode is enabled.' },
      { key: 'platform_fee_percent', value: '2.5', type: 'NUMBER', group: 'finance', description: 'Marketplace platform fee percentage.' },
      { key: 'withdrawal_fee_percent', value: '1', type: 'NUMBER', group: 'finance', description: 'Withdrawal fee percentage.' },
      { key: 'withdrawal_fee_fixed', value: '0', type: 'NUMBER', group: 'finance', description: 'Fixed withdrawal fee in the asset denomination.' },
      { key: 'order_payment_timeout_hours', value: '24', type: 'NUMBER', group: 'operations', description: 'Payment window for regular orders.' },
      { key: 'seller_response_period_hours', value: '48', type: 'NUMBER', group: 'operations', description: 'Seller response SLA in hours.' },
      { key: 'seller_fast_launch_enabled', value: 'false', type: 'BOOLEAN', group: 'operations', description: 'Allow new seller applicants to skip KYC document submission and receive instant seller approval without identity verification.' },
      { key: 'referral_bonuses_enabled', value: 'true', type: 'BOOLEAN', group: 'referrals', description: 'Enable or disable new referral bonus accruals. Existing commissions are not reversed.' },
      { key: 'referral_commission_rate_percent', value: '1', type: 'NUMBER', group: 'referrals', description: 'Referral commission percentage of the completed order amount.' },
      { key: 'referral_platform_fee_cap_percent', value: '20', type: 'NUMBER', group: 'referrals', description: 'Maximum referral commission as a percentage of the platform fee.' },
    ];
    await prisma.$transaction(defaults.map((setting) => prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: setting,
      update: setting.key === 'site_name' ? { value: BRAND_NAME } : {},
    })));
    return prisma.systemSetting.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
  }

  static async updateSettings(adminId: string, settings: Record<string, unknown>) {
    const allowedKeys = new Set([
      'site_logo_url',
      'site_description',
      'site_keywords',
      'maintenance_mode',
      'maintenance_message',
      'platform_fee_percent',
      'withdrawal_fee_percent',
      'withdrawal_fee_fixed',
      'order_payment_timeout_hours',
      'seller_response_period_hours',
      'seller_fast_launch_enabled',
      'referral_bonuses_enabled',
      'referral_commission_rate_percent',
      'referral_platform_fee_cap_percent',
    ]);
    const entries = Object.entries(settings);
    const unsupported = entries.map(([key]) => key).filter((key) => !allowedKeys.has(key));
    if (unsupported.length > 0) {
      throw Object.assign(new Error(`Unsupported settings: ${unsupported.join(', ')}`), { statusCode: 400 });
    }
    const normalizedEntries = entries.map(([key, value]) => {
      if (key === 'referral_bonuses_enabled' || key === 'seller_fast_launch_enabled') {
        if (value !== true && value !== false && value !== 'true' && value !== 'false') {
          throw Object.assign(new Error(`${key} must be true or false`), { statusCode: 400 });
        }
        return [key, value === true || value === 'true'] as const;
      }
      if (key === 'referral_commission_rate_percent' || key === 'referral_platform_fee_cap_percent') {
        const numberValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
        if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 100) {
          throw Object.assign(new Error(`${key} must be a number from 0 to 100`), { statusCode: 400 });
        }
        return [key, numberValue] as const;
      }
      return [key, value] as const;
    });
    await prisma.$transaction(async (tx) => {
      for (const [key, value] of normalizedEntries) {
        const referralSetting = key.startsWith('referral_');
        const type = key === 'referral_bonuses_enabled' || key === 'seller_fast_launch_enabled'
          ? 'BOOLEAN'
          : referralSetting ? 'NUMBER' : undefined;
        const settingValue = typeof value === 'string' ? value : JSON.stringify(value);
        await tx.systemSetting.upsert({
          where: { key },
          create: { key, value: settingValue, type: type ?? (typeof value === 'boolean' ? 'BOOLEAN' : typeof value === 'number' ? 'NUMBER' : 'STRING'), group: referralSetting ? 'referrals' : key === 'seller_fast_launch_enabled' ? 'operations' : undefined, updatedBy: adminId },
          update: { value: settingValue, ...(type ? { type } : {}), ...(referralSetting ? { group: 'referrals' } : key === 'seller_fast_launch_enabled' ? { group: 'operations' } : {}), updatedBy: adminId },
        });
      }

      const auditActor = await tx.user.findUnique({
        where: { id: adminId },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: auditActor?.id ?? null,
          actorType: 'ADMIN',
          action: 'system.settings.update',
          entityType: 'SystemSetting',
          metadata: {
            keys: normalizedEntries.map(([key]) => key),
            originalActorId: adminId,
            ...(!auditActor ? { auditActorUnavailable: true } : {}),
          },
        },
      });
    });
    await Promise.all(normalizedEntries.map(([key]) => SystemSettingsService.invalidate(key)));
    return this.getSettings();
  }

  // Stats
  static async getDashboardStats() {
    const [totalUsers, totalProducts, totalOrders, totalSellers, pendingKyc, openDisputes, pendingDeposits, pendingWithdrawals, transactionAggregate] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.order.count(),
      prisma.seller.count(),
      prisma.kycRequest.count({ where: { status: { in: ['PENDING_ADMIN_REVIEW', 'PENDING_MANUAL_REVIEW', 'PENDING'] as any } } }),
      prisma.dispute.count({ where: { status: { in: ['OPEN', 'AWAITING_SELLER', 'AWAITING_BUYER', 'ESCALATED'] } } }),
      prisma.depositSession.count({ where: { status: 'PENDING' } }),
      prisma.withdrawal.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW', 'PROCESSING'] } } }),
      prisma.transaction.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { status: 'COMPLETED' } }),
    ]);
    return {
      totalUsers, totalProducts, totalOrders, totalSellers, pendingKyc, openDisputes, pendingDeposits, pendingWithdrawals,
      completedTransactionCount: transactionAggregate._count._all,
      completedTransactionTotal: transactionAggregate._sum.amount ?? 0,
    };
  }
}
