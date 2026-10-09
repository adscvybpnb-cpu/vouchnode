'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { disputeService } from '@/services/dispute.service';
import type { Dispute } from '@/types/api.types';

export default function SellerDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focusedDisputeId, setFocusedDisputeId] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setDisputes(await disputeService.getDisputes()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load disputes.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (loading || typeof window === 'undefined') return;
    const disputeId = new URLSearchParams(window.location.search).get('disputeId');
    if (!disputeId) return;
    setFocusedDisputeId(disputeId);
    document.getElementById(`seller-dispute-${disputeId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [disputes, loading]);

  const respond = async (dispute: Dispute) => {
    const text = responses[dispute.id]?.trim();
    if (!text) return;
    setBusy(dispute.id); setError('');
    try {
      const updated = await disputeService.respondToOrderDispute(dispute.orderId, text);
      setDisputes((current) => current.map((item) => item.id === dispute.id ? updated : item));
      setResponses((current) => ({ ...current, [dispute.id]: '' }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to send dispute response.'); }
    finally { setBusy(''); }
  };

  return <section className="mx-auto max-w-5xl space-y-6 p-6 text-white"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Seller Studio</p><h1 className="mt-2 text-3xl font-bold">Disputes</h1><p className="mt-1 text-sm text-slate-400">Review buyer claims and provide evidence or a response.</p></div>
    {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
    {loading ? <div className="flex justify-center p-12 text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading disputes...</div> : disputes.length === 0 ? <p className="rounded-xl border border-white/10 p-12 text-center text-slate-400">No disputes found.</p> : <div className="space-y-4">{disputes.map((dispute) => <article id={`seller-dispute-${dispute.id}`} key={dispute.id} className={`scroll-mt-6 rounded-xl border bg-white/[0.03] p-5 ${focusedDisputeId === dispute.id ? 'border-indigo-400/70 ring-1 ring-indigo-400/30' : 'border-white/10'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{dispute.disputeNumber || `Dispute ${dispute.id}`}</h2><p className="mt-1 text-sm text-slate-400">Order {dispute.order?.orderNumber || dispute.orderId} · {dispute.reason}</p></div><span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs text-amber-200">{dispute.status}</span></div>{dispute.description && <p className="mt-4 text-sm text-slate-300">{dispute.description}</p>}<div className="mt-4 flex gap-2"><Textarea value={responses[dispute.id] || ''} onChange={(event) => setResponses((current) => ({ ...current, [dispute.id]: event.target.value }))} placeholder="Write your response..." rows={3} /><Button type="button" onClick={() => void respond(dispute)} disabled={busy === dispute.id || !responses[dispute.id]?.trim()}><Send className="mr-2 h-4 w-4" />{busy === dispute.id ? 'Sending...' : 'Respond'}</Button></div></article>)}</div>}
  </section>;
}
