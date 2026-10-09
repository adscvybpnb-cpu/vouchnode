'use client';

import { ChangeEvent, FormEvent, useState } from 'react';
import { CheckCircle2, ChevronLeft, LifeBuoy } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/store/auth.store';

interface TicketForm {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const emptyForm: TicketForm = {
  name: '',
  email: '',
  subject: '',
  message: '',
};

export default function SupportTicketPage() {
  const user = useAuthStore((state) => state.user);
  const [form, setForm] = useState<TicketForm>(() => ({
    ...emptyForm,
    name: user?.displayName || user?.username || '',
    email: user?.email || '',
  }));
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ticketId, setTicketId] = useState('');

  const updateField = (field: keyof TicketForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    setAttachment(event.target.files?.[0] || null);
  };

  const submitTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    if (attachment) payload.append('attachment', attachment);

    const response = await apiClient.upload<{ ticketId: string }>('/support/tickets', payload);
    setSubmitting(false);
    if (response.error || !response.data?.ticketId) {
      setError(response.error || 'Unable to submit your ticket. Please try again.');
      return;
    }
    setTicketId(response.data.ticketId);
  };

  if (ticketId) {
    return (
      <main className="min-h-[calc(100vh-5rem)] bg-[#0A0A0F] px-4 py-16 text-white sm:px-6">
        <section className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 via-[#12141d] to-[#12141d] p-8 text-center shadow-2xl shadow-black/30 sm:p-14">
          <CheckCircle2 className="h-20 w-20 text-emerald-400" aria-hidden="true" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">Thank you! Your ticket has been logged successfully.</h1>
          <p className="mt-5 text-lg text-slate-300">Your Ticket ID: <strong className="text-emerald-300">#{ticketId}</strong></p>
          <Link href="/" className="mt-8 rounded-xl border border-indigo-300/40 bg-indigo-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-indigo-500">Return to VouchNode</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-[#0A0A0F] px-4 py-10 text-white sm:px-6 lg:py-16">
      <section className="mx-auto w-full max-w-5xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white">
          <ChevronLeft className="h-4 w-4" /> Back to VouchNode
        </Link>
        <div className="mt-8 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl border border-indigo-400/20 bg-gradient-to-br from-indigo-500/15 to-[#12141d] p-8 sm:p-10">
            <LifeBuoy className="h-10 w-10 text-indigo-300" aria-hidden="true" />
            <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">How can we help?</h1>
            <p className="mt-4 leading-7 text-slate-300">Tell our support team what happened and we&apos;ll review your request as quickly as possible.</p>
            <p className="mt-8 text-sm text-slate-500">You can optionally attach a screenshot to help us understand the issue.</p>
          </div>

          <form onSubmit={submitTicket} className="space-y-5 rounded-3xl border border-white/10 bg-[#12141d] p-6 shadow-2xl shadow-black/30 sm:p-8">
            <h2 className="text-xl font-semibold">Submit a support ticket</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-200">
                Full Name
                <input required value={form.name} onChange={(event) => updateField('name', event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-white outline-none transition-colors focus:border-indigo-400" />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-200">
                Email Address
                <input required type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-white outline-none transition-colors focus:border-indigo-400" />
              </label>
            </div>
            <label className="block space-y-2 text-sm font-medium text-slate-200">
              Subject
              <input required value={form.subject} onChange={(event) => updateField('subject', event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-white outline-none transition-colors focus:border-indigo-400" />
            </label>
            <label className="block space-y-2 text-sm font-medium text-slate-200">
              Message Description
              <textarea required rows={6} value={form.message} onChange={(event) => updateField('message', event.target.value)} className="w-full resize-y rounded-xl border border-white/10 bg-slate-900 p-3 text-white outline-none transition-colors focus:border-indigo-400" />
            </label>
            <label className="block space-y-2 text-sm font-medium text-slate-200">
              Optional Screenshot Upload
              <input type="file" accept="image/*" onChange={handleAttachment} className="block w-full rounded-xl border border-white/10 bg-slate-900 text-sm text-slate-300 file:mr-4 file:border-0 file:bg-indigo-600 file:px-4 file:py-3 file:font-medium file:text-white" />
            </label>
            {error && <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
            <button type="submit" disabled={submitting} className="w-full rounded-xl border border-indigo-300/40 bg-indigo-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60">
              {submitting ? 'Submitting Ticket...' : 'Submit Ticket'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
