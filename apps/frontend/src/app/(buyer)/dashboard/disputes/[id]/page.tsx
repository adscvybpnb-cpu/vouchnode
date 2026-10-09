'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { disputeService } from '@/services/dispute.service';
import type { Dispute } from '@/types/api.types';

export default function DisputeDetailPage() {
  const params = useParams<{ id: string }>();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!params.id) return;
    void disputeService.getDispute(params.id)
      .then(setDispute)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load dispute.'))
      .finally(() => setLoading(false));
  }, [params.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!params.id || !response.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const updated = await disputeService.respondToDispute(params.id, { description: response.trim() });
      setDispute(updated);
      setResponse('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send dispute response.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-white sm:px-6">
      <Link href="/dashboard/disputes" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to disputes</Link>
      {loading ? <div className="flex justify-center py-20 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : !dispute ? <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{error || 'Dispute not found.'}</div> : (
        <>
          <section className="rounded-2xl border border-white/10 bg-[#141620] p-6">
            <div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-indigo-300">Dispute {dispute.disputeNumber || dispute.id}</p><h1 className="mt-2 text-2xl font-bold">{dispute.reason}</h1></div><span className="rounded-full bg-amber-400/10 px-3 py-1 text-sm text-amber-200">{dispute.status}</span></div>
            <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-300">{dispute.description || 'No description provided.'}</p>
          </section>
          {error && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
          <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-[#141620] p-6">
            <label htmlFor="dispute-response" className="text-sm font-semibold">Add response</label>
            <Textarea id="dispute-response" value={response} onChange={(event) => setResponse(event.target.value)} disabled={submitting} placeholder="Provide additional information for the dispute..." className="mt-3 min-h-32 border-white/10 bg-black/20 text-white" />
            <Button type="submit" disabled={!response.trim() || submitting} isLoading={submitting} className="mt-4 bg-indigo-500 hover:bg-indigo-400"><Send className="mr-2 h-4 w-4" />Send response</Button>
          </form>
        </>
      )}
    </main>
  );
}
