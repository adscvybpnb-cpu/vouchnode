'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { productService } from '@/services/product.service';
import { ProductSearchResults } from '@/components/site/ProductSearchResults';
import { marketplaceCategories } from '@/lib/marketplace-data';
import type { ProductFilters } from '@/types/api.types';

function ProductsContent() {
  const searchParams = useSearchParams();
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
    refetchOnWindowFocus: true,
    placeholderData: (previousData) => previousData,
  });

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
