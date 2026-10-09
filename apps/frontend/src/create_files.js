const fs = require('fs');
const path = require('path');

const srcDir = 'c:\\Users\\alraya\\Desktop\\hooh\\apps\\frontend\\src';

const files = {
  'app/(auth)/verify-email/page.tsx': `'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authService } from '@/services/auth.service';
import { Button } from '@/components/ui/button';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    
    authService.verifyEmail(token)
      .then(() => {
        setStatus('success');
        setTimeout(() => router.push('/login'), 3000);
      })
      .catch(() => setStatus('error'));
  }, [token, router]);

  return (
    <div className="text-center">
      {status === 'loading' && <p className="text-white">Verifying email...</p>}
      {status === 'success' && (
        <>
          <h2 className="text-2xl font-bold text-green-500 mb-4">Email verified!</h2>
          <p className="text-slate-400">Redirecting to login...</p>
        </>
      )}
      {status === 'error' && (
        <>
          <h2 className="text-2xl font-bold text-red-500 mb-4">Verification failed</h2>
          <p className="text-slate-400 mb-6">The link is invalid or has expired.</p>
          <Button onClick={() => router.push('/login')} className="w-full bg-indigo-600">Back to Login</Button>
        </>
      )}
    </div>
  );
}`,

  'app/(public)/products/page.tsx': `'use client';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { productService } from '@/services/product.service';
import { ProductGrid } from '@/components/marketplace/ProductGrid';
import { ProductFilters } from '@/components/marketplace/ProductFilters';

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const filters = {
    search: searchParams.get('search') || '',
    categoryId: searchParams.get('category') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    deliveryType: searchParams.get('delivery') || '',
    rating: searchParams.get('rating') || '',
    hasDiscount: searchParams.get('discount') === 'true',
    page: Number(searchParams.get('page')) || 1,
    sortBy: searchParams.get('sort') || 'relevance',
  };
  
  const { data, isLoading } = useQuery({
    queryKey: ['products', filters],
    queryFn: () => productService.getProducts(filters),
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex gap-6">
        <aside className="w-64 flex-shrink-0 hidden lg:block">
          <ProductFilters />
        </aside>
        <div className="flex-1">
          <ProductGrid products={data?.data || []} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}`,

  'app/(public)/products/[slug]/page.tsx': `import type { Metadata } from 'next';
import { productService } from '@/services/product.service';
import { ProductGallery } from '@/components/marketplace/ProductGallery';
import { PriceDisplay } from '@/components/marketplace/PriceDisplay';
import { SellerCard } from '@/components/marketplace/SellerCard';
import { DeliveryBadge } from '@/components/marketplace/DeliveryBadge';
import { Button } from '@/components/ui/button';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const product = await productService.getProduct(params.slug);
    return {
      title: \`\${product.name} | VouchNode\`,
      description: product.description.slice(0, 160),
      openGraph: { title: product.name, description: product.description, images: product.images?.[0]?.url ? [product.images[0].url] : [] },
    };
  } catch { return { title: 'Product | VouchNode' }; }
}

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product = await productService.getProduct(params.slug);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <ProductGallery images={product.images || []} />
        <div className="space-y-6">
          <h1 className="text-3xl font-bold text-white">{product.name}</h1>
          <PriceDisplay originalPrice={product.originalPrice} currentPrice={product.currentPrice} currency={product.currency} />
          <DeliveryBadge type={product.deliveryType} />
          <p className="text-slate-300">{product.description}</p>
          <Button size="lg" className="w-full bg-indigo-600">Buy Now</Button>
          <SellerCard seller={product.seller} />
        </div>
      </div>
    </div>
  );
}`
};

for (const [relPath, content] of Object.entries(files)) {
  const fullPath = path.join(srcDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  console.log('Created:', fullPath);
}
