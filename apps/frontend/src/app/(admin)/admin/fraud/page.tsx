'use client';
import { useCallback, useState } from 'react';
import { AdminListPage } from '@/components/admin/AdminListPage';
import { AdminBadge } from '@/components/admin/AdminPage';
import { Button } from '@/components/ui/button';
import { adminService } from '@/services/admin.service';
import type { FraudFlag } from '@/types/api.types';
export default function FraudPage() {
  const load = useCallback((page: number, search?: string) => adminService.getFraudAlerts(page, search), []);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState('');
  const resolve = async (id: string) => {
    setResolvingId(id);
    setActionError('');
    try {
      await adminService.resolveFraudAlert(id);
      setResolvedIds((current) => new Set(current).add(id));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Unable to resolve fraud alert.');
    } finally {
      setResolvingId(null);
    }
  };
  return <AdminListPage<FraudFlag> title="Fraud alerts" description="Prioritize unresolved risk signals before they affect customers." headers={['User / order', 'Signal', 'Description', 'Status', 'Created', 'Action']} load={load} searchable actionError={actionError} row={(flag) => {
    const resolved = flag.isResolved || resolvedIds.has(flag.id);
    return <><td className="px-4 py-4 font-medium text-white">{flag.userId || flag.orderId || '—'}</td><td className="px-4 py-4"><AdminBadge value={flag.severity || flag.type} /></td><td className="max-w-sm truncate px-4 py-4">{flag.description || flag.reasons?.join(', ') || '—'}</td><td className="px-4 py-4"><AdminBadge value={resolved ? 'RESOLVED' : 'OPEN'} /></td><td className="px-4 py-4 text-slate-400">{new Date(flag.createdAt).toLocaleDateString()}</td><td className="px-4 py-4">{resolved ? <span className="text-slate-500">Resolved</span> : <Button size="sm" disabled={resolvingId === flag.id} isLoading={resolvingId === flag.id} onClick={() => void resolve(flag.id)}>Resolve</Button>}</td></>;
  }} />;
}
