'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight, PackageSearch } from 'lucide-react';
import { orderService } from '@/services/order.service';

type BuyerOrder = {
  id: string;
  orderNumber?: string;
  status: string;
  totalAmount?: number | string;
  amount?: number | string;
  currency?: string;
  createdAt: string;
  product?: {
    name?: string;
    images?: Array<{ url: string; altText?: string | null }>;
  };
};

const statusStyles: Record<string, { label: string; className: string }> = {
  COMPLETED: { label: 'Completed', className: 'bg-blue-500 text-white' },
  DISPUTED: { label: 'Disputed', className: 'bg-amber-400 text-slate-950' },
  WAITING_CONFIRMATION: { label: 'Waiting confirmation', className: 'bg-orange-400 text-slate-950' },
  WAITING_BUYER_CONFIRMATION: { label: 'Waiting confirmation', className: 'bg-orange-400 text-slate-950' },
  PAID: { label: 'Paid', className: 'bg-slate-500 text-white' },
  DELIVERED: { label: 'Delivered', className: 'bg-slate-500 text-white' },
  PAYMENT_PENDING: { label: 'Payment pending', className: 'bg-slate-500 text-white' },
  CANCELLED: { label: 'Cancelled', className: 'bg-slate-600 text-white' },
  REFUNDED: { label: 'Refunded', className: 'bg-slate-600 text-white' },
};

function formatStatus(status: string) {
  return statusStyles[status] || {
    label: status.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (character) => character.toUpperCase()),
    className: 'bg-slate-500 text-white',
  };
}

function formatPrice(order: BuyerOrder) {
  const amount = Number(order.totalAmount ?? order.amount ?? 0);
  return `${amount.toFixed(2)} ${order.currency || 'USDT'}`;
}

export default function BuyerOrdersPage() {
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void orderService.getMyOrders()
      .then((response) => {
        if (!active) return;
        setOrders(response as BuyerOrder[]);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load your orders.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <section className="mx-auto w-full max-w-5xl text-white">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-indigo-300">Purchase history</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Buyer Orders</h1>
        <p className="mt-2 text-sm text-slate-400">Review your purchases and open any order for delivery and escrow details.</p>
      </div>

      {loading && <div className="rounded-2xl border border-white/10 bg-[#12141d] px-6 py-16 text-center text-sm text-slate-400">Loading your orders...</div>}
      {!loading && error && <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-6 py-5 text-sm text-rose-200">{error}</div>}
      {!loading && !error && orders.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/15 bg-[#12141d] px-6 py-16 text-center">
          <PackageSearch className="h-10 w-10 text-slate-500" />
          <h2 className="mt-4 text-lg font-semibold">No orders yet</h2>
          <p className="mt-2 text-sm text-slate-400">Your completed purchases will appear here.</p>
        </div>
      )}
      {!loading && !error && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((order) => {
            const status = formatStatus(order.status);
            const image = order.product?.images?.[0];
            return (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="group flex min-h-28 w-full items-center gap-4 rounded-2xl border border-white/10 bg-[#12141d] p-3 transition-colors hover:border-indigo-400/40 hover:bg-[#171a27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:gap-5 sm:p-4"
              >
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-900 sm:h-28 sm:w-28">
                  {image?.url && <img src={image.url} alt={image.altText || order.product?.name || 'Purchased product'} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />}
                  <span className={`absolute left-0 top-0 rounded-br-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide shadow-lg ${status.className}`}>{status.label}</span>
                </div>
                <div className="min-w-0 flex-1 py-1">
                  <h2 className="truncate text-base font-semibold text-white sm:text-lg">{order.product?.name || 'Digital product'}</h2>
                  <p className="mt-2 text-sm font-medium text-slate-300">{status.label}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>{formatPrice(order)}</span>
                    <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-indigo-300" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}