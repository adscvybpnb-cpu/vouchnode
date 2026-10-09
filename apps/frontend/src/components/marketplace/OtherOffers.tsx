'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Zap, Star, ArrowUpRight } from 'lucide-react';
import type { Product } from '@/types/api.types';
import { formatAmount } from '@/lib/format';

export function OtherOffers({ offers }: { offers: Product[] }) {
  useEffect(() => {
    console.log('Frontend Received Alternative Offers:', offers);
  }, [offers]);

  return (
    <section className="mt-10 w-full rounded-2xl border border-cyan-400/20 bg-[#11131c] p-5 shadow-lg shadow-black/20">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Compare sellers</p>
        <h2 className="mt-2 text-2xl font-bold text-white">Other Offers for this Item</h2>
      </div>
      {offers.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
          No other sellers are offering this item right now.
        </p>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => (
          <div key={offer.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-black/20 p-3 transition hover:border-cyan-400/40">
            <Link href={`/products/${offer.slug}`} className="min-w-[180px] flex-1">
              <p className="font-semibold text-white hover:text-cyan-200">{offer.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {offer.brand} · face value {formatAmount(offer.originalPrice, offer.currency)}
              </p>
            </Link>
            <Link href={`/sellers/${offer.seller?.userId}`} className="flex min-w-[180px] items-center gap-3 hover:opacity-80">
              <img
                src={offer.seller?.avatarUrl || '/placeholder-avatar.svg'}
                alt={offer.seller?.shopName || 'Seller'}
                className="h-10 w-10 rounded-full object-cover"
              />
              <div>
                <p className="font-semibold text-white">{offer.seller?.shopName || 'Verified seller'}</p>
                <p className="flex items-center gap-1 text-xs text-slate-400">
                  <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
                  {(Number(offer.seller?.rating ?? offer.seller?.avgRating ?? offer.rating) || 0).toFixed(1)}
                  <span>({offer.seller?.reviewCount ?? 0})</span>
                </p>
              </div>
            </Link>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
              <Zap className="h-3.5 w-3.5" /> {offer.deliveryType === 'INSTANT' ? 'Instant' : 'Manual'}
            </span>
            <p className="text-sm text-slate-300">{offer.stock} in stock</p>
            <p className="text-lg font-bold text-white">{formatAmount(offer.currentPrice, offer.currency)}</p>
            <Link href={`/products/${offer.slug}`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-300">
              Buy Now <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          ))}
        </div>
      )}
    </section>
  );
}
