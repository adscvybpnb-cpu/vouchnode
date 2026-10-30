'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { productService } from '@/services/product.service';
import { ProductSearchResults } from '@/components/site/ProductSearchResults';
import { marketplaceCategories } from '@/lib/marketplace-data';
import type { PaginatedResponse, Product, ProductFilters } from '@/types/api.types';

function ProductsContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const categoryQuery = searchParams.get('category') ?? 'gift-cards';
  const filters: ProductFilters = {
    search: searchParams.get('search') || '',
    category: categoryQuery === 'all' ? '' : categoryQuery,
    region: searchParams.get('region') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    rating: searchParams.get('rating') || '',
    deliveryType: searchParams.get('delivery') || '',
    page: Number(searchParams.get('page')) || 1,
    limit: 20,
    sortBy: (searchParams.get('sortBy') as ProductFilters['sortBy']) || 'relevance',
    sortOrder: (searchParams.get('sortOrder') as ProductFilters['sortOrder']) || 'desc',
  };

  const { data, isLoading } = useQuery({
    queryKey: ['products', filters],
    queryFn: () => productService.getProducts(filters),
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    const handlePresenceUpdate = (event: Event) => {
      const payload = (event as CustomEvent<{
        userId?: string;
        isOnline?: boolean;
        onlineUntil?: string | null;
      }>).detail;
      if (!payload?.userId || typeof payload.isOnline !== 'boolean') return;

      const isOnline = payload.isOnline &&
        (!payload.onlineUntil || new Date(payload.onlineUntil).getTime() > Date.now());
      queryClient.setQueriesData<PaginatedResponse<Product>>(
        { queryKey: ['products'] },
        (current) => current && ({
          ...current,
          data: current.data
            .map((product) => {
              const seller = product.seller;
              if (!seller || seller.userId !== payload.userId) return product;
              return {
                ...product,
                seller: {
                  ...seller,
                  isOnline,
                  onlineUntil: payload.onlineUntil ?? null,
                  user: {
                    ...seller.user,
                    isOnline,
                    onlineUntil: payload.onlineUntil ?? null,
                  },
                },
              };
            })
            .sort((a, b) => Number(b.seller?.isOnline) - Number(a.seller?.isOnline)
              || (b.seller?.completedTradesCount ?? 0) - (a.seller?.completedTradesCount ?? 0)),
        }),
      );
    };
    window.addEventListener('presence:update', handlePresenceUpdate);
    return () => window.removeEventListener('presence:update', handlePresenceUpdate);
  }, [queryClient]);

  const activeCategory = categoryQuery === 'all'
    ? { name: 'All Products', slug: 'all' }
    : marketplaceCategories.find((category) => category.slug === categoryQuery)
    ?? { name: 'All Products', slug: 'all' };

  return (
    <ProductSearchResults
      activeCategory={activeCategory.name}
      activeCategorySlug={activeCategory.slug}
      products={data?.data || []}
      isLoading={isLoading}
      total={data?.total ?? 0}
      totalPages={data?.totalPages ?? Math.max(1, Math.ceil((data?.total ?? 0) / (filters.limit ?? 20)))}
    />
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8 text-slate-300">Loading marketplace...</div>}>
      <ProductsContent />
    </Suspense>
  );
}
