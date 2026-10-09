import { prisma } from '../lib/prisma';
import { NotificationService } from './notification.service';
import { UserRole } from '@vouchnode/shared';
import { config } from '../config';
import { scheduleKycVerification } from '../jobs/queue';

export interface KycDocumentUrls {
  frontUrl: string;
  backUrl: string;
  selfieUrl: string;
  frontKey?: string;
  backKey?: string;
  selfieKey?: string;
}

export interface KycAnalysis {
  documentValid: boolean;
  documentType: 'NATIONAL_ID' | 'PASSPORT' | 'DRIVERS_LICENSE' | 'UNKNOWN';
  fullName?: string;
  documentNumber?: string;
  livenessPassed: boolean;
  faceMatchScore: number;
  ocrReadable: boolean;
  passed: boolean;
}

export class KycService {
  static async analyzeKYCDocuments(frontUrl: string, backUrl: string, selfieUrl: string): Promise<KycAnalysis> {
    if (!config.kyc.verificationUrl) throw new Error('KYC verification provider URL is not configured');
    if (!config.kyc.apiKey) throw new Error('KYC verification provider API key is not configured');
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    headers.authorization = `Bearer ${config.kyc.apiKey}`;
    const response = await fetch(config.kyc.verificationUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ frontUrl, backUrl, selfieUrl }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`KYC provider returned HTTP ${response.status}`);
    const result = await response.json() as Partial<KycAnalysis>;
    const faceMatchScore = Number(result.faceMatchScore);
    const passed = result.documentValid === true &&
      result.ocrReadable === true &&
      result.livenessPassed === true &&
      ['NATIONAL_ID', 'PASSPORT', 'DRIVERS_LICENSE'].includes(result.documentType || '') &&
      Number.isFinite(faceMatchScore) && faceMatchScore >= 85 &&
      typeof result.fullName === 'string' && result.fullName.trim().length >= 3 &&
      typeof result.documentNumber === 'string' && result.documentNumber.trim().length >= 5;
    return {
      documentValid: result.documentValid === true,
      documentType: result.documentType || 'UNKNOWN',
      fullName: result.fullName,
      documentNumber: result.documentNumber,
      livenessPassed: result.livenessPassed === true,
      faceMatchScore: Number.isFinite(faceMatchScore) ? faceMatchScore : 0,
      ocrReadable: result.ocrReadable === true,
      passed,
    };
  }

  static async submitDocuments(userId: string, documents: KycDocumentUrls, metadata?: {
    fullName?: string;
    dateOfBirth?: Date;
    address?: string;
    documentType?: 'IDENTITY_CARD' | 'PASSPORT' | 'DRIVERS_LICENSE';
  }) {
    const requestData = {
      status: 'PENDING_ADMIN_REVIEW' as const,
      fullName: metadata?.fullName,
      dateOfBirth: metadata?.dateOfBirth,
      address: metadata?.address,
      documentType: metadata?.documentType,
      frontDocumentUrl: documents.frontUrl,
      backDocumentUrl: documents.backUrl,
      selfieUrl: documents.selfieUrl,
      idCardFront: documents.frontUrl,
      idCardBack: documents.backUrl,
      selfiePhoto: documents.selfieUrl,
      frontDocumentKey: documents.frontKey,
      backDocumentKey: documents.backKey,
      selfieKey: documents.selfieKey,
      processedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
    };
    const request = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { kycStatus: true },
      });
      if (user?.kycStatus === 'APPROVED' || user?.kycStatus === 'AUTOMATED_VERIFIED') {
        throw Object.assign(new Error('Identity verification is already complete'), { statusCode: 409 });
      }
      const previousRequest = await tx.kycRequest.findFirst({
        where: { userId, status: { in: ['REJECTED', 'NOT_SUBMITTED'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      const savedRequest = previousRequest
        ? await tx.kycRequest.update({ where: { id: previousRequest.id }, data: requestData })
        : await tx.kycRequest.create({ data: { userId, ...requestData } });

      await tx.user.update({
        where: { id: userId },
        data: { kycStatus: 'PENDING_ADMIN_REVIEW' },
      });
      return savedRequest;
    });

    try {
      await scheduleKycVerification(request.id);
    } catch (error) {
      console.error(`Unable to enqueue KYC request ${request.id}; keeping it for admin review:`, error);
      await prisma.kycRequest.update({
        where: { id: request.id },
        data: { status: 'PENDING_ADMIN_REVIEW' },
      });
    }
    return prisma.kycRequest.findUnique({ where: { id: request.id } });
  }

  static async processRequest(requestId: string) {
    const request = await prisma.kycRequest.findUnique({ where: { id: requestId } });
    if (!request || !['PENDING_ADMIN_REVIEW', 'PENDING_MANUAL_REVIEW', 'PENDING'].includes(request.status)) return;
    try {
      if (!request.frontDocumentUrl || !request.backDocumentUrl || !request.selfieUrl) {
        throw new Error('KYC request is missing one or more identity documents');
      }
      const analysis = await this.analyzeKYCDocuments(request.frontDocumentUrl, request.backDocumentUrl, request.selfieUrl);
      const status = analysis.passed ? 'AUTOMATED_VERIFIED' : 'PENDING_ADMIN_REVIEW';
      if (analysis.passed) {
        const seller = await prisma.seller.findUnique({ where: { userId: request.userId } });
        const sellerRole = await prisma.role.findUnique({ where: { name: UserRole.SELLER } });
        if (!seller || !sellerRole) {
          throw new Error('Seller account or SELLER role is missing');
        }

        const processed = await prisma.$transaction(async (tx) => {
          const requestUpdate = await tx.kycRequest.updateMany({
            where: {
              id: requestId,
              status: { in: ['PENDING_ADMIN_REVIEW', 'PENDING_MANUAL_REVIEW', 'PENDING'] },
            },
            data: { status, faceMatchScore: analysis.faceMatchScore, ocrReadable: analysis.ocrReadable, processedAt: new Date() },
          });
          if (requestUpdate.count !== 1) return false;
          await tx.user.update({ where: { id: request.userId }, data: { kycStatus: status } });
          await tx.userProfile.update({
            where: { userId: request.userId },
            data: { isIdentityVerified: true },
          });
          await tx.seller.update({
            where: { id: seller.id },
            data: { status: 'ACTIVE', verificationLevel: 1, approvedAt: new Date() },
          });
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: request.userId, roleId: sellerRole.id } },
            create: { userId: request.userId, roleId: sellerRole.id },
            update: {},
          });
          return true;
        });
        if (!processed) return prisma.kycRequest.findUnique({ where: { id: requestId } });
      } else {
        const processed = await prisma.$transaction(async (tx) => {
          const requestUpdate = await tx.kycRequest.updateMany({
            where: {
              id: requestId,
              status: { in: ['PENDING_ADMIN_REVIEW', 'PENDING_MANUAL_REVIEW', 'PENDING'] },
            },
            data: { status, faceMatchScore: analysis.faceMatchScore, ocrReadable: analysis.ocrReadable, processedAt: new Date() },
          });
          if (requestUpdate.count !== 1) return false;
          await tx.user.update({ where: { id: request.userId }, data: { kycStatus: status } });
          return true;
        });
        if (!processed) return prisma.kycRequest.findUnique({ where: { id: requestId } });
      }
      if (analysis.passed) {
        void NotificationService.sendNotification(
          request.userId,
          'Identity verification complete',
          'Your account has been successfully verified! You can now start listing gift cards on the marketplace.',
          'KYC',
        ).catch((error) => console.error('Unable to send KYC verification notification:', error));
      }
      return prisma.kycRequest.findUnique({ where: { id: requestId } });
    } catch (error) {
      console.error(`KYC processing failed for request ${requestId}:`, error);
      await prisma.$transaction(async (tx) => {
        const requestUpdate = await tx.kycRequest.updateMany({
          where: {
            id: requestId,
            status: { in: ['PENDING_ADMIN_REVIEW', 'PENDING_MANUAL_REVIEW', 'PENDING'] },
          },
          data: { status: 'PENDING_ADMIN_REVIEW', processedAt: new Date() },
        });
        if (requestUpdate.count === 1) {
          await tx.user.updateMany({
            where: { id: request.userId, kycStatus: { not: 'APPROVED' } },
            data: { kycStatus: 'PENDING_ADMIN_REVIEW' },
          });
        }
      });
      return prisma.kycRequest.findUnique({ where: { id: requestId } });
    }
  }
}
