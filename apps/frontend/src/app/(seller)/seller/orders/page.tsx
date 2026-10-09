'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sellerService } from '@/services/seller.service';
import type { Order } from '@/types/api.types';

const date = (value: string) => new Date(value).toLocaleString();

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focusedOrderId, setFocusedOrderId] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await sellerService.getSellerOrders({ page: 1, limit: 50 });
      setOrders(response.data || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load seller orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (loading || typeof window === 'undefined') return;
    const orderId = new URLSearchParams(window.location.search).get('orderId');
    if (!orderId) return;
    setFocusedOrderId(orderId);
    document.getElementById(`seller-order-${orderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [loading, orders]);

  return (
      <section className="mx-auto max-w-6xl space-y-6 p-4 text-white sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Seller Studio</p><h1 className="mt-2 text-3xl font-bold">Orders</h1><p className="mt-1 text-sm text-slate-400">Track orders for your listings and delivery status.</p></div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
      </div>
      {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        {loading ? <div className="flex items-center justify-center p-12 text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading orders...</div> :
          orders.length === 0 ? <p className="p-12 text-center text-slate-400">No seller orders yet.</p> :
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-white/10 text-slate-400"><tr><th className="p-4">Order</th><th className="p-4">Product</th><th className="p-4">Amount</th><th className="p-4">Status</th><th className="p-4">Created</th></tr></thead><tbody>{orders.map((order) => <tr id={`seller-order-${order.id}`} key={order.id} className={`scroll-mt-6 border-b border-white/5 last:border-0 ${focusedOrderId === order.id ? 'bg-indigo-400/10' : ''}`}><td className="p-4 font-medium">{order.orderNumber || order.id}</td><td className="p-4">{order.product?.name || order.productId}</td><td className="p-4">{order.amount} {order.currency}</td><td className="p-4"><span className="rounded-full bg-indigo-400/15 px-2.5 py-1 text-xs text-indigo-200">{order.status}</span></td><td className="p-4 text-slate-400">{date(order.createdAt)}</td></tr>)}</tbody></table></div>}
      </div>
    </section>
  );
}
