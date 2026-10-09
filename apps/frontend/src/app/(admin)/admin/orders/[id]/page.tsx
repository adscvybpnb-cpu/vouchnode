'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AdminPage, AdminBadge } from '@/components/admin/AdminPage';
import { adminService } from '@/services/admin.service';

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { void adminService.getOrderDetails(id).then(setOrder).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load order.')); }, [id]);
  useEffect(load, [load]);
  return <AdminPage title={order?.orderNumber || 'Order details'} description="Inspect exchanged assets, payment state, dispute records, and historical conversation." loading={!order && !error} error={error} onRetry={load}>
    {order && <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3"><Metric label="Status" value={order.status} /><Metric label="Payment" value={order.paymentStatus} /><Metric label="Amount" value={`${order.currency} ${order.totalAmount}`} /></section>
      <section className="rounded-xl border border-white/10 p-5"><h2 className="text-lg font-semibold">Participants & asset</h2><p className="mt-3 text-sm text-slate-300">Buyer: {order.buyer?.profile?.username || order.buyer?.email || order.buyerId}</p><p className="mt-1 text-sm text-slate-300">Seller: {order.seller?.profile?.username || order.seller?.email || order.sellerId}</p><p className="mt-1 text-sm text-slate-300">Product: {order.product?.name || order.productId}</p></section>
      {order.dispute && <section className="rounded-xl border border-white/10 p-5"><h2 className="text-lg font-semibold">Dispute</h2><AdminBadge value={order.dispute.status} /><p className="mt-3 text-sm text-slate-300">{order.dispute.description}</p><Link className="mt-3 inline-block text-cyan-300" href={`/admin/disputes/${order.dispute.id}`}>Open dispute review</Link></section>}
      <section className="rounded-xl border border-white/10 p-5"><h2 className="text-lg font-semibold">Conversation transcript</h2><div className="mt-3 space-y-2">{(order.conversation?.messages || []).map((message: any) => <div key={message.id} className="rounded-lg bg-white/[0.03] p-3 text-sm text-slate-300"><span className="text-xs text-slate-500">{message.senderId || message.userId || 'Participant'} · {message.createdAt}</span><p className="mt-1">{message.content || message.body || '[Attachment]'}</p></div>)}</div></section>
    </div>}
  </AdminPage>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-sm font-semibold text-white">{value}</p></div>;
}
