import { prisma } from '../lib/prisma';

interface AuditLogParams {
  actorId?: string;
  actorType?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: any;
  after?: any;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

export async function createAuditLog(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        actorType: params.actorType || 'USER',
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        before: params.before,
        after: params.after,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: params.metadata || {}
      }
    });
  } catch (err) {
    // Never let audit log failure break the main request
    console.error('Audit log error:', err);
  }
}
