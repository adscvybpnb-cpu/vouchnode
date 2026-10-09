'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { AdminBadge, AdminPage, EmptyState } from '@/components/admin/AdminPage';
import { DataTable } from '@/components/admin/DataTable';
import { Button } from '@/components/ui/button';
import { adminApiClient } from '@/services/api.client';
import { adminService } from '@/services/admin.service';

type PendingWithdrawal = {
  id: string;
  currency: string;
  amount: number | string;
  destinationAddress: string;
  status: string;
  createdAt: string;
  wallet?: { userId: string; currency: string };
};

type WithdrawalResponse = {
  data: PendingWithdrawal[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export default function PendingWithdrawalsPage() {
  const [result, setResult] = useState<WithdrawalResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<PendingWithdrawal | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [txHash, setTxHash] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void adminService.getFinanceWithdrawals('PENDING,UNDER_REVIEW,PROCESSING', page)
      .then((response) => setResult(response as WithdrawalResponse))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unable to load pending withdrawals.'))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const openApproval = (withdrawal: PendingWithdrawal) => {
    setNotice('');
    setError('');
    setSelected(withdrawal);
    setAction('approve');
    setTxHash('');
  };

  const openRejection = (withdrawal: PendingWithdrawal) => {
    setNotice('');
    setError('');
    setSelected(withdrawal);
    setAction('reject');
    setTxHash('');
  };

  const closeModal = () => {
    setSelected(null);
    setAction(null);
    setTxHash('');
  };

  const copyAddress = async (withdrawal: PendingWithdrawal) => {
    await navigator.clipboard.writeText(withdrawal.destinationAddress);
    setCopiedId(withdrawal.id);
    window.setTimeout(() => setCopiedId((current) => current === withdrawal.id ? null : current), 1500);
  };

  const confirmAction = () => {
    if (!selected || !action || busy) return;
    if (action === 'approve' && !txHash.trim()) {
      setError('Enter the blockchain transaction hash.');
      return;
    }
    setBusy(true);
    setError('');
    const successMessage = action === 'approve'
      ? 'Withdrawal approved successfully.'
      : 'Withdrawal rejected and refunded successfully.';
    void adminApiClient.put(`/withdrawals/${encodeURIComponent(selected.id)}/status`, {
      status: action === 'approve' ? 'APPROVED' : 'REJECTED',
      ...(action === 'approve' ? { txHash: txHash.trim() } : {}),
    })
      .then((response) => {
        if (response.error) throw new Error(response.error);
        setBusy(false);
        closeModal();
        setNotice(successMessage);
        window.setTimeout(() => window.location.reload(), 300);
      })
      .catch((cause: unknown) => {
        setBusy(false);
        setError(cause instanceof Error ? cause.message : 'Unable to update withdrawal.');
      })
      .finally(() => setBusy(false));
  };

  return <AdminPage title="Pending Withdrawals" description="Review and process pending withdrawal requests." loading={loading} error={error} onRetry={load} actions={notice ? <p role="status" className="text-sm text-emerald-300">{notice}</p> : undefined}>
    {result && result.data.length === 0 ? <EmptyState message="No pending withdrawals found." /> : result && <><DataTable headers={['ID', 'User', 'Asset', 'Amount', 'Target Wallet Address', 'Status', 'Created', 'Actions']}>{result.data.map((withdrawal) => <tr key={withdrawal.id} className="text-slate-300"><td className="px-4 py-4 font-mono text-xs text-white">{withdrawal.id}</td><td className="px-4 py-4 text-xs">{withdrawal.wallet?.userId || '—'}</td><td className="px-4 py-4">{withdrawal.currency}</td><td className="px-4 py-4">{String(withdrawal.amount)}</td><td className="px-4 py-4"><span className="mr-2 break-all font-mono text-xs">{withdrawal.destinationAddress}</span><button type="button" aria-label="Copy wallet address" title="Copy wallet address" onClick={() => void copyAddress(withdrawal)} className="inline-flex rounded p-1 text-cyan-300 hover:bg-white/10">{copiedId === withdrawal.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></td><td className="px-4 py-4"><AdminBadge value={withdrawal.status} /></td><td className="px-4 py-4 text-slate-400">{new Date(withdrawal.createdAt).toLocaleString()}</td><td className="px-4 py-4"><div className="flex gap-2"><Button size="sm" onClick={() => openApproval(withdrawal)}>Approve</Button><Button size="sm" variant="outline" onClick={() => openRejection(withdrawal)}>Reject</Button></div></td></tr>)}</DataTable><div className="mt-4 flex items-center justify-between text-sm text-slate-400"><span>{result.total} total</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button><span className="px-2 py-2">Page {result.page} of {Math.max(1, result.totalPages)}</span><Button variant="outline" size="sm" disabled={page >= result.totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></div></div></>}
    {selected && action && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-lg rounded-xl border border-white/10 bg-slate-900 p-6 shadow-xl"><h2 className="text-lg font-semibold text-white">{action === 'approve' ? 'Approve Withdrawal' : 'Reject Withdrawal'}</h2><p className="mt-4 break-all text-sm text-slate-300">Target wallet address: <strong>{selected.destinationAddress}</strong></p>{action === 'approve' ? <label className="mt-5 block text-sm text-slate-300">Blockchain Transaction ID<input value={txHash} onChange={(event) => setTxHash(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white" placeholder="Enter txHash" /></label> : <p className="mt-5 text-sm text-amber-200">Confirm rejection and refund {String(selected.amount)} {selected.currency} to the user wallet?</p>}<div className="mt-6 flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={closeModal}>Cancel</Button><Button disabled={busy || (action === 'approve' && !txHash.trim())} isLoading={busy} onClick={confirmAction}>Confirm</Button></div></div></div>}
  </AdminPage>;
}
