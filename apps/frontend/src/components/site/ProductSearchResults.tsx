'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LayoutGrid, List, SlidersHorizontal } from 'lucide-react';
import { ProductFilters, type MarketplaceFilterValues } from '@/components/marketplace/ProductFilters';
import { ProductGrid } from '@/components/marketplace/ProductGrid';
import { marketplaceCategories } from '@/lib/marketplace-data';
import type { Product } from '@/types/api.types';

const emptyFilters: MarketplaceFilterValues = {
  search: '',
  category: 'gift-cards',
  region: '',
  minPrice: '',
  maxPrice: '',
  deliveryType: '',
  rating: '',
};

function readFilters(searchParams: URLSearchParams | ReturnType<typeof useSearchParams>): MarketplaceFilterValues {
  return {
    search: searchParams.get('search') || '',
    category: searchParams.get('category') ?? 'gift-cards',
    region: searchParams.get('region') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    deliveryType: searchParams.get('delivery') || '',
    rating: searchParams.get('rating') || '',
  };
}

function activeFilterCount(values: MarketplaceFilterValues) {
  return Object.entries(values).filter(([key, value]) =>
    Boolean(value) && !(key === 'category' && (value === 'gift-cards' || value === 'all'))).length;
}

export function ProductSearchResults({
  activeCategory,
  activeCategorySlug,
  products,
  isLoading,
  total,
}: {
  activeCategory: string;
  activeCategorySlug: string;
  products: Product[];
  isLoading: boolean;
  total: number;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryString = searchParams.toString();
  const [draftFilters, setDraftFilters] = useState<MarketplaceFilterValues>(() => readFilters(searchParams));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const currentFilters = useMemo(() => readFilters(new URLSearchParams(queryString)), [queryString]);
  const page = Number(searchParams.get('page')) || 1;
  const limit = Number(searchParams.get('limit')) || 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const selectedSort = searchParams.get('sortBy') || 'relevance';
  const selectedSortOrder = searchParams.get('sortOrder') || 'desc';
  const filterCount = activeFilterCount(currentFilters);

  useEffect(() => {
    setDraftFilters(currentFilters);
  }, [currentFilters]);

  const navigateWithParams = (params: URLSearchParams) => {
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  useEffect(() => {
    if (searchParams.has('category')) return;
    const params = new URLSearchParams(queryString);
    params.set('category', 'gift-cards');
    navigateWithParams(params);
  }, [queryString, searchParams, pathname]);

  const changeFilter = (field: keyof MarketplaceFilterValues, value: string) => {
    setDraftFilters((current) => ({ ...current, [field]: value }));
    if (field === 'search' || field === 'minPrice' || field === 'maxPrice') return;

    const params = new URLSearchParams(queryString);
    const param = field === 'deliveryType' ? 'delivery' : field;
    if (value) params.set(param, value);
    else params.delete(param);
    params.delete('page');
    navigateWithParams(params);
  };

  useEffect(() => {
    const delayedValues: Array<[string, string, string]> = [
      ['search', draftFilters.search.trim(), currentFilters.search],
      ['minPrice', draftFilters.minPrice, currentFilters.minPrice],
      ['maxPrice', draftFilters.maxPrice, currentFilters.maxPrice],
    ];
    if (delayedValues.every(([, value, current]) => value === current)) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(queryString);
      for (const [param, value] of delayedValues) {
        if (value) params.set(param, value);
        else params.delete(param);
      }
      params.delete('page');
      navigateWithParams(params);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftFilters.search, draftFilters.minPrice, draftFilters.maxPrice, currentFilters.search, currentFilters.minPrice, currentFilters.maxPrice, queryString]);

  const clearFilters = () => {
    setDraftFilters(emptyFilters);
    const params = new URLSearchParams(queryString);
    for (const key of ['search', 'category', 'region', 'minPrice', 'maxPrice', 'delivery', 'rating', 'page']) {
      params.delete(key);
    }
    params.set('category', 'gift-cards');
    navigateWithParams(params);
    setFiltersOpen(false);
  };

  const changeCategory = (category: string) => {
    changeFilter('category', category);
  };

  const changeSort = (sort: string) => {
    const params = new URLSearchParams(queryString);
    const [sortBy, sortOrder] = sort.split(':');
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    params.delete('page');
    navigateWithParams(params);
  };

  const pageHref = (nextPage: number) => {
    const params = new URLSearchParams(queryString);
    params.set('page', String(nextPage));
    return `/products?${params.toString()}`;
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1440px] px-3 py-5 text-white sm:px-5 sm:py-8 lg:px-6">
      <div className="mb-5 rounded-2xl border border-white/10 bg-[#0a1017] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.15)] sm:rounded-[30px] sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Marketplace</p>
            <h1 className="mt-1 truncate text-2xl font-black tracking-[-0.04em] text-white sm:mt-2 sm:text-3xl">{activeCategory}</h1>
          </div>
          <p className="text-xs text-slate-400 sm:text-right">Discover digital goods from verified sellers</p>
        </div>
      </div>

      <nav aria-label="Marketplace categories" className="mb-4 flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:thin] lg:hidden">
        <button type="button" onClick={() => changeCategory('all')} className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${currentFilters.category === 'all' ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]'}`}>All</button>
        {marketplaceCategories.map((category) => (
          <button key={category.id} type="button" onClick={() => changeCategory(category.slug)} className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${currentFilters.category === category.slug ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]'}`}>
            <span className="mr-1.5">{category.icon}</span>{category.name}
          </button>
        ))}
      </nav>

      <div className="mb-4 flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#0a1017] p-2.5 sm:gap-3 sm:p-3">
        <button type="button" onClick={() => setFiltersOpen(true)} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/5">
          <SlidersHorizontal className="h-4 w-4 text-cyan-300" /> Filters
          {filterCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-400 px-1 text-[10px] font-black text-slate-950">{filterCount}</span>}
        </button>
        <label className="flex min-w-[145px] flex-1 items-center gap-2 sm:flex-none">
          <span className="shrink-0 text-xs text-slate-500">Sort</span>
          <select aria-label="Sort products" value={`${selectedSort}:${selectedSortOrder}`} onChange={(event) => changeSort(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0d141d] px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-400/60 sm:min-w-[170px] sm:text-sm">
            <option value="relevance:desc">Most Relevant</option>
            <option value="price:asc">Lowest Price</option>
            <option value="price:desc">Highest Price</option>
            <option value="createdAt:desc">Newest</option>
            <option value="rating:desc">Top Rated</option>
          </select>
        </label>
        <div className="ml-auto flex shrink-0 items-center rounded-xl border border-white/10 bg-white/[0.03] p-1" role="group" aria-label="Product view">
          <button type="button" aria-label="List view" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')} className={`rounded-lg p-2 transition ${viewMode === 'list' ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-500 hover:text-white'}`}><List className="h-4 w-4" /></button>
          <button type="button" aria-label="Grid view" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')} className={`rounded-lg p-2 transition ${viewMode === 'grid' ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-500 hover:text-white'}`}><LayoutGrid className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex min-w-0 gap-6">
        <aside className="hidden w-64 shrink-0 lg:block xl:w-72">
          <ProductFilters values={draftFilters} onChange={changeFilter} onClear={clearFilters} />
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-sm text-slate-300">Showing <span className="font-semibold text-white">{total}</span> results</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{activeCategorySlug}</p>
          </div>
          <ProductGrid products={products} isLoading={isLoading} viewMode={viewMode} />
          {totalPages > 1 && (
            <nav aria-label="Product pages" className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {page > 1 && <Link href={pageHref(page - 1)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:border-cyan-400 hover:text-white">Previous</Link>}
              <span className="px-3 text-sm text-slate-400">Page {page} of {totalPages}</span>
              {page < totalPages && <Link href={pageHref(page + 1)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:border-cyan-400 hover:text-white">Next</Link>}
            </nav>
          )}
        </div>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Marketplace filters">
          <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="absolute inset-y-0 right-0 w-full max-w-md animate-in slide-in-from-right duration-200 sm:max-w-lg">
            <ProductFilters
              mobile
              values={draftFilters}
              onChange={changeFilter}
              onClear={clearFilters}
              onClose={() => setFiltersOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
