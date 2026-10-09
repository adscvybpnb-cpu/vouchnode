import Link from 'next/link';
import { ArrowRight, ShieldCheck, Star } from 'lucide-react';
import { marketplaceSellerDirectory } from '@/lib/marketplace-data';

const sellers = marketplaceSellerDirectory.slice(0, 12);
const marqueeSellers = [...sellers, ...sellers];

export function ActiveSellers() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 pb-20 pt-4">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-200">Verified community</p>
          <h2 className="text-2xl font-bold text-white">Top Active Verified Sellers</h2>
        </div>
        <Link href="/sellers" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-300 transition hover:text-indigo-200">
          Browse all sellers <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#10141c]/70 p-3">
        <div className="seller-marquee flex min-w-max gap-4">
          {marqueeSellers.map((seller, index) => (
            <Link
              key={`${seller.id}-${index}`}
              href={`/user/${seller.id}`}
              className="group min-w-[240px] rounded-2xl border border-white/10 bg-[#11131a] p-4 shadow-lg shadow-slate-950/20 transition hover:-translate-y-1 hover:border-indigo-500/50 hover:shadow-indigo-500/10"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={seller.avatar} alt={seller.displayName} className="h-12 w-12 rounded-full object-cover ring-2 ring-indigo-500/30" />
                  <div>
                    <p className="font-semibold text-white">{seller.displayName}</p>
                    <p className="text-xs text-slate-400">@{seller.username}</p>
                  </div>
                </div>
                <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                  {seller.verified ? 'Verified' : 'Trusted'}
                </div>
              </div>

              <div className="mb-4 flex items-center gap-2 text-amber-400">
                <Star className="h-4 w-4 fill-current" />
                <span className="text-sm font-semibold text-white">{seller.rating.toFixed(1)}</span>
                <span className="text-xs text-slate-400">{seller.feedback}% Positive</span>
              </div>

              <div className="mb-4 flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs text-slate-300">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-300" />
                  Identity verified
                </span>
                <span className="text-indigo-200">{seller.sales.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Sales volume</span>
                <span className="font-semibold text-slate-200">{seller.sales.toLocaleString()}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
