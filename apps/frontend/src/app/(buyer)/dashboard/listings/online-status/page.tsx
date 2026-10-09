'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock3 } from 'lucide-react';
import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/store/auth.store';

const durations = [
  { hours: 1, label: '1 Hour' },
  { hours: 2, label: '2 Hours' },
  { hours: 4, label: '4 Hours' },
] as const;

export default function OnlineStatusPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [selectedHours, setSelectedHours] = useState<1 | 2 | 4>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const confirmOnlineStatus = async () => {
    if (!user || saving) return;
    setSaving(true);
    setError('');
    const onlineUntil = new Date(Date.now() + selectedHours * 60 * 60 * 1000).toISOString();
    const response = await apiClient.patch<{ isOnline: boolean; onlineUntil: string }>('/users/me/presence', {
      online: true,
      durationHours: selectedHours,
      onlineUntil,
    });
    if (response.error || !response.data) {
      setError(response.error || 'Unable to update your online status.');
      setSaving(false);
      return;
    }
    updateUser({ isOnline: true, onlineUntil: response.data.onlineUntil });
    router.push('/seller/products');
  };

  if (!user) {
    return <div className="min-h-screen bg-[#0A0A0F] px-4 py-20 text-center text-slate-400">Sign in to manage your online status.</div>;
  }

  return (
    <main className="min-h-[calc(100vh-8rem)] bg-[#0A0A0F] px-4 py-10 text-white sm:px-6">
      <section className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-[#12141d] p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-emerald-300"><Clock3 className="h-6 w-6" /></div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Seller availability</p><h1 className="mt-2 text-2xl font-bold">Set your online status</h1><p className="mt-2 text-sm leading-6 text-slate-400">Choose how long buyers can see you as online. Your status expires automatically on the server, even if you close your browser.</p></div>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {durations.map((duration) => {
            const selected = selectedHours === duration.hours;
            return <button key={duration.hours} type="button" onClick={() => setSelectedHours(duration.hours)} className={`rounded-xl border p-4 text-left transition-colors ${selected ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200' : 'border-white/10 bg-black/10 text-slate-300 hover:bg-white/[0.06]'}`} aria-pressed={selected}><span className="flex items-center justify-between font-semibold">{duration.label}{selected && <Check className="h-4 w-4" />}</span><span className="mt-1 block text-xs text-slate-500">Maximum 4 hours</span></button>;
          })}
        </div>
        {error && <p role="alert" className="mt-5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <div className="mt-8 flex justify-end gap-3">
          <button type="button" onClick={() => router.back()} disabled={saving} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10">Cancel</button>
          <button type="button" onClick={() => void confirmOnlineStatus()} disabled={saving} className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving...' : 'Confirm Online Status'}</button>
        </div>
      </section>
    </main>
  );
}
