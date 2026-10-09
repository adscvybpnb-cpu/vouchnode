'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { PaginatedResponse } from '@/types/api.types';
import { AdminBadge, AdminPage, EmptyState } from './AdminPage';
import { DataTable } from './DataTable';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

export function AdminListPage<T>({ title, description, headers, load, row, emptyMessage = 'No records found.', refreshInterval = 0, actionError, filterItem, searchable = false }: { title: string; description: string; headers: string[]; load: (page: number, search?: string) => Promise<PaginatedResponse<T>>; row: (item: T) => ReactNode; emptyMessage?: string; refreshInterval?: number; actionError?: string; filterItem?: (item: T) => boolean; searchable?: boolean }) {
  const [result, setResult] = useState<PaginatedResponse<T> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const loadPage = useCallback(() => {
    setLoading(true); setError('');
    void load(page, activeSearch).then((response) => {
      if (!response || typeof response !== 'object' || !Array.isArray(response.data)) {
        throw new Error('The admin API returned an invalid paginated response.');
      }
      const safeResponse = response as Partial<PaginatedResponse<T>>;
      const total = typeof safeResponse.total === 'number' && Number.isFinite(safeResponse.total) ? safeResponse.total : 0;
      const responsePage = typeof safeResponse.page === 'number' && Number.isFinite(safeResponse.page) ? safeResponse.page : page;
      const limit = typeof safeResponse.limit === 'number' && Number.isFinite(safeResponse.limit) ? safeResponse.limit : 25;
      const totalPages = typeof safeResponse.totalPages === 'number' && Number.isFinite(safeResponse.totalPages) ? Math.max(1, safeResponse.totalPages) : 1;
      setResult({
        ...safeResponse,
        data: Array.isArray(safeResponse.data) ? safeResponse.data : [],
        total,
        page: responsePage,
        limit,
        totalPages,
      });
    }).catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : 'Unable to load records.')).finally(() => setLoading(false));
  }, [activeSearch, load, page]);
  useEffect(() => { loadPage(); }, [loadPage]);
  useEffect(() => {
    if (!refreshInterval) return;
    const timer = window.setInterval(loadPage, refreshInterval);
    return () => window.clearInterval(timer);
  }, [loadPage, refreshInterval]);
  const visibleItems = result?.data.filter((item) => filterItem ? filterItem(item) : true) || [];
  return <AdminPage title={title} description={description} loading={loading} error={error} onRetry={loadPage}>
    {actionError && <div role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">{actionError}</div>}
    {searchable && <form onSubmit={(event) => { event.preventDefault(); setPage(1); setActiveSearch(search.trim()); }} className="mb-4 flex max-w-xl gap-2">
      <label className="sr-only" htmlFor="admin-record-search">Search records</label>
      <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input id="admin-record-search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={120} placeholder="Search records..." className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none" /></div>
      <Button type="submit" variant="outline" disabled={loading}>Search</Button>
    </form>}
    {result && visibleItems.length === 0 ? <EmptyState message={emptyMessage} /> : result && <><DataTable headers={headers}>{visibleItems.map((item, index) => <tr key={String((item as { id?: string }).id ?? index)} className="text-slate-300">{row(item)}</tr>)}</DataTable>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-400"><span>{visibleItems.length === result.data.length ? result.total : Math.max(0, result.total - (result.data.length - visibleItems.length))} total</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button><span className="px-2 py-2">Page {result.page} of {Math.max(1, result.totalPages)}</span><Button variant="outline" size="sm" disabled={page >= result.totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></div></div>
    </>}
  </AdminPage>;
}

export { AdminBadge };
