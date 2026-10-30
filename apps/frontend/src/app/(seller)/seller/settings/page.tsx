'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { sellerService } from '@/services/seller.service';
import { useAuthStore } from '@/store/auth.store';

export default function SellerSettingsPage() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  const settingsQueryKey = ['seller', 'settings', userId ?? 'anonymous'] as const;
  const settingsQuery = useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => sellerService.getMySellerProfile(),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
  const shopName = settingsQuery.data?.shopName || '';
  const description = settingsQuery.data?.description || '';
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const loading = settingsQuery.isPending;
  const loadError = settingsQuery.error instanceof Error
    ? settingsQuery.error.message
    : settingsQuery.error ? 'Unable to load seller settings.' : '';

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const profile = await sellerService.updateSellerSettings({ shopName: shopName.trim(), description: description.trim() });
      queryClient.setQueryData(settingsQueryKey, profile);
      setMessage('Seller settings saved.');
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save seller settings.'); }
    finally { setSaving(false); }
  };

  return <section className="mx-auto max-w-3xl space-y-6 p-6 text-white"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Seller Studio</p><h1 className="mt-2 text-3xl font-bold">Settings</h1><p className="mt-1 text-sm text-slate-400">Update the public details buyers see on your storefront.</p></div>{(error || loadError) && <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error || loadError}</div>}{message && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">{message}</div>}{loading && !settingsQuery.data ? <div className="flex justify-center p-12 text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading settings...</div> : settingsQuery.data && <form onSubmit={save} className="space-y-5 rounded-xl border border-white/10 bg-white/[0.03] p-6"><label className="block space-y-2"><span className="text-sm font-medium">Shop name</span><Input value={shopName} onChange={(event) => void queryClient.setQueryData(settingsQueryKey, { ...settingsQuery.data, shopName: event.target.value })} required /></label><label className="block space-y-2"><span className="text-sm font-medium">Store description</span><Textarea value={description} onChange={(event) => void queryClient.setQueryData(settingsQueryKey, { ...settingsQuery.data, description: event.target.value })} rows={6} placeholder="Tell buyers what makes your store trustworthy." /></label><Button type="submit" disabled={saving || !shopName.trim()}><Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save settings'}</Button></form>}</section>;
}
