'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminBadge, AdminPage, EmptyState } from '@/components/admin/AdminPage';
import { DataTable } from '@/components/admin/DataTable';
import { Button } from '@/components/ui/button';
import { adminService } from '@/services/admin.service';
import type { PaginatedResponse, Report } from '@/types/api.types';
import { Search } from 'lucide-react';

export default function ReportsPage() {
  const router = useRouter();
  const [result, setResult] = useState<PaginatedResponse<Report> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void adminService.getReports(page, activeSearch)
      .then(setResult)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to load reports.'))
      .finally(() => setLoading(false));
  }, [activeSearch, page]);

  useEffect(() => { load(); }, [load]);

  const moderate = async (report: Report, action: 'suspend' | 'warn') => {
    if (!['BUYER', 'SELLER'].includes(report.targetType)) {
      setError('This report does not target a user account.');
      return;
    }
    const label = action === 'suspend' ? 'suspend this user' : 'warn this user';
    if (!window.confirm(`Are you sure you want to ${label}?`)) return;
    setBusy(`${action}-${report.id}`);
    setError('');
    try {
      if (action === 'suspend') await adminService.suspendReportedUser(report.id);
      else await adminService.warnReportedUser(report.id);
      setResult((current) => current ? {
        ...current,
        data: current.data.filter((item) => item.id !== report.id),
        total: Math.max(0, current.total - 1),
      } : current);
      if (result?.data.length === 1 && page > 1) setPage((current) => current - 1);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : `Unable to ${action} user.`);
    } finally {
      setBusy(null);
    }
  };

  return <AdminPage title="Reports" description="Review community reports and take account moderation actions." loading={loading} error={error} onRetry={load}>
    <form onSubmit={(event) => { event.preventDefault(); setPage(1); setActiveSearch(search.trim()); }} className="mb-4 flex max-w-xl gap-2">
      <label className="sr-only" htmlFor="report-search">Search reports</label>
      <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input id="report-search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={120} placeholder="Search report ID, user, target, or reason..." className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none" /></div>
      <Button type="submit" variant="outline" disabled={loading}>Search</Button>
    </form>
    {result && result.data.length === 0 ? <EmptyState message="No reports found." /> : result && <DataTable headers={['Target', 'Type', 'Reason', 'Status', 'Created', 'ACTION']}>
      {result.data.map((report) => {
        const isUserReport = report.targetType === 'BUYER' || report.targetType === 'SELLER';
        return <tr key={report.id} className="text-slate-300">
          <td className="px-4 py-4 font-medium text-white">{report.targetId}</td>
          <td className="px-4 py-4">{report.targetType}</td>
          <td className="max-w-xs truncate px-4 py-4">{report.reason}</td>
          <td className="px-4 py-4"><AdminBadge value={report.status} /></td>
          <td className="px-4 py-4 text-slate-400">{new Date(report.createdAt).toLocaleDateString()}</td>
          <td className="px-4 py-4"><div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => isUserReport ? router.push(`/admin/users/${encodeURIComponent(report.targetId)}`) : setError('Review is available only for user reports.')}>Review</Button>
            <Button size="sm" variant="destructive" disabled={!isUserReport || Boolean(busy)} isLoading={busy === `suspend-${report.id}`} onClick={() => void moderate(report, 'suspend')}>Suspend User</Button>
            <Button size="sm" className="border-yellow-400/40 bg-yellow-400/10 text-yellow-200 hover:bg-yellow-400/20" disabled={!isUserReport || Boolean(busy)} isLoading={busy === `warn-${report.id}`} onClick={() => void moderate(report, 'warn')}>Warn User</Button>
          </div></td>
        </tr>;
      })}
    </DataTable>}
    {result && result.total > 0 && <div className="mt-4 flex items-center justify-between text-sm text-slate-400"><span>{result.total} total</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</Button><span className="px-2 py-2">Page {result.page} of {Math.max(1, result.totalPages)}</span><Button variant="outline" size="sm" disabled={page >= result.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Next</Button></div></div>}
  </AdminPage>;
}
