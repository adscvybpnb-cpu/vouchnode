'use client';

import { useMemo, useState } from 'react';
import { SellerDirectory } from '@/components/site/SellerDirectory';
import { marketplaceSellerDirectory } from '@/lib/marketplace-data';

const PAGE_SIZE = 12;

export default function SellersPage() {
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<'sales' | 'rating' | 'newest'>('sales');
  const [page, setPage] = useState(1);

  const filteredSellers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const items = marketplaceSellerDirectory.filter((seller) => {
      if (!normalized) return true;
      return [seller.displayName, seller.username, seller.description].some((value) =>
        value.toLowerCase().includes(normalized),
      );
    });

    return [...items].sort((a, b) => {
      if (sortMode === 'rating') return b.rating - a.rating;
      return b.sales - a.sales;
    });
  }, [query, sortMode]);

  const totalPages = Math.max(1, Math.ceil(filteredSellers.length / PAGE_SIZE));
  const paginated = filteredSellers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <SellerDirectory
      sellers={paginated.map((seller) => ({
        id: seller.id,
        displayName: seller.displayName,
        username: seller.username,
        description: seller.description,
        avatar: seller.avatar,
        rating: seller.rating,
        feedback: seller.feedback,
        sales: seller.sales,
        responseTime: seller.responseTime,
        verified: seller.verified,
      }))}
      query={query}
      sortMode={sortMode}
      page={page}
      totalPages={totalPages}
      onQueryChange={(value) => {
        setQuery(value);
        setPage(1);
      }}
      onSortChange={(value) => {
        setSortMode(value);
        setPage(1);
      }}
      onPageChange={(next) => setPage(next)}
    />
  );
}
