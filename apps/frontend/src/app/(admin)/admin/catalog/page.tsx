'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { AdminBadge, AdminPage, EmptyState } from '@/components/admin/AdminPage';
import { Button } from '@/components/ui/button';
import { adminService } from '@/services/admin.service';
import type { Product } from '@/types/api.types';

export default function LiveCatalogPage() {
  const searchParams = useSearchParams();
  const archived = searchParams.get('archived') === 'true';
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true); setError('');
    void adminService.getCatalog(page, archived ? 'INACTIVE' : 'ACTIVE').then((result) => {
      setProducts(Array.isArray(result?.data) ? result.data : []);
      setTotal(result?.total ?? 0);
      setTotalPages(result?.totalPages ?? 1);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load catalog.')).finally(() => setLoading(false));
  }, [archived, page]);
  useEffect(load, [load]);
  const remove = async (id: string) => {
    setBusy(id); setError('');
    try {
      await adminService.deleteProduct(id);
      setProducts((current) => current.filter((product) => product.id !== id));
      setTotal((current) => Math.max(0, current - 1));
      if (products.length === 1 && page > 1) setPage((current) => current - 1);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete offer.'); }
    finally { setBusy(null); }
  };
  const restore = async (id: string) => {
    setBusy(id); setError('');
    try {
      await adminService.restoreProduct(id);
      setProducts((current) => current.filter((product) => product.id !== id));
      setTotal((current) => Math.max(0, current - 1));
      if (products.length === 1 && page > 1) setPage((current) => current - 1);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to restore offer.'); }
    finally { setBusy(null); }
  };
  return <AdminPage title={archived ? 'Deleted/Archived Products' : 'Live Products Catalog'} description={archived ? 'Restore products archived from the live catalog.' : 'Inspect every currently listed seller offer and archive invalid catalog entries.'} loading={loading} error={error} onRetry={load}>
    {products.length === 0 ? <EmptyState message={archived ? 'No archived products found.' : 'No live products found.'} /> : <div className="grid gap-4 xl:grid-cols-2">{products.map((product) => <article key={product.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4"><div className="min-w-0"><h2 className="truncate font-semibold text-white">{product.name}</h2><p className="mt-1 text-sm text-slate-400">{product.seller?.username || product.seller?.shopName || product.sellerId} · {product.currency} {product.currentPrice}</p><div className="mt-2"><AdminBadge value={product.status} /></div></div>{archived ? <Button disabled={busy === product.id} isLoading={busy === product.id} onClick={() => void restore(product.id)}>Restore</Button> : <Button variant="destructive" disabled={busy === product.id} isLoading={busy === product.id} onClick={() => void remove(product.id)}><Trash2 className="mr-1 h-4 w-4" />Archive offer</Button>}</article>)}</div>}
    {total > 0 && <div className="mt-4 flex items-center justify-between text-sm text-slate-400"><span>{total} total</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</Button><span className="px-2 py-2">Page {page} of {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>Next</Button></div></div>}
  </AdminPage>;
}
