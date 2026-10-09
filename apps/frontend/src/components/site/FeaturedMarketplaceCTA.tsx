'use client';

import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';

export function FeaturedMarketplaceCTA() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
      <div className="rounded-[30px] border border-white/10 bg-gradient-to-br from-[#10181d] via-[#0d141b] to-[#0a0d12] p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
              <ShieldCheck size={12} />
              Trusted trading network
            </div>
            <h2 className="mt-4 max-w-xl text-3xl font-black tracking-[-0.05em] text-white sm:text-4xl">
              Turn your digital inventory into instant liquidity.
            </h2>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/become-a-seller"
              className="inline-flex items-center justify-center rounded-2xl bg-[#f5f5f5] px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white"
            >
              Start selling
            </Link>
            <Link
              href="/products"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-500/40 hover:bg-cyan-500/10"
            >
              Buy now
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
