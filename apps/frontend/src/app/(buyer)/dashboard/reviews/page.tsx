'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Loader2, Star } from 'lucide-react';
import { orderService } from '@/services/order.service';
import { useAuthStore } from '@/store/auth.store';
import type { Order } from '@/types/api.types';

export default function ReviewsPage() {
  const userId = useAuthStore((state) => state.user?.id);
  const completedOrdersQuery = useQuery({
    queryKey: ['orders', 'buyer', userId ?? 'anonymous', 'completed'],
    queryFn: () => orderService.getMyOrders({ status: 'COMPLETED' }),
    enabled: Boolean(userId),
    staleTime: 15_000,
  });
  const orders = (completedOrdersQuery.data ?? []) as Order[];
  const loading = completedOrdersQuery.isPending;
  const error = completedOrdersQuery.error instanceof Error
    ? completedOrdersQuery.error.message
    : completedOrdersQuery.error ? 'Unable to load completed orders.' : '';

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 text-white sm:px-6">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to dashboard</Link>
      <header><p className="text-sm font-medium text-amber-300">Buyer feedback</p><h1 className="mt-1 text-3xl font-bold">Your reviews</h1><p className="mt-2 text-sm text-slate-400">Review completed orders and share your experience with sellers.</p></header>
      {error && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
      <section className="rounded-2xl border border-white/10 bg-[#141620] p-6">
        {loading ? <div className="flex justify-center py-12 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : orders.length === 0 ? <p className="py-12 text-center text-slate-400">No completed orders are ready for review.</p> : (
          <div className="space-y-3">{orders.map((order) => (
            <article key={order.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/10 p-4">
              <div><p className="font-semibold">{order.product?.name || `Order ${order.orderNumber}`}</p><p className="mt-1 text-xs text-slate-500">{order.orderNumber} · {new Date(order.createdAt).toLocaleDateString()}</p></div>
              <Link href={`/orders/${order.id}`} className="inline-flex items-center gap-2 rounded-lg border border-amber-400/30 px-3 py-2 text-sm text-amber-200 hover:bg-amber-400/10"><Star className="h-4 w-4" /> View order</Link>
            </article>
          ))}</div>
        )}
      </section>
    </main>
  );
}
