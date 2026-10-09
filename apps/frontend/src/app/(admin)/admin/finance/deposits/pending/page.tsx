'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminBadge, AdminPage, EmptyState } from '@/components/admin/AdminPage';
import { DataTable } from '@/components/admin/DataTable';
import { Button } from '@/components/ui/button';
import { adminApiClient } from '@/services/api.client';
import { adminService } from '@/services/admin.service';

type PendingDeposit = {
  id: string;
  currency: string;
  amount: number | string;
  assignedAddress: string;
  status: string;
  createdAt: string;
  user?: {
    email: string;
    profile?: {
      displayName?: string;
      username?: string;
    } | null;
  };
};

type DepositResponse = {
  data: PendingDeposit[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export default function PendingDepositsPage() {
  const [result, setResult] = useState<DepositResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<PendingDeposit | null>(null);
  const [amountToCredit, setAmountToCredit] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');

    void adminService
      .getFinanceDeposits('PENDING', page)
      .then((response) => setResult(response as DepositResponse))
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load pending deposits.',
        );
      })
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const openApproval = (deposit: PendingDeposit) => {
    setNotice('');
    setError('');
    setSelected(deposit);
    setAmountToCredit(String(deposit.amount));
  };

  const closeApproval = () => {
    if (busy) return;
    setSelected(null);
    setAmountToCredit('');
  };

  const confirmApproval = () => {
    if (!selected || busy) return;

    const amount = Number(amountToCredit);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }

    setBusy(true);
    setError('');

    void adminApiClient
      .put(`/deposits/${encodeURIComponent(selected.id)}/force-approve`, {
        finalAmount: String(amount),
      })
      .then((response) => {
        if (response.error) throw new Error(response.error);

        setSelected(null);
        setAmountToCredit('');
        setNotice('Deposit force approved successfully.');
        load();
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to force approve deposit.',
        );
      })
      .finally(() => setBusy(false));
  };

  return (
    <AdminPage
      title="Pending Deposits"
      description="Review pending deposits and manually release verified funds."
      loading={loading}
      error={error}
      onRetry={load}
      actions={
        notice ? (
          <p role="status" className="text-sm text-emerald-300">
            {notice}
          </p>
        ) : undefined
      }
    >
      {result && result.data.length === 0 ? (
        <EmptyState message="No pending deposits found." />
      ) : (
        result && (
          <>
            <DataTable
              headers={[
                'User Name',
                'User Email',
                'Asset',
                'Amount',
                'Status',
                'Created Date',
                'Deposit Address',
                'Actions',
              ]}
            >
              {result.data.map((deposit) => (
                <tr key={deposit.id} className="text-slate-300">
                  <td className="px-4 py-4">
                    {deposit.user?.profile?.displayName ||
                      deposit.user?.profile?.username ||
                      '—'}
                  </td>
                  <td className="px-4 py-4">{deposit.user?.email || '—'}</td>
                  <td className="px-4 py-4">{deposit.currency}</td>
                  <td className="px-4 py-4">{String(deposit.amount)}</td>
                  <td className="px-4 py-4">
                    <AdminBadge value={deposit.status} />
                  </td>
                  <td className="px-4 py-4 text-slate-400">
                    {new Date(deposit.createdAt).toLocaleString()}
                  </td>
                  <td className="max-w-40 break-all px-4 py-4 font-mono text-xs">
                    {deposit.assignedAddress}
                  </td>
                  <td className="px-4 py-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openApproval(deposit)}
                    >
                      Force Approve
                    </Button>
                  </td>
                </tr>
              ))}
            </DataTable>

            <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
              <span>{result.total} total</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <span className="px-2 py-2">
                  Page {result.page} of {Math.max(1, result.totalPages)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= result.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )
      )}

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-slate-900 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white">
              Force Approve Deposit
            </h2>
            <p className="mt-4 text-sm text-slate-300">
              User email: <strong>{selected.user?.email || '—'}</strong>
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Asset: <strong>{selected.currency}</strong>
            </p>
            <label className="mt-5 block text-sm text-slate-300">
              Amount to Credit
              <input
                type="number"
                min="0"
                step="any"
                value={amountToCredit}
                onChange={(event) => setAmountToCredit(event.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={closeApproval}
              >
                Cancel
              </Button>
              <Button
                disabled={busy || !amountToCredit.trim()}
                isLoading={busy}
                onClick={confirmApproval}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
