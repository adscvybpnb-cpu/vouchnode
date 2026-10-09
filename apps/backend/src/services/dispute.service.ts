import { prisma } from '../lib/prisma';
import { DisputeRepository } from '../repositories/dispute.repository';
import { transition } from '../state-machines/order.state-machine';
import { NotificationService } from './notification.service';
import { buyerConfirmationQueue, cancelJob, disputeTimerQueue, escrowReleaseQueue, scheduleDisputeTimer } from '../jobs/queue';
import { WalletRepository } from '../repositories/wallet.repository';
import { logger } from '../lib/logger';
import { OrderService } from './order.service';
import { ReferralService } from './referral.service';

export class DisputeService {
  static async escalateDispute(orderId: string, buyerId: string, reason: string, description: string, evidence?: { fileUrl: string; fileName: string; fileType: string; fileSize: number }) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { transaction: true } });
    if (!order) throw new Error('Order not found');
    if (order.buyerId !== buyerId) throw new Error('Unauthorized');
    if (order.status === 'DISPUTED_WAITING_BUYER') {
      const escalated = await prisma.$transaction(async (tx) => {
        const current = await tx.order.findUnique({ where: { id: orderId } });
        if (!current || current.status !== 'DISPUTED_WAITING_BUYER' || current.isEscalated) throw new Error('Dispute is not awaiting buyer escalation');
        await transition(current, 'ESCALATED_TO_ADMIN', tx, buyerId, 'USER', 'Buyer escalated dispute to admin');
        await tx.order.update({
          where: { id: orderId },
          data: { isEscalated: true, sellerResponseDeadline: null, buyerReviewDeadline: null },
        });
        const dispute = await tx.dispute.findUnique({ where: { orderId } });
        if (!dispute) throw new Error('Dispute not found');
        return tx.dispute.update({ where: { id: dispute.id }, data: { status: 'ESCALATED', escalatedAt: new Date() } });
      });
      return escalated;
    }
    if (order.status !== 'WAITING_BUYER_CONFIRMATION' && order.status !== 'PAID') throw new Error('Cannot dispute this order');

    const dispute = await prisma.$transaction(async (tx) => {
      await transition(order, 'DISPUTE_OPEN', tx, buyerId, 'USER', 'Buyer opened dispute');
      const sellerResponseDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await tx.order.update({
        where: { id: orderId },
        data: { sellerResponseDeadline, buyerReviewDeadline: null, sellerTimerJobId: null, buyerConfirmationDeadline: null, buyerTimerJobId: null, isEscalated: false },
      });
      if (order.transaction) {
        await tx.transaction.updateMany({
          where: { id: order.transaction.id, escrowReleaseAt: { not: null } },
          data: { escrowReleaseAt: null },
        });
      }

      const count = await tx.dispute.count();
      const disputeNumber = `DSP-${new Date().toISOString().slice(0,7).replace('-','')}-${String(count + 1).padStart(4, '0')}`;

      const dispute = await DisputeRepository.create({
        disputeNumber,
        orderId,
        buyerId,
        sellerId: order.sellerId,
        reason,
        description,
        frozenAmount: order.totalAmount,
        sellerResponseDeadline,
        status: 'AWAITING_SELLER'
      }, tx);
      if (evidence) {
        await tx.disputeEvidence.create({
          data: { disputeId: dispute.id, uploadedBy: buyerId, ...evidence }
        });
      }

      await tx.disputeTimeline.create({
        data: { disputeId: dispute.id, action: 'CREATED', actorType: 'USER', actorId: buyerId, description: 'Buyer opened dispute' }
      });

      return dispute;
    });
    if (order.transaction?.escrowReleaseAt) {
      try {
        await cancelJob(escrowReleaseQueue, `escrow-release-${order.transaction.id}`);
      } catch (error) {
        logger.error({ orderId, transactionId: order.transaction.id, error: error instanceof Error ? error.message : String(error) }, 'Unable to cancel escrow release job after dispute opened; persisted transaction state prevents release');
      }
    }
    try {
      const timerJob = await Promise.race([
        scheduleDisputeTimer(orderId, 48 * 60 * 60 * 1000),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Dispute timer queue unavailable')), 1500)),
      ]);
      await prisma.order.update({ where: { id: orderId }, data: { sellerTimerJobId: timerJob.id } });
    } catch (error) {
      console.error('Dispute timer queue unavailable; deadline scanner remains authoritative', error);
    }
    const notificationResults = await Promise.allSettled([
      NotificationService.createNotification({
        userId: order.sellerId, type: 'DISPUTE_OPENED', title: 'Dispute opened',
        message: `A dispute was opened for order ${order.orderNumber || orderId}.`,
        data: { disputeId: dispute.id, orderId }, link: `/seller/disputes/${dispute.id}`,
      }),
      NotificationService.createNotification({
        userId: buyerId, type: 'DISPUTE_OPENED', title: 'Dispute submitted',
        message: 'Your dispute has been submitted for review.',
        data: { disputeId: dispute.id, orderId }, link: `/dashboard/orders/${orderId}`,
      }),
    ]);
    notificationResults.forEach((result) => {
      if (result.status === 'rejected') {
        logger.error({ orderId, disputeId: dispute.id, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }, 'Unable to create dispute notification');
      }
    });
    return dispute;
  }

  static async respondToDispute(orderId: string, sellerId: string, description: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.sellerId !== sellerId) throw new Error('Unauthorized');
    if (!['DISPUTE_OPEN', 'DISPUTED_WAITING_SELLER'].includes(order.status) || order.isEscalated) throw new Error('Dispute is not awaiting seller response');
    const buyerReviewDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({ where: { id: orderId } });
      if (!current || !['DISPUTE_OPEN', 'DISPUTED_WAITING_SELLER'].includes(current.status) || current.isEscalated) throw new Error('Dispute is no longer awaiting seller response');
      await transition(current, 'DISPUTED_WAITING_BUYER', tx, sellerId, 'USER', 'Seller responded to dispute');
      await tx.order.update({
        where: { id: orderId },
        data: { sellerResponseDeadline: null, buyerReviewDeadline, buyerTimerJobId: null, sellerTimerJobId: null },
      });
      const dispute = await tx.dispute.findUnique({ where: { orderId } });
      if (!dispute) throw new Error('Dispute not found');
      await tx.dispute.update({ where: { id: dispute.id }, data: { status: 'AWAITING_BUYER', buyerResponseDeadline: buyerReviewDeadline } });
      await tx.disputeTimeline.create({
        data: { disputeId: dispute.id, action: 'SELLER_RESPONDED', actorType: 'USER', actorId: sellerId, description },
      });
      return {
        dispute: await tx.dispute.findUniqueOrThrow({ where: { id: dispute.id } }),
        sellerTimerJobId: current.sellerTimerJobId,
      };
    });
    if (result.sellerTimerJobId) {
      try {
        await Promise.race([
          cancelJob(disputeTimerQueue, result.sellerTimerJobId),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Dispute timer cancellation unavailable')), 1500)),
        ]);
      } catch (error) {
        console.error('Unable to cancel seller dispute timer; persisted order state remains authoritative', error);
      }
    }
    try {
      const timerJob = await Promise.race([
        scheduleDisputeTimer(orderId, 48 * 60 * 60 * 1000),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Dispute timer queue unavailable')), 1500)),
      ]);
      await prisma.order.update({ where: { id: orderId }, data: { buyerTimerJobId: timerJob.id } });
    } catch (error) {
      console.error('Buyer dispute timer queue unavailable; deadline scanner remains authoritative', error);
    }
    return result.dispute;
  }

  static async handleSellerMessage(orderId: string, sellerId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.sellerId !== sellerId || order.status !== 'DISPUTE_OPEN' || order.isEscalated) return false;
    await this.respondToDispute(orderId, sellerId, 'Seller responded in the dispute chat');
    return true;
  }

  static async updateStatus(disputeId: string, userId: string, status: 'AWAITING_SELLER' | 'AWAITING_BUYER' | 'CLOSED') {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new Error('Dispute not found');
    if (dispute.buyerId !== userId && dispute.sellerId !== userId) throw new Error('Unauthorized');
    if (['RESOLVED_BUYER', 'RESOLVED_SELLER', 'CLOSED'].includes(dispute.status)) throw new Error('Dispute is already resolved');
    if (status === 'CLOSED' && dispute.buyerId !== userId) throw new Error('Only the buyer can cancel a dispute');
    if (status === 'AWAITING_SELLER' && dispute.sellerId !== userId) throw new Error('Only the seller can update this status');
    if (status === 'AWAITING_BUYER' && dispute.buyerId !== userId) throw new Error('Only the buyer can update this status');

    const result = await prisma.$transaction(async (tx) => {
      let timerIds: { sellerTimerJobId: string | null; buyerTimerJobId: string | null } | undefined;
      if (status === 'CLOSED') {
        const order = await tx.order.findUnique({ where: { id: dispute.orderId } });
        if (!order || !['DISPUTE_OPEN', 'DISPUTED_WAITING_SELLER', 'DISPUTED_WAITING_BUYER'].includes(order.status)) {
          throw new Error('Dispute can no longer be cancelled');
        }
        await transition(order, 'WAITING_BUYER_CONFIRMATION', tx, userId, 'USER', 'Buyer cancelled the dispute');
        await tx.order.update({
          where: { id: order.id },
          data: {
            isEscalated: false,
            sellerResponseDeadline: null,
            buyerReviewDeadline: null,
            sellerTimerJobId: null,
            buyerTimerJobId: null,
          },
        });
        timerIds = { sellerTimerJobId: order.sellerTimerJobId, buyerTimerJobId: order.buyerTimerJobId };
      }
      const updated = await tx.dispute.update({ where: { id: disputeId }, data: { status } });
      await tx.disputeTimeline.create({
        data: { disputeId, action: 'STATUS_UPDATED', actorType: 'USER', actorId: userId, description: status === 'CLOSED' ? 'Buyer cancelled the dispute' : `Status changed to ${status}` }
      });
      return { dispute: updated, timerIds };
    });
    if (result.timerIds) {
      const cancellations = [
        result.timerIds.sellerTimerJobId ? cancelJob(disputeTimerQueue, result.timerIds.sellerTimerJobId) : Promise.resolve(),
        result.timerIds.buyerTimerJobId ? cancelJob(buyerConfirmationQueue, result.timerIds.buyerTimerJobId) : Promise.resolve(),
      ];
      const cancellationResults = await Promise.allSettled(cancellations);
      cancellationResults.forEach((cancellation) => {
        if (cancellation.status === 'rejected') {
          logger.error({ disputeId, error: cancellation.reason instanceof Error ? cancellation.reason.message : String(cancellation.reason) }, 'Unable to cancel a timer after dispute cancellation; persisted order state remains authoritative');
        }
      });
    }
    const recipientId = dispute.buyerId === userId ? dispute.sellerId : dispute.buyerId;
    await NotificationService.createNotification({
      userId: recipientId, type: 'DISPUTE_UPDATE', title: 'Dispute updated',
      message: `Dispute status changed to ${status.replaceAll('_', ' ').toLowerCase()}.`,
      data: { disputeId }, link: `/dashboard/disputes/${disputeId}`,
    }).catch((error: unknown) => {
      logger.error({ disputeId, error: error instanceof Error ? error.message : String(error) }, 'Unable to create dispute status notification');
    });
    return result.dispute;
  }

  static async adminResolveForBuyer(disputeId: string, adminId: string, resolution: string) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId }, include: { order: true } });
    if (!dispute || ['CLOSED', 'RESOLVED_BUYER', 'RESOLVED_SELLER'].includes(dispute.status)) {
      throw new Error('Dispute unavailable');
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: disputeId },
        data: { status: 'RESOLVED_BUYER', resolution, resolutionType: 'REFUND_BUYER', resolvedBy: adminId, resolvedAt: new Date() }
      });
      await tx.order.update({ where: { id: dispute.orderId }, data: { isEscalated: false, sellerResponseDeadline: null, buyerReviewDeadline: null, cancelledAt: new Date() } });
      const transaction = await tx.transaction.findUnique({ where: { orderId: dispute.orderId } });
      if (transaction) {
        const paymentMethod = transaction.metadata && typeof transaction.metadata === 'object'
          ? (transaction.metadata as { paymentMethod?: string }).paymentMethod
          : undefined;
        if (paymentMethod === 'DIRECT_INVOICE') await OrderService.ensureDirectInvoiceEscrow(tx, dispute.orderId);
        const escrowAmount = paymentMethod === 'DIRECT_INVOICE' ? dispute.order.sellerAmount : transaction.amount;
        const sellerWallet = await WalletRepository.getOrCreate(transaction.sellerId, transaction.currency, tx);
        const buyerWallet = await WalletRepository.getOrCreate(transaction.buyerId, transaction.currency, tx);
        const released = await tx.wallet.updateMany({
          where: { id: sellerWallet.id, pendingBalance: { gte: escrowAmount } },
          data: { pendingBalance: { decrement: escrowAmount } }
        });
        if (released.count !== 1) throw Object.assign(new Error('Escrow balance is unavailable for this dispute'), { statusCode: 409 });
        await WalletRepository.addToAvailable(tx, buyerWallet.id, escrowAmount, transaction.currency);
        await tx.ledgerEntry.updateMany({ where: { transactionId: transaction.id, type: 'SALE', status: 'PENDING' }, data: { status: 'CANCELLED', completedAt: new Date() } });
        await tx.ledgerEntry.create({ data: { transactionId: transaction.id, walletId: buyerWallet.id, type: 'REFUND', amount: escrowAmount, currency: transaction.currency, direction: 'CREDIT', status: 'COMPLETED', referenceId: dispute.orderId, description: 'Admin-approved dispute refund' } });
        await tx.transaction.update({ where: { id: transaction.id }, data: { status: 'REFUNDED', escrowReleaseAt: null } });
      }
      
      await tx.auditLog.create({
        data: {
          actorId: (await tx.user.findUnique({ where: { id: adminId }, select: { id: true } }))?.id ?? null,
          actorType: 'ADMIN',
          action: 'dispute.resolve_buyer',
          entityType: 'Dispute',
          entityId: disputeId
        }
      });
      await tx.order.update({ where: { id: dispute.orderId }, data: { status: 'REFUNDED' } });
    });
    await Promise.all([
      NotificationService.createNotification({
        userId: dispute.buyerId, type: 'DISPUTE_RESOLVED', title: 'DISPUTE RESOLVED IN YOUR FAVOR',
        message: `The dispute for order #${dispute.orderId} has been resolved in your favor. Funds have been refunded to your wallet.`,
        data: { disputeId, orderId: dispute.orderId }, link: `/dashboard/orders/${dispute.orderId}`,
      }),
      NotificationService.createNotification({
        userId: dispute.sellerId, type: 'DISPUTE_RESOLVED', title: 'DISPUTE RESOLVED (FAVOR OF BUYER)',
        message: `The dispute for order #${dispute.orderId} was closed in favor of the buyer by administration.`,
        data: { disputeId, orderId: dispute.orderId }, link: `/seller/disputes/${disputeId}`,
      }),
    ]);
    return result;
  }

  static async adminResolveForSeller(disputeId: string, adminId: string, resolution: string) {
    const dispute = await prisma.dispute.findUnique({ where: { id: disputeId }, include: { order: true } });
    if (!dispute || ['CLOSED', 'RESOLVED_BUYER', 'RESOLVED_SELLER'].includes(dispute.status)) {
      throw new Error('Dispute unavailable');
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: disputeId },
        data: { status: 'RESOLVED_SELLER', resolution, resolutionType: 'RELEASE_SELLER', resolvedBy: adminId, resolvedAt: new Date() }
      });
      await tx.order.update({ where: { id: dispute.orderId }, data: { isEscalated: false, sellerResponseDeadline: null, buyerReviewDeadline: null, completedAt: new Date() } });
      const transaction = await tx.transaction.findUnique({ where: { orderId: dispute.orderId } });
      if (transaction) {
        const paymentMethod = transaction.metadata && typeof transaction.metadata === 'object'
          ? (transaction.metadata as { paymentMethod?: string }).paymentMethod
          : undefined;
        if (paymentMethod === 'DIRECT_INVOICE') await OrderService.ensureDirectInvoiceEscrow(tx, dispute.orderId);
        const escrowAmount = paymentMethod === 'DIRECT_INVOICE' ? dispute.order.sellerAmount : transaction.amount;
        const sellerWallet = await WalletRepository.getOrCreate(transaction.sellerId, transaction.currency, tx);
        const released = await tx.wallet.updateMany({
          where: { id: sellerWallet.id, pendingBalance: { gte: escrowAmount } },
          data: {
            pendingBalance: { decrement: escrowAmount },
            availableBalance: { increment: escrowAmount }
          }
        });
        if (released.count !== 1) throw Object.assign(new Error('Escrow balance is unavailable for this dispute'), { statusCode: 409 });
        await tx.ledgerEntry.updateMany({ where: { transactionId: transaction.id, type: 'SALE', status: 'PENDING' }, data: { status: 'COMPLETED', completedAt: new Date() } });
        await tx.ledgerEntry.create({ data: { transactionId: transaction.id, walletId: sellerWallet.id, type: 'ESCROW_RELEASE', amount: escrowAmount, currency: transaction.currency, direction: 'CREDIT', status: 'COMPLETED', referenceId: dispute.orderId, description: 'Admin-approved escrow release' } });
        await tx.transaction.update({ where: { id: transaction.id }, data: { status: 'COMPLETED', escrowReleaseAt: null } });
      }
      
      await tx.auditLog.create({
        data: {
          actorId: (await tx.user.findUnique({ where: { id: adminId }, select: { id: true } }))?.id ?? null,
          actorType: 'ADMIN',
          action: 'dispute.resolve_seller',
          entityType: 'Dispute',
          entityId: disputeId
        }
      });
      await tx.order.update({ where: { id: dispute.orderId }, data: { status: 'COMPLETED' } });
      await ReferralService.creditCompletedOrder(tx, dispute.order);
    });
    await Promise.all([
      NotificationService.createNotification({
        userId: dispute.sellerId, type: 'DISPUTE_RESOLVED', title: 'DISPUTE RESOLVED IN YOUR FAVOR',
        message: `The dispute for order #${dispute.orderId} has been resolved in your favor. Escrow funds have been released to your wallet.`,
        data: { disputeId, orderId: dispute.orderId }, link: `/seller/disputes/${disputeId}`,
      }),
      NotificationService.createNotification({
        userId: dispute.buyerId, type: 'DISPUTE_RESOLVED', title: 'DISPUTE RESOLVED (FAVOR OF SELLER)',
        message: `The dispute for order #${dispute.orderId} was closed in favor of the seller by administration.`,
        data: { disputeId, orderId: dispute.orderId }, link: `/dashboard/orders/${dispute.orderId}`,
      }),
    ]);
    return result;
  }
}
