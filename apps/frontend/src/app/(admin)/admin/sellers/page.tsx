'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { adminService, type AdminSeller } from '@/services/admin.service';
import type { PaginatedResponse } from '@/types/api.types';

export default function AdminSellersPage() {
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PaginatedResponse<AdminSeller> | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sellerToSuspend, setSellerToSuspend] = useState<AdminSeller | null>(null);
  const [suspensionReason, setSuspensionReason] = useState('');

  const loadSellers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await adminService.getSellers(page, appliedSearch);
      setResult(response);
    } catch (loadError) {
      console.error('Failed to load admin sellers', loadError);
      setError('Unable to load seller accounts. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, page]);

  useEffect(() => {
    void loadSellers();
  }, [loadSellers]);

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  };

  const runAction = async (seller: AdminSeller, action: 'approve' | 'suspend') => {
    setActionId(seller.id);
    setError('');
    setNotice('');
    try {
      if (action === 'approve') await adminService.approveSeller(seller.id);
      else await adminService.suspendSeller(seller.id, suspensionReason.trim() || 'Suspended by administrator');
      setResult((current) => current ? {
        ...current,
        data: current.data.map((item) => item.id === seller.id
          ? { ...item, status: action === 'approve' ? 'ACTIVE' : 'SUSPENDED' }
          : item),
      } : current);
      setNotice(action === 'approve' ? 'Seller approved.' : 'Seller suspended and listings hidden.');
      setSellerToSuspend(null);
      setSuspensionReason('');
    } catch (actionError) {
      console.error(`Failed to ${action} seller`, actionError);
      setError(`Unable to ${action} this seller. Please retry.`);
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 text-white">
      <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#12131a] p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-200">Admin controls</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Seller marketplace management</h1>
        </div>
        <form onSubmit={applySearch} className="flex gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search shop or email"
            className="min-w-0 rounded-xl border border-white/10 bg-[#0d0f14] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none"
          />
          <button type="submit" className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold hover:bg-indigo-400">Search</button>
        </form>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p>}

      <div className="overflow-x-auto rounded-3xl border border-white/10 bg-[#12131a]">
        <table className="min-w-full text-left text-sm text-slate-200">
          <thead className="bg-white/[0.03] text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Seller</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Rating</th>
              <th className="px-4 py-3 font-medium">Sales</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading sellers…</td></tr>}
            {!loading && result?.data.map((seller) => {
              const status = (seller.status ?? (seller.isVerified ? 'ACTIVE' : 'PENDING')).toUpperCase();
              return (
                <tr key={seller.id} className="border-t border-white/10">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{seller.shopName}</p>
                    <p className="text-xs text-slate-400">{seller.user?.email ?? seller.username ?? seller.userId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em]">{status}</span>
                  </td>
                  <td className="px-4 py-3">{Number(seller.avgRating ?? seller.ratingAverage ?? seller.rating ?? 0).toFixed(1)}</td>
                  <td className="px-4 py-3">{Number(seller.totalSales ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 text-xs">
                      {status === 'PENDING' && <button disabled={actionId === seller.id} onClick={() => void runAction(seller, 'approve')} className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">Approve</button>}
                      {status === 'ACTIVE' && <button disabled={actionId === seller.id} onClick={() => { setSellerToSuspend(seller); setSuspensionReason(''); setError(''); setNotice(''); }} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">Suspend</button>}
                      {status === 'SUSPENDED' && <span className="text-slate-500">No action available</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && result?.data.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No sellers found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
        <span>{result?.total ?? 0} sellers</span>
        <div className="flex gap-2">
          <button disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40">Previous</button>
          <span className="px-2 py-1.5">Page {result?.page ?? page} of {Math.max(1, result?.totalPages ?? 1)}</span>
          <button disabled={page >= (result?.totalPages ?? 1) || loading} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>
      </div>
      {sellerToSuspend && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onMouseDown={(event) => {
        if (event.target === event.currentTarget && actionId !== sellerToSuspend.id) setSellerToSuspend(null);
      }}>
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="suspend-seller-title"
          className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#12131a] p-6 shadow-2xl"
        >
          <h2 id="suspend-seller-title" className="text-xl font-bold text-white">Suspend Seller Account</h2>
          <p className="mt-2 text-sm text-slate-400">Suspend {sellerToSuspend.shopName} and hide their active listings?</p>
          <label htmlFor="suspension-reason" className="mt-5 block text-sm font-medium text-slate-200">Reason (optional)</label>
          <textarea
            id="suspension-reason"
            value={suspensionReason}
            onChange={(event) => setSuspensionReason(event.target.value)}
            rows={4}
            maxLength={1000}
            disabled={actionId === sellerToSuspend.id}
            placeholder="Enter a reason for suspending this seller"
            className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#0d0f14] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-rose-400/60 focus:outline-none disabled:opacity-50"
          />
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              disabled={actionId === sellerToSuspend.id}
              onClick={() => setSellerToSuspend(null)}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={actionId === sellerToSuspend.id}
              onClick={() => void runAction(sellerToSuspend, 'suspend')}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-wait disabled:opacity-50"
            >
              {actionId === sellerToSuspend.id ? 'Suspending...' : 'Confirm Suspension'}
            </button>
          </div>
        </section>
      </div>}
    </div>
  );
}
