'use client';

import Link from 'next/link';
import { ChevronRight, ShieldCheck, Star } from 'lucide-react';

type Listing = {
  id: string;
  title: string;
  price: number;
  original?: number;
  seller: string;
  rating: number;
  activity: string;
  badge: string;
  accent: string;
  bg: string;
  trust: string;
};

export function MarketListings({ listings }: { listings: Listing[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Top offers</div>
          <h2 className="mt-2 text-2xl font-black text-white">Live marketplace feed</h2>
        </div>
        <Link href="/products" className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white">
          View all offers
          <ChevronRight size={16} />
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {listings.map((listing) => (
          <article key={listing.id} className="group overflow-hidden rounded-[26px] border border-white/10 bg-[#0a1017] shadow-[0_20px_40px_rgba(0,0,0,0.2)] transition hover:-translate-y-1 hover:border-violet-500/35">
            <div className={`relative overflow-hidden border-b border-white/10 bg-gradient-to-br ${listing.bg} p-4`}>
              <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full border border-white/10 bg-[#04070c]/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-100">
                <ShieldCheck size={10} className="text-emerald-400" />
                {listing.trust}
              </div>
              <div
                className="relative flex h-28 items-end rounded-2xl border border-white/10 px-4 py-3"
                style={{
                  background: `linear-gradient(135deg, ${listing.accent}33, rgba(15,23,42,0.8) 60%)`,
                }}
              >
                <div className="flex w-full items-end justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-300">{listing.badge}</div>
                    <div className="mt-2 text-xl font-black text-white">${listing.price.toFixed(2)}</div>
                  </div>
                  <div className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-medium text-slate-100">
                    {listing.activity}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Gift Card</div>
                <div className="flex items-center gap-1 text-amber-300">
                  <Star size={12} fill="currentColor" />
                  <span className="text-xs font-semibold text-slate-200">{listing.rating.toFixed(1)}</span>
                </div>
              </div>

              <h3 className="text-lg font-bold text-white">{listing.title}</h3>

              <div className="mt-4 flex items-center justify-between text-sm text-slate-300">
                <span>{listing.seller}</span>
                <span className="text-emerald-300">On sale</span>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">From</div>
                  <div className="mt-1 text-sm text-slate-300 line-through">${listing.original?.toFixed(2) ?? listing.price.toFixed(2)}</div>
                </div>
                <button className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-200">
                  Buy now
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
