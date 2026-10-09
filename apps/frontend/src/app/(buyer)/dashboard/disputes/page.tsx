'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, ChevronRight, FileWarning, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/services/api.client';
import { disputeService } from '@/services/dispute.service';
import type { Dispute, Order } from '@/types/api.types';

const statusLabels: Record<string, string> = {
  OPEN: 'Open',
  AWAITING_SELLER: 'Under investigation',
  AWAITING_BUYER: 'Awaiting your response',
  ESCALATED: 'Escalated',
  RESOLVED_BUYER: 'Resolved in your favor',
  RESOLVED_SELLER: 'Resolved',
  CLOSED: 'Cancelled'
};

function statusVariant(status: string) {
  if (status.startsWith('RESOLVED') || status === 'CLOSED') return 'success' as const;
  if (status === 'OPEN') return 'warning' as const;
  return 'secondary' as const;
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [disputeResponse, orderResponse] = await Promise.all([
        disputeService.getDisputes(),
        apiClient.get<Order[]>('/orders')
      ]);
      setDisputes(disputeResponse || []);
      setOrders(orderResponse.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load disputes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openDispute = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const dispute = await disputeService.openDispute(orderId, reason, description);
      setDisputes((current) => [dispute, ...current]);
      setSelected(dispute);
      setShowForm(false);
      setOrderId('');
      setReason('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open dispute.');
    } finally {
      setSaving(false);
    }
  };

  const eligibleOrders = orders.filter((order) =>
    ['PAID', 'WAITING_BUYER_CONFIRMATION'].includes(order.status) &&
    !disputes.some((dispute) => dispute.orderId === order.id)
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold">Order disputes</h1><p className="mt-1 text-sm text-slate-400">Protect your purchase and resolve marketplace issues securely.</p></div>
        <Button onClick={() => setShowForm(true)} disabled={!eligibleOrders.length}><Plus className="mr-2 h-4 w-4" />Open a dispute</Button>
      </div>
      {error && <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"><AlertCircle className="h-4 w-4" />{error}</div>}
      {loading ? <div className="rounded-xl border border-white/10 bg-[#141420] p-8 text-center text-slate-400">Loading disputes...</div> : disputes.length === 0 ? <div className="rounded-xl border border-white/10 bg-[#141420] p-12 text-center"><FileWarning className="mx-auto mb-3 h-10 w-10 text-slate-600" /><h2 className="font-semibold">No disputes</h2><p className="mt-1 text-sm text-slate-500">Any open or resolved order cases will appear here.</p></div> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-3">{disputes.map((dispute) => <button key={dispute.id} onClick={async () => { try { setSelected(await disputeService.getDispute(dispute.id)); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load dispute.'); } }} className={`w-full rounded-xl border p-4 text-left transition ${selected?.id === dispute.id ? 'border-indigo-400/60 bg-indigo-500/10' : 'border-white/10 bg-[#141420] hover:border-white/20'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{dispute.disputeNumber || `Dispute ${dispute.id.slice(-8)}`}</p><p className="mt-1 text-sm text-slate-400">{dispute.order?.orderNumber || dispute.orderId}</p></div><Badge variant={statusVariant(dispute.status)}>{statusLabels[dispute.status] || dispute.status}</Badge></div><p className="mt-3 line-clamp-2 text-sm text-slate-300">{dispute.reason}</p><p className="mt-3 text-xs text-slate-500">{new Date(dispute.createdAt).toLocaleDateString()}</p></button>)}</div>
        <div className="rounded-xl border border-white/10 bg-[#141420] p-6">{selected ? <><div className="flex items-start justify-between"><div><p className="text-sm text-slate-400">{selected.order?.orderNumber || selected.orderId}</p><h2 className="mt-1 text-xl font-semibold">{selected.reason}</h2></div><Badge variant={statusVariant(selected.status)}>{statusLabels[selected.status] || selected.status}</Badge></div><p className="mt-6 whitespace-pre-wrap text-sm leading-6 text-slate-300">{selected.description}</p><div className="mt-8 border-t border-white/10 pt-5"><h3 className="font-medium">Case history</h3><div className="mt-4 space-y-4">{(selected.timeline || []).map((event) => <div key={event.id} className="flex gap-3 text-sm"><div className="mt-1 h-2 w-2 rounded-full bg-indigo-400" /><div><p className="text-slate-200">{event.description || event.action}</p><p className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</p></div></div>)}</div></div>{!['CLOSED', 'RESOLVED_BUYER', 'RESOLVED_SELLER'].includes(selected.status) && <Button variant="outline" className="mt-6" onClick={async () => { try { const updated = await disputeService.updateStatus(selected.id, 'CLOSED'); setSelected({ ...selected, ...updated }); setDisputes((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item)); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to cancel dispute.'); } }}>Cancel dispute</Button>}</> : <div className="flex h-full min-h-64 flex-col items-center justify-center text-center text-slate-500"><ChevronRight className="mb-3 h-8 w-8" /><p>Select a dispute to view its details and history.</p></div>}</div>
      </div>}
      {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={openDispute} className="w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-[#171725] p-6"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Open a dispute</h2><button type="button" onClick={() => setShowForm(false)} aria-label="Close"><X className="h-5 w-5 text-slate-400" /></button></div><label className="block text-sm text-slate-300">Order<select required value={orderId} onChange={(event) => setOrderId(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-[#101018] px-3 text-white"><option value="">Select an eligible order</option>{eligibleOrders.map((order) => <option key={order.id} value={order.id}>{order.orderNumber}</option>)}</select></label><label className="block text-sm text-slate-300">Reason<Input required value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2" placeholder="Briefly describe the issue" /></label><label className="block text-sm text-slate-300">Description<textarea required value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-28 w-full rounded-md border border-white/10 bg-[#101018] p-3 text-sm text-white outline-none focus:border-indigo-400" placeholder="Include relevant details and what resolution you are requesting." /></label><div className="flex justify-end gap-3"><Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button><Button type="submit" isLoading={saving}>Submit dispute</Button></div></form></div>}
    </div>
  );
}
