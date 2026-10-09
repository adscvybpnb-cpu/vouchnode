'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { walletService } from '@/services/wallet.service';
import type { LedgerEntry } from '@/types/api.types';

const typeLabels: Record<string, string> = {
  DEPOSIT: 'Deposit',
  ORDER_PAYMENT: 'Purchase',
  WITHDRAW: 'Withdraw',
  TRADE_BUY: 'Trade buy',
  TRADE_SELL: 'Trade sell',
  SYSTEM_REFUND: 'System refund',
  INTERNAL_TRANSFER: 'Internal transfer'
};

const statusClasses: Record<string, string> = {
  PENDING: 'bg-amber-400/10 text-amber-300',
  PROCESSING: 'bg-blue-400/10 text-blue-300',
  COMPLETED: 'bg-emerald-400/10 text-emerald-300',
  CANCELLED: 'bg-slate-400/10 text-slate-300',
  FAILED: 'bg-red-400/10 text-red-300',
  REFUNDED: 'bg-cyan-400/10 text-cyan-300'
};

export default function WalletTransactionsPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setEntries(await walletService.getTransactionHistory());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load transaction history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <main className="min-h-screen bg-[#07090f] px-4 pb-20 pt-8 text-white sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/dashboard/wallet" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Back to wallet
            </Link>
            <h1 className="text-3xl font-black tracking-tight">Transaction History</h1>
            <p className="mt-2 text-sm text-slate-400">A unified record of deposits, withdrawals, trades, refunds, and internal transfers.</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/10 text-slate-300 hover:bg-white/5">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#141620] shadow-xl">
          {error ? <div className="p-8 text-center text-red-300">{error}</div> : loading ? <div className="p-12 text-center text-slate-400">Loading transaction history...</div> : entries.length === 0 ? <div className="p-12 text-center text-slate-400">No transactions found.</div> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wider text-slate-500">
                  <tr><th className="px-5 py-4">Type</th><th className="px-5 py-4">Asset</th><th className="px-5 py-4">Amount</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Date</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {entries.map((entry) => {
                    const credit = entry.direction === 'CREDIT';
                    return <tr key={entry.id} className="transition hover:bg-white/[0.03]">
                      <td className="px-5 py-4"><div className="flex items-center gap-3"><span className={`flex h-8 w-8 items-center justify-center rounded-full ${credit ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>{credit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</span><div><p className="font-semibold text-slate-200">{typeLabels[entry.type] || entry.type}</p>{entry.description && <p className="mt-1 max-w-xs truncate text-xs text-slate-500">{entry.description}</p>}</div></div></td>
                      <td className="px-5 py-4 font-semibold text-slate-200">{entry.currency}</td>
                      <td className={`px-5 py-4 font-mono font-semibold ${credit ? 'text-emerald-300' : 'text-slate-200'}`}>{credit ? '+' : '-'}{Number(entry.amount).toFixed(8)} {entry.currency}</td>
                      <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[entry.status] || 'bg-white/10 text-slate-300'}`}>{entry.status}</span></td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-400">{new Date(entry.createdAt).toLocaleString()}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
