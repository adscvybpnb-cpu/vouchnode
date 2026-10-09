'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Clipboard, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { walletService, type DepositNetwork } from '@/services/wallet.service';

type DepositAsset = {
  code: string;
  name: string;
  network: DepositNetwork;
};

type DepositSession = Awaited<ReturnType<typeof walletService.createDepositSession>>;

const NETWORKS: Array<{ value: DepositNetwork; label: string }> = [
  { value: 'TRC20', label: 'TRC-20 (Tron)' },
  { value: 'BEP20', label: 'BEP-20 (BNB Smart Chain)' },
  { value: 'ERC20', label: 'ERC-20 (Ethereum)' },
  { value: 'POLYGON', label: 'Polygon' },
  { value: 'ARBITRUM_ONE', label: 'Arbitrum One' },
  { value: 'BASE', label: 'Base' },
  { value: 'OPTIMISM', label: 'Optimism' },
  { value: 'SOLANA', label: 'Solana' },
  { value: 'BTC', label: 'Bitcoin' },
  { value: 'BCH', label: 'Bitcoin Cash' },
  { value: 'LTC', label: 'Litecoin' },
  { value: 'TON', label: 'TON' }
];

const nativeNetwork = (code: string): DepositNetwork => {
  switch (code) {
    case 'BTC': return 'BTC';
    case 'BCH': return 'BCH';
    case 'LTC': return 'LTC';
    case 'ETH':
    case 'USDC': return 'ERC20';
    case 'BNB': return 'BEP20';
    case 'SOL': return 'SOLANA';
    case 'TRX': return 'TRC20';
    case 'GRAM': return 'TON';
    default: return 'TRC20';
  }
};

export default function DepositPage() {
  const [assets, setAssets] = useState<DepositAsset[]>([]);
  const [currency, setCurrency] = useState('USDT');
  const [network, setNetwork] = useState<DepositNetwork>('TRC20');
  const [amount, setAmount] = useState('');
  const [session, setSession] = useState<DepositSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const selectedAsset = useMemo(() => assets.find((asset) => asset.code === currency), [assets, currency]);
  const availableNetworks = selectedAsset
    ? (['USDT', 'USDC'].includes(currency) ? NETWORKS.filter((item) => ['TRC20', 'BEP20', 'ERC20', 'POLYGON', 'ARBITRUM_ONE', 'BASE', 'OPTIMISM', 'SOLANA'].includes(item.value)) : NETWORKS.filter((item) => item.value === selectedAsset.network))
    : NETWORKS;

  useEffect(() => {
    let active = true;
    const loadAssets = async () => {
      setLoading(true);
      setError('');
      try {
        const supported = await walletService.getSupportedAssets();
        if (!active) return;
        const nextAssets = supported.map((asset) => ({
          code: asset.code.trim().toUpperCase(),
          name: asset.name,
          network: nativeNetwork(asset.code.trim().toUpperCase())
        }));
        setAssets(nextAssets);
        if (nextAssets.length > 0) {
          const initial = nextAssets.find((asset) => asset.code === 'USDT') || nextAssets[0];
          setCurrency(initial.code);
          setNetwork(initial.network);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load deposit assets.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadAssets();
    return () => { active = false; };
  }, []);

  const handleCurrencyChange = (value: string) => {
    setCurrency(value);
    const asset = assets.find((item) => item.code === value);
    const nextNetwork = asset?.network || 'TRC20';
    setNetwork(nextNetwork);
    setSession(null);
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError(`Enter a valid ${currency} amount.`);
      return;
    }
    setSubmitting(true);
    setError('');
    setSession(null);
    try {
      setSession(await walletService.createDepositSession(currency, network, parsedAmount));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reserve a deposit address.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyAddress = async () => {
    if (!session?.assignedAddress) return;
    try {
      await navigator.clipboard.writeText(session.assignedAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Unable to copy the address. Please copy it manually.');
    }
  };

  return (
    <main className="min-h-screen bg-[#07090f] px-4 pb-20 pt-8 text-white sm:px-6 lg:px-8">
      <section className="mx-auto max-w-2xl">
        <Link href="/dashboard/wallet" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to wallet
        </Link>
        <div className="mb-8">
          <p className="text-sm font-medium text-emerald-300">Wallet</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Deposit crypto</h1>
          <p className="mt-2 text-slate-400">Generate a dedicated deposit address for the asset and network you select.</p>
        </div>

        {error && <div role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}

        <div className="rounded-2xl border border-white/10 bg-[#141620] p-6 shadow-xl sm:p-8">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /> Loading supported assets...</div>
          ) : session ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-emerald-200">
                <div className="flex items-center gap-2 font-semibold"><Check className="h-5 w-5" /> Deposit address ready</div>
                <p className="mt-1 text-sm text-emerald-200/80">Send only {currency} on {network} to this address.</p>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Deposit address</p>
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
                  <code className="min-w-0 flex-1 break-all text-sm text-slate-200">{session.assignedAddress}</code>
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyAddress()} className="shrink-0 border-white/10 text-slate-300">
                    {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Clipboard className="mr-1.5 h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
              <p className="text-sm text-amber-200/80">Deposits are credited after network confirmation. Sending another asset or network can permanently lose funds.</p>
              <Button type="button" variant="outline" onClick={() => setSession(null)} className="border-white/10 text-slate-300">Generate another address</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label htmlFor="deposit-currency" className="mb-2 block text-sm font-medium text-slate-300">Asset</label>
                <select id="deposit-currency" value={currency} onChange={(event) => handleCurrencyChange(event.target.value)} disabled={submitting || assets.length === 0} className="w-full rounded-md border border-white/10 bg-black/20 p-3 text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {assets.map((asset) => <option key={asset.code} value={asset.code}>{asset.name} ({asset.code})</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="deposit-network" className="mb-2 block text-sm font-medium text-slate-300">Network</label>
                <select id="deposit-network" value={network} onChange={(event) => setNetwork(event.target.value as DepositNetwork)} disabled={submitting || availableNetworks.length < 2} className="w-full rounded-md border border-white/10 bg-black/20 p-3 text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {availableNetworks.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="deposit-amount" className="mb-2 block text-sm font-medium text-slate-300">Expected amount ({currency})</label>
                <Input id="deposit-amount" type="number" min="0.00000001" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={submitting || assets.length === 0} placeholder={`Enter ${currency} amount`} className="border-white/10 bg-black/20 text-white" />
              </div>
              <Button type="submit" disabled={loading || submitting || assets.length === 0} isLoading={submitting} className="w-full bg-emerald-500 text-black hover:bg-emerald-400">
                {submitting ? 'Reserving address...' : <><RefreshCw className="mr-2 h-4 w-4" />Generate deposit address</>}
              </Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
