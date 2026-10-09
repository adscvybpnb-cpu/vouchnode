'use client';

import { ArrowRight, Search, ShieldCheck, Star } from 'lucide-react';
import Link from 'next/link';

export type SellerDirectoryEntry = {
  id: string;
  displayName: string;
  username: string;
  description: string;
  avatar: string;
  rating: number;
  feedback: number;
  sales: number;
  responseTime: string;
  verified?: boolean;
};

export function SellerDirectory({
  sellers,
  query,
  sortMode,
  page,
  totalPages,
  onQueryChange,
  onSortChange,
  onPageChange,
}: {
  sellers: SellerDirectoryEntry[];
  query: string;
  sortMode: 'sales' | 'rating' | 'newest';
  page: number;
  totalPages: number;
  onQueryChange: (value: string) => void;
  onSortChange: (value: 'sales' | 'rating' | 'newest') => void;
  onPageChange: (next: number) => void;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 text-white">
      <div className="mb-8 flex flex-col gap-4 rounded-[30px] border border-white/10 bg-[#12131a] p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-200">Marketplace directory</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">Browse active sellers</h1>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
            <Search className="h-4 w-4 text-indigo-300" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search sellers"
              className="w-[220px] bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </label>

          <select
            value={sortMode}
            onChange={(event) => onSortChange(event.target.value as 'sales' | 'rating' | 'newest')}
            className="rounded-xl border border-white/10 bg-[#0d0f14] px-3 py-2 text-sm text-white focus:border-indigo-500/60 focus:outline-none"
          >
            <option value="sales">Top sales</option>
            <option value="rating">Best rating</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {sellers.map((seller) => (
          <Link
            key={seller.id}
            href={`/user/${seller.id}`}
            className="group overflow-hidden rounded-[28px] border border-white/10 bg-[#10141c] p-4 transition hover:-translate-y-1 hover:border-indigo-500/40"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={seller.avatar} alt={seller.displayName} className="h-12 w-12 rounded-full object-cover ring-2 ring-indigo-500/30" />
                <div>
                  <p className="font-semibold text-white">{seller.displayName}</p>
                  <p className="text-xs text-slate-400">@{seller.username}</p>
                </div>
              </div>
              {seller.verified && (
                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-indigo-300">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </span>
              )}
            </div>

            <p className="mb-4 line-clamp-2 text-sm text-slate-300">{seller.description}</p>

            <div className="mb-4 flex items-center gap-2 text-amber-400">
              <Star className="h-4 w-4 fill-current" />
              <span className="text-sm font-semibold text-white">{seller.rating.toFixed(1)}</span>
              <span className="text-xs text-slate-400">{seller.feedback}% positive</span>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <span>{seller.sales.toLocaleString()} sales</span>
              <span>{seller.responseTime}</span>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm font-medium text-indigo-300">
              <span>View profile</span>
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between rounded-2xl border border-white/10 bg-[#10141c] px-4 py-3 text-sm text-slate-300">
        <span>Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded-xl border border-white/10 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-xl border border-white/10 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
