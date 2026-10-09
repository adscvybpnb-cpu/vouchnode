'use client';
import { useMemo } from 'react';
import { ProductCard } from './ProductCard';
import type { Product } from '../../types/api.types';
import { ResponsiveGrid } from '@/components/layout/ResponsiveGrid';

export function ProductGrid({
  products: externalProducts,
  isLoading: externalLoading,
  onBuyNow,
  viewMode = 'grid',
}: {
  products?: Product[];
  isLoading?: boolean;
  onBuyNow?: (product: Product) => void;
  viewMode?: 'list' | 'grid';
}) {
  const products = useMemo(() => {
    const seenIds = new Set<string>();
    const seenSlugs = new Set<string>();
    return (externalProducts ?? []).filter((product) => {
      if (seenIds.has(product.id) || seenSlugs.has(product.slug)) return false;
      seenIds.add(product.id);
      seenSlugs.add(product.slug);
      return true;
    });
  }, [externalProducts]);
  const isLoading = externalLoading ?? false;
  const columns = viewMode === 'list' ? 1 : 4;
  const listSkeletonClass = viewMode === 'list'
    ? 'h-32'
    : 'h-80';

  if (isLoading) {
    return (
      <ResponsiveGrid columns={columns}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className={`${listSkeletonClass} bg-card border border-border rounded-xl animate-pulse`}></div>
        ))}
      </ResponsiveGrid>
    );
  }

  if (products.length === 0) {
    return <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">No products found matching your criteria.</div>;
  }

  return (
    <ResponsiveGrid columns={columns}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onBuyNow={onBuyNow} layout={viewMode} />
      ))}
    </ResponsiveGrid>
  );
}
