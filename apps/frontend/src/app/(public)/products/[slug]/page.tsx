import type { Metadata } from 'next';
import { productService } from '@/services/product.service';
import { ProductGallery } from '@/components/marketplace/ProductGallery';
import { PriceDisplay } from '@/components/marketplace/PriceDisplay';
import { SellerCard } from '@/components/marketplace/SellerCard';
import { DeliveryBadge } from '@/components/marketplace/DeliveryBadge';
import { CryptoCheckout } from '@/components/marketplace/CryptoCheckout';
import { OtherOffers } from '@/components/marketplace/OtherOffers';
import { LockKeyhole, Check } from 'lucide-react';
import { ProductDescription } from '@/components/marketplace/ProductDescription';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const product = await productService.getProduct(params.slug);
    return {
      title: `${product.name} | VouchNode`,
      description: product.description.slice(0, 160),
      openGraph: { title: product.name, description: product.description, images: product.images?.[0]?.url ? [product.images[0].url] : [] },
    };
  } catch { return { title: 'Product | VouchNode' }; }
}

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product = await productService.getProduct(params.slug);
  const offers = product.offers ?? [];
  const platformName = product.name
    .replace(/(?:\s+\d+(?:\.\d+)?\s*\$?)+\s*$/, '')
    .trim() || product.name;
  console.log('Frontend Received Alternative Offers:', product.offers);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <ProductGallery images={product.images || []} />
        <div className="space-y-6">
          <h1 className="text-3xl font-bold text-white">{product.name}</h1>
          <PriceDisplay originalPrice={product.originalPrice} currentPrice={product.currentPrice} currency={product.currency} />
          <DeliveryBadge type={product.deliveryType} />
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111923]">
            <div className="grid grid-cols-1 divide-y divide-white/10 text-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              {[
                ['CATEGORY', product.category?.name || product.category?.slug || 'Digital goods'],
                ['PLATFORM', platformName],
                ['DELIVERY METHOD', 'Digital Code'],
                ['DELIVERY WITHIN', 'Instant Delivery'],
                ['REGION RESTRICTION', product.region || product.regionCode || 'Global / Worldwide'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-white/10 px-4 py-3 sm:border-b last:sm:col-span-2">
                  <span className="text-[10px] font-bold tracking-[0.15em] text-slate-500">{label}</span>
                  <span className="text-right font-medium text-slate-100">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <ProductDescription text={product.description} />
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/30 bg-emerald-400/10 text-emerald-300">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <p className="text-xs font-bold leading-5 tracking-wide text-emerald-100">
                  YOU&apos;RE PROTECTED UNDER THE VOUCHNODE GUARANTEE. GET THE ITEM AS DESCRIBED OR YOUR MONEY BACK.
                </p>
              </div>
            </div>
          </div>
          <CryptoCheckout product={product} />
          <SellerCard seller={product.seller} />
        </div>
      </div>
      <OtherOffers offers={offers} />
    </div>
  );
}