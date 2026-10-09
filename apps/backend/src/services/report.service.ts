import { prisma } from '../lib/prisma';
import { ReportType } from '@vouchnode/shared';

export class ReportService {
  static async createReport(reporterID: string, data: { targetType: ReportType, targetId: string, reason: string, description?: string }) {
    const reporter = await prisma.user.findUnique({ where: { id: reporterID }, select: { id: true } });
    if (!reporter) throw new Error('Authenticated reporter not found');
    if (data.targetType === 'SELLER' || data.targetType === 'BUYER') {
      const target = await prisma.user.findUnique({ where: { id: data.targetId }, select: { id: true } });
      if (!target) throw new Error('Reported user not found');
    }
    return prisma.report.create({
      data: {
        reporterID,
        reportedUserId: data.targetType === 'SELLER' || data.targetType === 'BUYER' ? data.targetId : undefined,
        targetType: data.targetType,
        targetId: data.targetId,
        productId: data.targetType === 'PRODUCT' ? data.targetId : undefined,
        reason: data.reason,
        description: data.description
      }
    });
  }

  static async getReports(filters: any) {
    return prisma.report.findMany({ where: filters, orderBy: { createdAt: 'desc' } });
  }

  static async resolveReport(id: string, adminId: string, resolution: string) {
    return prisma.report.update({
      where: { id },
      data: { status: 'RESOLVED', resolution, reviewedBy: adminId, reviewedAt: new Date() }
    });
  }

  static async dismissReport(id: string, adminId: string) {
    return prisma.report.update({
      where: { id },
      data: { status: 'DISMISSED', reviewedBy: adminId, reviewedAt: new Date() }
    });
  }
}
