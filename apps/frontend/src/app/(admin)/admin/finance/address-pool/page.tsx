'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { AdminPage, EmptyState } from '@/components/admin/AdminPage';
import { Button } from '@/components/ui/button';
import { adminService, StaticAddressPoolRow } from '@/services/admin.service';

const assets: StaticAddressPoolRow['asset'][] = ['BTC', 'SOL', 'BCH', 'LTC', 'TRX'];

export default function StaticAddressPoolPage() {
  const [asset, setAsset] = useState<StaticAddressPoolRow['asset']>('BTC');
  const [addresses, setAddresses] = useState<StaticAddressPoolRow[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    void adminService.getStaticAddressPool()
      .then(setAddresses)
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : 'Unable to load address pool.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const values = Array.from(new Set(input.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)));
    if (values.length === 0) {
      setError('Paste at least one wallet address.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await adminService.addStaticAddresses(asset, values);
      setMessage(`${result.inserted} address${result.inserted === 1 ? '' : 'es'} added.`);
      setInput('');
      load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to add addresses.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeleting(id);
    setError('');
    setMessage('');
    try {
      await adminService.deleteStaticAddress(id);
      setAddresses((current) => current.filter((row) => row.id !== id));
      setMessage('Address deleted.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete address.');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AdminPage
      title="Static Address Pool"
      description="Manage rotating native-asset deposit addresses."
      loading={loading}
      error={error}
      onRetry={load}
    >
      <div className="space-y-6">
        <form onSubmit={submit} className="sticky top-0 z-20 rounded-xl border border-white/10 bg-[#0b0f1a]/95 p-5 shadow-xl shadow-black/20 backdrop-blur">
          <div className="grid gap-4 md:grid-cols-[180px_1fr_auto] md:items-end">
            <label className="text-sm text-slate-300">
              Asset
              <select value={asset} onChange={(event) => setAsset(event.target.value as StaticAddressPoolRow['asset'])} className="mt-2 h-11 w-full rounded-md border border-white/10 bg-[#111522] px-3 text-white">
                {assets.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-300">
              Wallet addresses, one per line
              <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={4} placeholder="Paste one address per line" className="mt-2 w-full rounded-md border border-white/10 bg-[#111522] px-3 py-2 text-sm text-white outline-none focus:border-cyan-400" />
            </label>
            <Button type="submit" isLoading={saving}>Add addresses</Button>
          </div>
          {message && <p role="status" className="mt-3 text-sm text-emerald-300">{message}</p>}
        </form>

        {addresses.length === 0 ? <EmptyState message="No static addresses have been added." /> : (
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#151b2b] text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-4 py-3">Asset</th><th className="px-4 py-3">Address</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">Actions</th></tr>
              </thead>
              <tbody>
                {addresses.map((row) => (
                  <tr key={row.id} className="border-t border-white/10 text-slate-200">
                    <td className="px-4 py-3 font-semibold">{row.asset}</td>
                    <td className="max-w-[360px] truncate px-4 py-3 font-mono text-xs">{row.address}</td>
                    <td className="px-4 py-3"><span className={row.status === 'AVAILABLE' ? 'text-emerald-300' : 'text-amber-300'}>{row.status}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-400">{row.orderId || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{row.expiresAt ? new Date(row.expiresAt).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={deleting === row.id}
                        isLoading={deleting === row.id}
                        onClick={() => void remove(row.id)}
                        aria-label={`Delete ${row.address}`}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminPage>
  );
}
