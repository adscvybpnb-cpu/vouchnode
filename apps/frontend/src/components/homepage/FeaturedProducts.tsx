'use client';
import { useEffect, useState } from 'react';
import { ProductCard } from '../marketplace/ProductCard';
import { productService } from '../../services/product.service';
import type { Product } from '../../types/api.types';
import Link from 'next/link';

export function FeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    productService.getFeaturedProducts().then(setProducts).catch(() => {});
  }, []);

  if (products.length === 0) return null;

  return (
    <section className="container mx-auto px-4 py-12 border-t border-border">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Featured Products</h2>
          <p className="text-muted-foreground mt-2">Top rated gift cards and digital assets</p>
        </div>
        <Link href="/products?featured=true" className="text-primary hover:text-primary-hover font-medium hidden sm:block">
          View All →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {products.slice(0, 4).map(p => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
