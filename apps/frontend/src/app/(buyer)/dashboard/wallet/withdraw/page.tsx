'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { walletService } from '@/services/wallet.service';
import type { AssetBalance, PortfolioSummary } from '@/types/api.types';

const defaultNetwork = (currency: string) => {
  switch (currency) {
    case 'USDT':
    case 'TRX': return 'TRC20';
    case 'USDC':
    case 'ETH': return 'ERC20';
    case 'BNB': return 'BEP20';
    case 'SOL': return 'SOLANA';
    case 'GRAM': return 'TON';
    default: return currency;
  }
};

export default function WithdrawPage() {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [currency, setCurrency] = useState('');
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const assets = useMemo(() => (portfolio?.assets || []).filter((asset) => Number(asset.availableBalance) > 0), [portfolio]);
  const selected = assets.find((asset) => asset.currency === currency) || assets[0];
  const available = Number(selected?.availableBalance || 0);
  const parsedAmount = Number(amount);
  const invalidAmount = !Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > available;
  const canSubmit = Boolean(selected && address.trim() && !invalidAmount && !submitting);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await walletService.getPortfolio();
      setPortfolio(next);
      setCurrency((current) => current || next.assets.find((asset) => Number(asset.availableBalance) > 0)?.currency || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load wallet balances.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !canSubmit) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await walletService.withdraw({
        currency: selected.currency,
        network: selected.network || defaultNetwork(selected.currency),
        amount: parsedAmount,
        destinationAddress: address.trim()
      });
      setSuccess(`${parsedAmount} ${selected.currency} withdrawal submitted for processing.`);
      setAmount('');
      setAddress('');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to submit withdrawal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#07090f] px-4 pb-20 pt-8 text-white sm:px-6 lg:px-8">
      <section className="mx-auto max-w-2xl">
        <Link href="/dashboard/wallet" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to wallet</Link>
        <div className="mb-8"><p className="text-sm font-medium text-indigo-300">Wallet</p><h1 className="mt-1 text-3xl font-black tracking-tight">Withdraw crypto</h1><p className="mt-2 text-slate-400">Send available funds to an external wallet address.</p></div>
        {error && <div role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}
        {success && <div role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"><CheckCircle2 className="h-4 w-4 shrink-0" />{success}</div>}

        <div className="rounded-2xl border border-white/10 bg-[#141620] p-6 shadow-xl sm:p-8">
          {loading ? <div className="py-12 text-center text-slate-400">Loading available balances...</div> : assets.length === 0 ? (
            <div className="py-10 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-amber-300" /><p className="mt-3 font-semibold">No available funds</p><p className="mt-2 text-sm text-slate-400">Deposit funds or wait for pending balances to settle before withdrawing.</p><Link href="/dashboard/wallet/deposit" className="mt-5 inline-flex text-sm text-emerald-300 hover:text-emerald-200">Go to deposit</Link></div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label htmlFor="withdraw-currency" className="mb-2 block text-sm font-medium text-slate-300">Asset</label>
                <select id="withdraw-currency" value={selected?.currency || ''} onChange={(event) => { setCurrency(event.target.value); setAmount(''); setError(''); }} disabled={submitting} className="w-full rounded-md border border-white/10 bg-black/20 p-3 text-white disabled:opacity-50">
                  {assets.map((asset) => <option key={asset.currency} value={asset.currency}>{asset.currency} — available {Number(asset.availableBalance).toFixed(8)}</option>)}
                </select>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between"><label htmlFor="withdraw-amount" className="text-sm font-medium text-slate-300">Amount ({selected?.currency})</label><span className="text-xs text-slate-500">Available: {available.toFixed(8)}</span></div>
                <Input id="withdraw-amount" type="number" min="0.00000001" max={available} step="any" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={submitting} placeholder={`Enter ${selected?.currency} amount`} className="border-white/10 bg-black/20 text-white" />
                {amount && invalidAmount && <p className="mt-2 text-xs text-red-300">Amount must be greater than zero and no more than your available balance.</p>}
              </div>
              <div><label htmlFor="withdraw-address" className="mb-2 block text-sm font-medium text-slate-300">Destination address</label><Input id="withdraw-address" value={address} onChange={(event) => setAddress(event.target.value)} disabled={submitting} placeholder={`Enter ${selected?.currency} wallet address`} className="border-white/10 bg-black/20 text-white" /></div>
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100/80">Check the address and network carefully. Withdrawals are sent for processing immediately and may not be reversible. Network and processing fees are applied by the wallet service.</div>
              <Button type="submit" disabled={!canSubmit} isLoading={submitting} className="w-full bg-indigo-500 hover:bg-indigo-400"><Send className="mr-2 h-4 w-4" />{submitting ? 'Submitting withdrawal...' : 'Submit withdrawal'}</Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
