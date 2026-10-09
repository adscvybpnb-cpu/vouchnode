'use client';
import { useCallback } from 'react';
import { AdminListPage } from '@/components/admin/AdminListPage';
import { adminService } from '@/services/admin.service';
import type { AuditLog } from '@/types/api.types';
export default function AuditLogsPage() {
  const load = useCallback((page: number, search?: string) => adminService.getAuditLogs(page, search), []);
  return <AdminListPage<AuditLog> title="Audit logs" description="Immutable administrative activity and system events." headers={['Action', 'Entity', 'Actor', 'IP address', 'Created']} load={load} searchable row={(log) => <><td className="px-4 py-4 font-medium text-white">{log.action}</td><td className="px-4 py-4">{log.entityType || log.entity || '—'} / {log.entityId || '—'}</td><td className="px-4 py-4">{log.actorId || 'System'}</td><td className="px-4 py-4">{log.ipAddress || '—'}</td><td className="px-4 py-4 text-slate-400">{new Date(log.createdAt).toLocaleString()}</td></>} />;
}
