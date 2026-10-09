'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import { AdminBadge, AdminPage, EmptyState } from './AdminPage';
import { Button } from '@/components/ui/button';
import { adminService } from '@/services/admin.service';
import { useAuthStore } from '@/store/auth.store';
import type { PaginatedResponse } from '@/types/api.types';

type KycRow = {
  id: string; userId: string; status: string; fullName?: string | null; documentType?: string | null; createdAt: string;
  user?: { email?: string; profile?: { displayName?: string; username?: string } | null };
};

export default function KycStatusPage({ status, title }: { status?: string; title: string }) {
  const [rows, setRows] = useState<KycRow[]>([]);
  const [result, setResult] = useState<PaginatedResponse<KycRow> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const accessToken = useAuthStore((state) => state.accessToken);
  const load = useCallback(() => {
    setLoading(true); setError('');
    void adminService.getKycRequests(page, status).then((response) => {
      const safeResult = response as PaginatedResponse<KycRow>;
      setResult(safeResult);
      setRows(Array.isArray(safeResult?.data) ? safeResult.data : []);
    })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load KYC requests.'))
      .finally(() => setLoading(false));
  }, [page, status]);
  useEffect(load, [load]);
  const review = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    setBusy(id); setError('');
    try {
      await adminService.reviewKyc(id, decision, decision === 'REJECT' ? 'Rejected during manual review' : undefined);
      setRows((current) => current.filter((row) => row.id !== id));
      setResult((current) => current ? { ...current, total: Math.max(0, current.total - 1) } : current);
      if (rows.length === 1 && page > 1) setPage((current) => current - 1);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to review KYC request.'); }
    finally { setBusy(null); }
  };
  const openDocument = async (id: string, kind: 'front' | 'back' | 'selfie') => {
    if (!accessToken) { setError('Your admin session has expired.'); return; }
    try {
      const response = await fetch(adminService.getKycDocumentUrl(id, kind), { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) throw new Error('Unable to open KYC document.');
      const url = URL.createObjectURL(await response.blob());
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to open KYC document.'); }
  };
  return <AdminPage title={title} description="Inspect submitted identity documents and approve or reject KYC requests." loading={loading} error={error} onRetry={load}>
    {rows.length === 0 ? <EmptyState message={`No ${status ? status.toLowerCase() : 'pending'} identity verification requests.`} /> : <div className="grid gap-5 xl:grid-cols-2">{rows.map((row) => {
      const canReview = ['PENDING', 'PENDING_MANUAL_REVIEW', 'PENDING_ADMIN_REVIEW'].includes(row.status);
      return <article key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{row.user?.profile?.displayName || row.user?.profile?.username || row.fullName || row.userId}</p><p className="mt-1 text-xs text-slate-500">{row.user?.email || row.userId} · {row.documentType || 'Identity document'}</p></div><AdminBadge value={row.status} /></div><p className="mt-3 text-xs text-slate-500">Submitted {new Date(row.createdAt).toLocaleString()}</p><div className="mt-4 grid grid-cols-3 gap-2">{(['front', 'back', 'selfie'] as const).map((kind) => <button type="button" key={kind} onClick={() => void openDocument(row.id, kind)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-2 py-2 text-xs text-cyan-200 hover:bg-cyan-400/10"><ExternalLink className="h-3 w-3" />{kind}</button>)}</div>{canReview && <div className="mt-5 flex gap-2"><Button onClick={() => void review(row.id, 'APPROVE')} disabled={busy === row.id} isLoading={busy === row.id} className="bg-emerald-500 hover:bg-emerald-400"><Check className="mr-1 h-4 w-4" />Approve</Button><Button onClick={() => void review(row.id, 'REJECT')} disabled={busy === row.id} isLoading={busy === row.id} variant="destructive"><X className="mr-1 h-4 w-4" />Reject</Button></div>}</article>;
    })}</div>}
    {result && result.total > 0 && <div className="mt-4 flex items-center justify-between text-sm text-slate-400"><span>{result.total} total</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</Button><span className="px-2 py-2">Page {result.page} of {Math.max(1, result.totalPages)}</span><Button variant="outline" size="sm" disabled={page >= result.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Next</Button></div></div>}
  </AdminPage>;
}
