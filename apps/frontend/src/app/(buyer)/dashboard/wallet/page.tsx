'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, Check, CircleDollarSign, Clock3, Copy, Download, Loader2, Plus, RefreshCw, Send, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/services/api.client';
import { walletService, type DepositNetwork } from '@/services/wallet.service';
import type { AssetBalance, Deposit, PortfolioSummary, Wallet } from '@/types/api.types';
import { ResponsiveRowCard } from '@/components/layout/ResponsiveRowCard';

const SUPPORTED_ASSETS = [
  { code: 'USDT', name: 'Tether', color: 'bg-emerald-500', mark: '₮' },
  { code: 'USDC', name: 'USD Coin', color: 'bg-blue-500', mark: '$' },
  { code: 'BTC', name: 'Bitcoin', color: 'bg-orange-500', mark: '₿' },
  { code: 'BNB', name: 'BNB', color: 'bg-yellow-500', mark: '◆' },
  { code: 'ETH', name: 'Ethereum', color: 'bg-indigo-500', mark: '◆' },
  { code: 'BCH', name: 'Bitcoin Cash', color: 'bg-green-500', mark: '₿' },
  { code: 'SOL', name: 'Solana', color: 'bg-fuchsia-500', mark: '≋' },
  { code: 'LTC', name: 'Litecoin', color: 'bg-slate-400', mark: 'Ł' },
  { code: 'TRX', name: 'Tron', color: 'bg-red-500', mark: 'T' },
  { code: 'GRAM', name: 'Gram', color: 'bg-sky-500', mark: 'G' }
] as const;

type Action = 'deposit' | 'withdraw' | 'swap';
type DepositResponse = Deposit & { depositAddress?: string };
type DepositSession = {
  id: string;
  assignedAddress: string;
  network: DepositNetwork;
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED';
  amount: number;
  remainingSeconds: number;
};

function DepositQrCode({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    let isActive = true;
    void import('qrcode')
      .then(({ default: QRCode }) => {
        if (!isActive || !canvasRef.current) return;
        return QRCode.toCanvas(canvasRef.current, value, {
          width: 240,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#111827', light: '#ffffff' }
        });
      })
      .catch((error: unknown) => {
        console.error('Failed to generate deposit QR code', error);
      });
    return () => {
      isActive = false;
    };
  }, [value]);

  return <canvas ref={canvasRef} aria-label="Deposit address QR code" className="h-48 w-48" />;
}

const MULTI_NETWORK_ASSETS = new Set(['USDT', 'USDC']);
const DEPOSIT_NETWORK_OPTIONS: Array<{ value: DepositNetwork; label: string }> = [
  { value: 'TRC20', label: 'TRC-20 (Tron Network)' },
  { value: 'BEP20', label: 'BEP-20 (BNB Smart Chain)' },
  { value: 'ERC20', label: 'ERC-20 (Ethereum Network)' },
  { value: 'POLYGON', label: 'Polygon (Polygon POS Network)' },
  { value: 'ARBITRUM_ONE', label: 'Arbitrum One (Arbitrum Network)' },
  { value: 'BASE', label: 'Base (Base Network)' },
  { value: 'OPTIMISM', label: 'Optimism (OP Mainnet)' },
  { value: 'SOLANA', label: 'Solana (Solana Network)' }
];

const nativeDepositNetwork = (currency: string): DepositNetwork => {
  switch (currency.trim().toUpperCase()) {
    case 'BTC': return 'BTC';
    case 'BCH': return 'BCH';
    case 'LTC': return 'LTC';
    case 'BNB': return 'BEP20';
    case 'ETH':
    case 'USDC': return 'ERC20';
    case 'SOL': return 'SOLANA';
    case 'TRX': return 'TRC20';
    case 'GRAM': return 'TON';
    default: return 'TRC20';
  }
};

export default function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [selected, setSelected] = useState<AssetBalance | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [deposit, setDeposit] = useState<DepositResponse | null>(null);
  const [depositSession, setDepositSession] = useState<DepositSession | null>(null);
  const [depositNetwork, setDepositNetwork] = useState<DepositNetwork>('TRC20');
  const [depositStep, setDepositStep] = useState<1 | 2>(1);
  const [depositAmount, setDepositAmount] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [swapTo, setSwapTo] = useState('USDT');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [swapPending, setSwapPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const loadingRef = useRef(false);

  const assets = useMemo(() => SUPPORTED_ASSETS.map((definition) => {
    const current = portfolio?.assets.find((asset) => asset.currency?.trim().toUpperCase() === definition.code);
    return current ? {
      ...current,
      availableBalance: Number.isFinite(Number(current.availableBalance)) ? Number(current.availableBalance) : 0,
      pendingBalance: Number.isFinite(Number(current.pendingBalance)) ? Number(current.pendingBalance) : 0,
      frozenBalance: Number.isFinite(Number(current.frozenBalance)) ? Number(current.frozenBalance) : 0,
      totalBalance: Number.isFinite(Number(current.totalBalance)) ? Number(current.totalBalance) : 0,
      usdValue: Number.isFinite(Number(current.usdValue)) ? Number(current.usdValue) : 0
    } : {
      id: `empty-${definition.code}`,
      currency: definition.code,
      walletType: 'INTERNAL',
      availableBalance: 0,
      pendingBalance: 0,
      frozenBalance: 0,
      totalBalance: 0,
      usdValue: 0,
      isPrimary: false,
      network: definition.code === 'USDT' ? 'TRC20' : 'mainnet'
    };
  }), [portfolio]);
  const totalValue = Number(portfolio?.totalUsdBalance ?? wallet?.totalUsdBalance ?? 0);
  const total = Number.isFinite(totalValue) ? totalValue : 0;
  const depositAddress = deposit?.address || deposit?.depositAddress || '';
  const sessionAddress = depositSession?.assignedAddress || '';
  const activeDepositAddress = sessionAddress || depositAddress;

  const load = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const [base, next] = await Promise.all([apiClient.get<Wallet>('/wallet'), walletService.getPortfolio()]);
      if (base.error) throw new Error(base.error);
      setWallet(base.data || null);
      setPortfolio(next);
      window.dispatchEvent(new Event('wallet:updated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load wallet.');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const refreshAfterP2PCompletion = () => void load();
    window.addEventListener('p2p:wallet-updated', refreshAfterP2PCompletion);
    return () => window.removeEventListener('p2p:wallet-updated', refreshAfterP2PCompletion);
  }, []);

  const openDeposit = async (asset: AssetBalance) => {
    setSelected(asset);
    setAction('deposit');
    setDeposit(null);
    setDepositSession(null);
    setSecondsRemaining(0);
    setDepositStep(1);
    setDepositAmount('');
    setError('');
    setDepositNetwork(nativeDepositNetwork(asset.currency));
  };

  const reserveDeposit = async () => {
    setDepositSession(null);
    setSecondsRemaining(0);
    setError('');
    setBusy(true);
    try {
      const parsedAmount = Number(depositAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error(`Enter a valid ${selected?.currency || 'crypto'} amount.`);
      }
      if (!selected) throw new Error('Select an asset to deposit.');
      const session = await walletService.generateDeposit(selected.currency, depositNetwork, parsedAmount);
      setDepositSession(session);
      setDepositStep(2);
      setSecondsRemaining(session.remainingSeconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reserve a deposit address.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!depositSession) return;
    const timer = window.setInterval(() => {
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [depositSession]);

  const countdown = `${Math.floor(secondsRemaining / 60).toString().padStart(2, '0')}:${(secondsRemaining % 60).toString().padStart(2, '0')}`;

  const openAction = (asset: AssetBalance, nextAction: Action) => {
    setSelected(asset);
    setAction(nextAction);
    setAmount('');
    setAddress('');
    setError('');
  };

  const dismissAction = () => {
    setAction(null);
    setSelected(null);
    setDeposit(null);
    setDepositSession(null);
    setDepositNetwork('TRC20');
    setDepositStep(1);
    setDepositAmount('');
    setSecondsRemaining(0);
    setAmount('');
    setAddress('');
    setCopied(false);
    setCopiedAmount(false);
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !action) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (action === 'withdraw') {
        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) * 1.01 > (selected.availableBalance ?? 0)) {
          throw new Error('Insufficient funds including the 1% platform fee.');
        }
        await walletService.withdraw({ currency: selected.currency, amount: Number(amount), destinationAddress: address, network: selected.network ?? undefined });
        setMessage(`${selected.currency} withdrawal submitted for review.`);
      } else if (action === 'swap') {
        const result = await walletService.swapAsset(selected.currency, swapTo, Number(amount));
        setMessage(`Converted ${result.amount} ${result.fromAsset} to ${result.receivedAmount} ${result.toAsset} at the live rate.`);
        window.dispatchEvent(new Event('wallet:updated'));
      }
      setAction(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet action failed.');
    } finally {
      setBusy(false);
    }
  };

  const copyDepositAddress = async () => {
    if (!activeDepositAddress) return;
    await navigator.clipboard.writeText(activeDepositAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const copyDepositAmount = async () => {
    if (!depositAmount) return;
    try {
      await navigator.clipboard.writeText(depositAmount);
      setCopiedAmount(true);
      window.setTimeout(() => setCopiedAmount(false), 1500);
    } catch {
      setError('Unable to copy the amount. Please copy it manually.');
    }
  };

  const confirmDeposit = () => {
    dismissAction();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 text-white">
      <div className="flex min-w-0 flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-emerald-300">Finance</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Wallet</h1><p className="mt-2 text-slate-400">Manage ten supported assets with protected internal transfers.</p></div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Link href="/dashboard/wallet/transactions" className="inline-flex items-center rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white">Transaction history</Link>
          <Button variant="outline" onClick={() => void load()} className="border-white/10 text-slate-300 hover:bg-white/5"><RefreshCw className="mr-2 h-4 w-4" />Refresh balances</Button>
        </div>
      </div>
      {(message || error) && <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}`}>{error || message}</div>}

      <section className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-[#17251f] via-[#111a19] to-[#11131c] p-4 shadow-2xl shadow-black/20 sm:p-7">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative"><div className="flex items-center gap-2 text-emerald-300"><CircleDollarSign className="h-5 w-5" /><span className="text-sm font-medium">Total Wallet Balance</span></div><p className="mt-4 break-words text-4xl font-bold tracking-tight sm:text-5xl">{loading ? '—' : `$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} <span className="text-lg font-medium text-slate-400">USD</span></p><p className="mt-3 text-sm text-slate-400">Live estimated value across your available, escrowed, and supported assets.</p><div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-300"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />Escrow protected</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">9 supported assets</span></div></div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#141620] shadow-xl shadow-black/10">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5"><div><h2 className="text-lg font-semibold">Supported assets</h2><p className="mt-1 text-xs text-slate-500">Supported currencies for your wallet.</p></div><span className="text-xs uppercase tracking-[0.18em] text-slate-500">10 assets</span></div>
        <div className="divide-y divide-white/5">
          {assets.map((asset) => {
            const definition = SUPPORTED_ASSETS.find((item) => item.code === asset.currency)!;
            return <ResponsiveRowCard key={asset.currency} className="transition hover:bg-white/[0.03]">
              <div className="flex flex-wrap items-center gap-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${definition.color} text-lg font-bold text-white shadow-lg`}>{definition.mark}</div>
                <div className="min-w-[160px] flex-1"><div className="flex items-center gap-2"><p className="font-semibold">{definition.name}</p><span className="text-xs text-slate-500">{asset.currency}</span></div><p className="mt-1 text-sm text-slate-300">{(asset.availableBalance ?? 0).toFixed(8)} {asset.currency}</p><p className="mt-1 flex items-center gap-1 text-xs text-amber-300/80"><Clock3 className="h-3 w-3" />Escrowed {(asset.pendingBalance ?? 0).toFixed(8)} {asset.currency}</p></div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end lg:flex-nowrap"><Button size="sm" onClick={() => void openDeposit(asset)} className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"><Plus className="mr-1.5 h-3.5 w-3.5" />Deposit</Button><Button size="sm" variant="outline" onClick={() => openAction(asset, 'withdraw')} className="border-white/10 text-slate-300 hover:bg-white/5"><Send className="mr-1.5 h-3.5 w-3.5" />Withdraw</Button><Button size="sm" variant="outline" onClick={() => openAction(asset, 'swap')} className="border-indigo-400/20 text-indigo-300 hover:bg-indigo-400/10"><ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />Swap/Convert</Button></div>
            </ResponsiveRowCard>;
          })}
        </div>
      </section>

      {action && selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#141620] p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-indigo-300">{action}</p><h2 className="mt-1 text-xl font-semibold">{action === 'deposit' ? `Deposit ${selected.currency}` : action === 'withdraw' ? `Withdraw ${selected.currency}` : `Convert ${selected.currency}`}</h2></div><button type="button" onClick={dismissAction} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button></div>
          {action === 'deposit' ? <div className="space-y-5">
            {depositStep === 1 && <><div><label className="mb-2 block text-sm font-medium text-slate-300" htmlFor="deposit-amount">Amount ({selected.currency})</label><Input id="deposit-amount" required min="0.00000001" step="any" type="number" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder={`Enter ${selected.currency} amount to deposit`} className="border-white/10 bg-black/20 text-white" /></div>{MULTI_NETWORK_ASSETS.has(selected.currency) ? <div><label className="mb-2 block text-sm font-medium text-slate-300" htmlFor="deposit-network">Network</label><select id="deposit-network" value={depositNetwork} onChange={(event) => setDepositNetwork(event.target.value as DepositNetwork)} style={{ colorScheme: 'dark' }} className="w-full rounded-md border border-white/10 bg-[#141620] p-2.5 text-sm text-white [&>option]:bg-[#141620] [&>option]:text-white [&>option:checked]:bg-indigo-600 [&>option:hover]:bg-indigo-500">{DEPOSIT_NETWORK_OPTIONS.map((option) => <option key={option.value} value={option.value} className="bg-[#141620] text-white">{option.label}</option>)}</select></div> : <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300">Native network: <span className="font-medium text-white">{depositNetwork}</span></p>}<Button type="button" onClick={() => void reserveDeposit()} isLoading={busy} className="w-full bg-indigo-500 hover:bg-indigo-400">Confirm deposit</Button></>}
            {depositStep === 2 && <><div className="flex justify-center rounded-xl bg-white p-4">{activeDepositAddress ? <DepositQrCode value={activeDepositAddress} /> : <Loader2 className="h-10 w-10 animate-spin text-slate-500" />}</div><div><p className="mb-2 text-xs font-medium text-slate-400">Unique wallet address ({depositNetwork})</p><div className="flex gap-2"><code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-200">{activeDepositAddress}</code><Button type="button" size="icon" variant="outline" aria-label={copied ? 'Address copied' : 'Copy deposit address'} disabled={!activeDepositAddress} onClick={() => void copyDepositAddress()}>{copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}</Button></div></div><div><p className="mb-2 text-xs font-medium text-slate-400">Exact deposit amount ({selected.currency})</p><div className="flex gap-2"><code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-black/20 p-3 text-sm font-semibold tabular-nums text-slate-100">{depositAmount}</code><Button type="button" size="icon" variant="outline" aria-label={copiedAmount ? 'Amount copied' : 'Copy deposit amount'} disabled={!depositAmount} onClick={() => void copyDepositAmount()}>{copiedAmount ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}</Button></div></div><div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center"><p className="text-3xl font-bold tabular-nums text-red-300">{countdown}</p><p className="mt-1 text-xs uppercase tracking-wider text-red-200/80">Address reservation remaining</p></div><p className="text-sm font-medium leading-5 text-red-300">Please send the exact amount within 60 minutes. This address is uniquely generated for this transaction; do not send funds after the timer expires.</p><Button type="button" onClick={confirmDeposit} className="w-full bg-emerald-500 font-semibold text-black hover:bg-emerald-400">Confirm Deposit</Button></>}
          </div> :           <form onSubmit={submit} className="space-y-4"><Input required min="0.00000001" step="any" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={`Amount in ${selected.currency}`} className="border-white/10 bg-black/20 text-white" />{action === 'withdraw' ? <><Input required value={address} onChange={(event) => setAddress(event.target.value)} placeholder={`${selected.currency} destination address`} className="border-white/10 bg-black/20 text-white" /><p className="text-xs text-slate-500">A 1% platform fee is added to the requested amount before funds are locked.</p></> : <><select value={swapTo} onChange={(event) => setSwapTo(event.target.value)} className="w-full rounded-md border border-white/10 bg-black/20 p-2.5 text-sm text-white">{SUPPORTED_ASSETS.filter((asset) => asset.code !== selected.currency).map((asset) => <option key={asset.code} value={asset.code}>{asset.name} ({asset.code})</option>)}</select><p className="text-xs text-slate-500">Live rate and conversion amount are locked atomically when you confirm.</p></> }<Button type="submit" isLoading={busy} disabled={action === 'withdraw' && Number(amount) * 1.01 > selected.availableBalance} className="w-full bg-indigo-500 hover:bg-indigo-400">{action === 'withdraw' ? <><Download className="mr-2 h-4 w-4" />Submit withdrawal</> : <><ArrowRightLeft className="mr-2 h-4 w-4" />Convert asset</>}</Button>{action === 'withdraw' && Number(amount) * 1.01 > selected.availableBalance && <p className="text-sm text-red-300">Insufficient funds including the 1% platform fee.</p>}{error && <p className="text-sm text-red-300">{error}</p>}</form>}
        </div>
      </div>}
    </div>
  );
}
