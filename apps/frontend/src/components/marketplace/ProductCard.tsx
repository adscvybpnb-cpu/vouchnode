import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, ShieldCheck, Star, Zap, Package, ShoppingCart } from 'lucide-react';
import type { Product } from '../../types/api.types';
import { calculateDiscount, formatAmount } from '../../lib/format';
import { useAuth } from '../../hooks/useAuth';

interface ProductCardProps {
  product: Product;
  onBuyNow?: (product: Product) => void;
  layout?: 'grid' | 'list';
  priority?: boolean;
}

export function ProductCard({ product, onBuyNow, layout = 'grid', priority = false }: ProductCardProps) {
  const discount = product.discountPercent !== undefined
    ? Number(product.discountPercent)
    : calculateDiscount(product.originalPrice, product.currentPrice);
  const rating = Number(product.seller?.ratingAverage ?? product.seller?.avgRating ?? product.seller?.rating ?? product.rating ?? 0);
  const reviewCount = Number(product.seller?.ratingCount ?? product.seller?.reviewCount ?? product.reviewCount ?? 0);
  const isOutOfStock = product.stock <= 0 || ['SOLD', 'SOLD_OUT', 'COMPLETED'].includes(product.status);
  const isList = layout === 'list';
  const { isAuthenticated } = useAuth();

  const handleBuyNow = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isAuthenticated) {
      window.location.href = '/login';
      return;
    }
    if (onBuyNow) {
      onBuyNow(product);
    } else {
      window.location.href = `/products/${product.slug}`;
    }
  };

  const badges = (
    <div className={`absolute ${isList ? 'left-2 top-2 sm:left-3 sm:top-3' : 'left-3 top-3'} z-10 flex flex-col items-start gap-1.5`}>
      {discount > 0 && <span className="rounded-full border border-emerald-300/50 bg-emerald-400 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-950 shadow-[0_0_16px_rgba(52,211,153,0.35)]">{discount}% OFF</span>}
      {product.deliveryType === 'INSTANT' && <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-300"><Zap className="h-3 w-3 fill-current" />Instant</span>}
      {isOutOfStock && <span className="rounded-full bg-slate-500/80 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white">SOLD OUT</span>}
    </div>
  );

  if (isList) {
    return (
      <Link href={`/products/${product.slug}`} className={`group relative flex min-h-28 min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#111923] text-white shadow-[0_18px_40px_rgba(0,0,0,0.16)] transition-all sm:min-h-36 ${isOutOfStock ? 'opacity-70' : 'hover:border-cyan-300/50 hover:shadow-[0_20px_45px_rgba(34,211,238,0.10)]'}`}>
        <div className="relative min-h-28 w-28 shrink-0 overflow-hidden bg-[#0b1118] sm:min-h-36 sm:w-36">
          {badges}
          {product.images?.[0] ? <Image src={product.images[0].url} alt={product.name} fill priority={priority} sizes="(max-width: 640px) 112px, 144px" className="object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-xs text-slate-500">No image</div>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 text-sm font-bold leading-5 text-slate-100 transition-colors group-hover:text-cyan-300 sm:text-base">{product.name}</h2>
            <p className="mt-1 truncate text-xs text-slate-400">{product.category?.name || product.brand || 'Digital goods'}{product.brand && product.category?.name ? ` · ${product.brand}` : ''}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="flex items-center gap-1 font-semibold text-amber-300"><Star className="h-3 w-3 fill-current" />{rating.toFixed(1)}</span>
              <span className="text-slate-500">({reviewCount} reviews)</span>
              <span className={`flex items-center gap-1 ${product.deliveryType === 'INSTANT' ? 'text-emerald-300' : 'text-slate-400'}`}>
                {product.deliveryType === 'INSTANT' ? <Zap className="h-3 w-3 fill-current" /> : <Package className="h-3 w-3" />}
                {product.deliveryType === 'INSTANT' ? 'Instant delivery' : 'Manual delivery'}
              </span>
              {product.region && <span className="truncate text-slate-500">{product.region}</span>}
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-2 border-t border-white/10 pt-2 sm:min-w-[150px] sm:flex-col sm:items-end sm:justify-center sm:border-0 sm:pt-0">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-wider text-slate-500">Price</p>
              <p className="truncate text-base font-black text-white sm:text-xl">{formatAmount(product.currentPrice, product.currency)} <span className="text-[10px] font-semibold text-slate-400">{product.currency}</span></p>
            </div>
            {!isOutOfStock && <button type="button" onClick={handleBuyNow} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white transition hover:bg-indigo-400 sm:text-xs"><ShoppingCart className="h-3.5 w-3.5" />Buy</button>}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/products/${product.slug}`} className={`group relative block min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#111923] text-white shadow-[0_18px_40px_rgba(0,0,0,0.2)] transition-all ${isOutOfStock ? 'opacity-70' : 'hover:-translate-y-1 hover:border-cyan-300/50 hover:shadow-[0_20px_45px_rgba(34,211,238,0.12)]'}`}>
      {badges}
      <div className="relative aspect-[4/3] max-h-44 overflow-hidden bg-[#0b1118] sm:max-h-none">
        {product.images?.[0] ? <Image src={product.images[0].url} alt={product.name} fill priority={priority} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-slate-500">No image</div>}
      </div>
      <div className="flex min-h-[214px] flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><h3 className="line-clamp-2 text-sm font-bold leading-5 text-slate-100 transition-colors group-hover:text-cyan-300">{product.name}</h3><p className="mt-1 truncate text-xs text-slate-400">{product.category?.name || product.brand || 'Digital goods'}</p></div>
          <span aria-label="View product" className="shrink-0 rounded-full border border-white/10 bg-white/5 p-1.5 text-slate-400"><Search className="h-3.5 w-3.5" /></span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 font-semibold text-amber-300"><Star className="h-3.5 w-3.5 fill-current" />{rating.toFixed(1)}</span>
          <span className="text-slate-500">({reviewCount} reviews)</span>
          <span className="ml-auto flex items-center gap-1 font-semibold text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" />Safe</span>
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-white/10 pt-4">
          <div className="min-w-0"><div className="text-[10px] uppercase tracking-wider text-slate-500">Price</div><div className="mt-1 truncate text-xl font-black text-white">{formatAmount(product.currentPrice, product.currency)} <span className="text-xs font-semibold text-slate-400">{product.currency}</span></div><div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-slate-400"><Package className="h-3 w-3" />{product.stock} in stock</div></div>
          {!isOutOfStock && <button type="button" onClick={handleBuyNow} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-500 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white transition hover:bg-indigo-400"><ShoppingCart className="h-3 w-3" />Buy</button>}
        </div>
      </div>
    </Link>
  );
}
