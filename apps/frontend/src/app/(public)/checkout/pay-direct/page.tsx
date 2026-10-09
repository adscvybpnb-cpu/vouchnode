'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { Check, ChevronRight, Clipboard, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { orderService } from '@/services/order.service';
import { useSocket } from '@/hooks/useSocket';

const DEFAULT_CRYPTO_PRECISION: Record<string, number> = {
  BTC: 8,
  BCH: 8,
  LTC: 8,
  TRX: 6,
  SOL: 6,
  BNB: 6,
  ETH: 6,
  USDT: 6,
  USDC: 6,
};

function formatCryptoDisplayAmount(value: number | null | undefined, assetSymbol?: string, assetNetwork?: string, maxPlaces = 6) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0';
  const symbol = (assetSymbol || '').toUpperCase();
  const network = (assetNetwork || '').toUpperCase();
  const precision = DEFAULT_CRYPTO_PRECISION[symbol] ?? DEFAULT_CRYPTO_PRECISION[network] ?? maxPlaces;
  const rounded = Number(value.toFixed(precision));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(precision).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function isCheckoutPaymentComplete(status: { orderStatus: string; paymentStatus: string }) {
  return status.paymentStatus === 'COMPLETED' ||
    ['PAID', 'DELIVERED', 'WAITING_BUYER_CONFIRMATION', 'DISPUTE_OPEN',
      'DISPUTED_WAITING_SELLER', 'DISPUTED_WAITING_BUYER', 'ESCALATED_TO_ADMIN', 'COMPLETED'].includes(status.orderStatus);
}

type PaymentAsset = {
  id: string;
  symbol: string;
  name: string;
  network: string;
  networkDetail: string;
  color: string;
  icon: string;
};

const stablecoinNetworks = [
  ['trc20', 'TRC-20', 'Tron'],
  ['bep20', 'BEP-20', 'BNB Smart Chain'],
  ['erc20', 'ERC-20', 'Ethereum'],
  ['polygon', 'Polygon', 'Polygon'],
  ['arbitrum-one', 'Arbitrum One', 'Arbitrum'],
  ['base', 'Base', 'Base'],
  ['optimism', 'Optimism', 'Optimism'],
  ['solana', 'Solana', 'Solana'],
] as const;

function createStablecoinAssets(symbol: 'USDT' | 'USDC', name: string, color: string) {
  return stablecoinNetworks.map(([networkId, network, networkDetail]) => ({
    id: `${symbol.toLowerCase()}-${networkId}`,
    symbol,
    name,
    network,
    networkDetail,
    color,
    icon: '$',
  }));
}

const assets: PaymentAsset[] = [
  ...createStablecoinAssets('USDT', 'Tether', 'from-emerald-400 to-teal-500'),
  ...createStablecoinAssets('USDC', 'USD Coin', 'from-blue-400 to-indigo-500'),
  { id: 'btc-native', symbol: 'BTC', name: 'Bitcoin', network: 'Native', networkDetail: 'Bitcoin network', color: 'from-orange-400 to-amber-500', icon: '₿' },
  { id: 'eth-native', symbol: 'ETH', name: 'Ethereum', network: 'Native', networkDetail: 'Ethereum network', color: 'from-indigo-300 to-violet-500', icon: '◆' },
  { id: 'bnb-native', symbol: 'BNB', name: 'BNB', network: 'Native', networkDetail: 'BNB Smart Chain', color: 'from-yellow-300 to-amber-500', icon: '◆' },
  { id: 'sol-native', symbol: 'SOL', name: 'Solana', network: 'Native', networkDetail: 'Solana network', color: 'from-fuchsia-400 to-cyan-400', icon: '≋' },
  { id: 'ltc-native', symbol: 'LTC', name: 'Litecoin', network: 'Native', networkDetail: 'Litecoin network', color: 'from-sky-300 to-blue-500', icon: 'Ł' },
  { id: 'bch-native', symbol: 'BCH', name: 'Bitcoin Cash', network: 'Native', networkDetail: 'Bitcoin Cash network', color: 'from-green-300 to-emerald-500', icon: '₿' },
  { id: 'trx-native', symbol: 'TRX', name: 'TRON', network: 'Native', networkDetail: 'TRON network', color: 'from-red-400 to-rose-600', icon: 'T' },
];

function PayDirectPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60 * 60);
  const [qrCode, setQrCode] = useState('');
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);
  const [checkoutOrderId, setCheckoutOrderId] = useState<string | null>(null);
  const [paymentAddress, setPaymentAddress] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'PENDING' | 'PAID' | 'EXPIRED'>('PENDING');
  const [cryptoAmount, setCryptoAmount] = useState<number | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [checkoutError, setCheckoutError] = useState('');
  const [startingCheckout, setStartingCheckout] = useState(false);
  const { socket, isConnected } = useSocket('/chat');
  const redirectedOrderIdRef = useRef<string | null>(null);
  const price = Number(searchParams.get('price')) || 0;
  const selected = assets.find((asset) => asset.id === selectedAsset) || null;
  const depositAddress = paymentAddress;
  const formattedCryptoAmount = useMemo(
    () => formatCryptoDisplayAmount(cryptoAmount ?? null, selected?.symbol, selected?.network),
    [cryptoAmount, selected?.network, selected?.symbol],
  );

  useEffect(() => {
    if (!showInvoice || !depositAddress) return;
    setSecondsRemaining(60 * 60);
    setCopied(false);
    void QRCode.toDataURL(depositAddress, {
      width: 280,
      margin: 2,
      color: { dark: '#111827', light: '#FFFFFF' },
    }).then(setQrCode);
  }, [depositAddress, showInvoice]);

  useEffect(() => {
    if (!showInvoice || paymentStatus !== 'PENDING' || secondsRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsRemaining((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [paymentStatus, showInvoice, secondsRemaining]);

  useEffect(() => {
    if (paymentStatus !== 'PENDING') setSecondsRemaining(0);
  }, [paymentStatus]);

  useEffect(() => {
    if (!showInvoice || !checkoutSessionId || paymentStatus !== 'PENDING') return;
    let active = true;
    const checkPaymentStatus = async () => {
      try {
        const status = await orderService.getDirectCheckoutStatus(checkoutSessionId);
        if (!active) return;
        if (isCheckoutPaymentComplete(status)) {
          setSecondsRemaining(0);
          setPaymentStatus('PAID');
          return;
        }
        if (['EXPIRED', 'CANCELLED'].includes(status.sessionStatus)) {
          setSecondsRemaining(0);
          setPaymentStatus('EXPIRED');
        }
      } catch (error) {
        if (active && error instanceof Error && error.message !== 'Cannot connect to backend API server') {
          setCheckoutError(error.message);
        }
      }
    };
    void checkPaymentStatus();
    const poller = window.setInterval(() => void checkPaymentStatus(), 4000);
    return () => {
      active = false;
      window.clearInterval(poller);
    };
  }, [checkoutSessionId, paymentStatus, showInvoice]);

  useEffect(() => {
    if (paymentStatus !== 'PAID' || !checkoutOrderId || redirectedOrderIdRef.current === checkoutOrderId) return;
    redirectedOrderIdRef.current = checkoutOrderId;
    setSecondsRemaining(0);
    router.replace(`/dashboard/orders/${encodeURIComponent(checkoutOrderId)}`);
  }, [checkoutOrderId, paymentStatus, router]);

  useEffect(() => {
    if (!showInvoice || !checkoutOrderId || !socket || !isConnected) return;
    const handleOrderUpdate = (update: { orderId?: string; status?: string; paymentStatus?: string }) => {
      if (update.orderId !== checkoutOrderId) return;
      const nextStatus = String(update.status || update.paymentStatus || '').toUpperCase();
      if (nextStatus === 'PAID' || nextStatus === 'COMPLETED') {
        setPaymentStatus('PAID');
      }
    };
    socket.on('order_updated', handleOrderUpdate);
    socket.emit('join_order', checkoutOrderId, (response: { ok: boolean }) => {
      if (!response.ok || !checkoutSessionId) return;
      void orderService.getDirectCheckoutStatus(checkoutSessionId).then((status) => {
        if (isCheckoutPaymentComplete(status)) setPaymentStatus('PAID');
      }).catch((error: unknown) => {
        setCheckoutError(error instanceof Error ? error.message : 'Unable to verify payment status.');
      });
    });
    return () => {
      socket.emit('leave_order', checkoutOrderId);
      socket.off('order_updated', handleOrderUpdate);
    };
  }, [checkoutOrderId, checkoutSessionId, isConnected, showInvoice, socket]);

  const copyAddress = async () => {
    if (!depositAddress) return;
    await navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const backendNetworkFor = (asset: PaymentAsset) => {
    if (asset.network !== 'Native') return asset.network;
    const nativeNetworks: Record<string, string> = {
      BTC: 'BTC',
      ETH: 'ERC20',
      BNB: 'BEP20',
      SOL: 'SOLANA',
      LTC: 'LTC',
      BCH: 'BCH',
      TRX: 'TRC20',
    };
    return nativeNetworks[asset.symbol] || asset.network;
  };

  const startDirectCheckout = async () => {
    const productId = searchParams.get('productId');
    if (!selected || showInvoice || startingCheckout) return;
    if (!productId) {
      setCheckoutError('This checkout is missing a product reference. Please return to the listing and try again.');
      return;
    }
    setCheckoutError('');
    setStartingCheckout(true);
    try {
      redirectedOrderIdRef.current = null;
      setPaymentStatus('PENDING');
      const session = await orderService.createDirectCheckout(
        productId,
        selected.symbol,
        backendNetworkFor(selected),
      );
      setCheckoutSessionId(session.sessionId);
      setCheckoutOrderId(session.orderId);
      setPaymentAddress(session.address);
      setCryptoAmount(session.amount);
      setExchangeRate(session.exchangeRate);
      setShowInvoice(true);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Unable to start payment checkout.');
    } finally {
      setStartingCheckout(false);
    }
  };

  const formattedTime = `${String(Math.floor(secondsRemaining / 60)).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`;

  if (showInvoice && selected) {
    return (
      <main className="min-h-screen bg-[#0A0A0F] px-4 py-10 text-white sm:py-16">
        <section className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-[#141420] p-6 shadow-2xl sm:p-10">
          <div className="flex items-center justify-between border-b border-white/10 pb-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-black">G</span>
              <div><p className="font-bold text-white">VouchNode</p><p className="text-xs text-slate-500">Secure payment invoice</p></div>
            </div>
            <div className="text-right"><p className="text-xs uppercase tracking-wider text-slate-500">Total order price</p><p className="text-2xl font-bold text-white">{price.toFixed(2)} USD</p></div>
          </div>
          <div className="mt-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">Payment invoice</p>
            <h1 className="mt-3 text-3xl font-bold">Send {selected.symbol}</h1>
            <p className="mt-2 text-sm text-slate-400">{selected.name} · {selected.network} ({selected.networkDetail})</p>
          </div>
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-200">Please send</p>
            <p className="mt-2 text-2xl font-bold text-white">{formattedCryptoAmount} {selected.symbol}</p>
            {exchangeRate && exchangeRate !== 1 && <p className="mt-1 text-xs text-slate-400">Locked rate: 1 {selected.symbol} = {exchangeRate.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</p>}
          </div>
          <div className="mt-8 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-5">
            <p className="text-sm font-medium text-indigo-100">Please send to address:</p>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-indigo-300/40 bg-[#0b0d15] p-2">
              <code className="min-w-0 flex-1 break-all px-2 text-xs leading-6 text-slate-200">{depositAddress}</code>
              <button type="button" onClick={() => void copyAddress()} aria-label="Copy deposit address" className="shrink-0 rounded-lg bg-indigo-500 p-2.5 text-white transition hover:bg-indigo-400">
                {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">{copied ? 'Address copied to clipboard.' : 'Only send funds using the selected network.'}</p>
          </div>
          <div className="mt-10 flex flex-col items-center">
            <div className="flex justify-center rounded-2xl bg-white p-4">
              {qrCode ? <img src={qrCode} alt={`QR code for ${selected.symbol} payment address`} className="h-56 w-56" /> : <div className="h-56 w-56 animate-pulse bg-slate-200" />}
            </div>
            <div className="mt-8 flex w-full max-w-xl flex-col gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-center">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Payment status</p>
                <p className={`mt-3 flex items-center justify-center gap-2 font-semibold ${paymentStatus === 'PAID' ? 'text-emerald-300' : paymentStatus === 'EXPIRED' ? 'text-rose-300' : 'text-amber-200'}`}>
                  <span className={`h-2 w-2 rounded-full ${paymentStatus === 'PAID' ? 'bg-emerald-300' : paymentStatus === 'EXPIRED' ? 'bg-rose-300' : 'animate-pulse bg-amber-300'}`} />
                  {paymentStatus === 'PAID' ? 'Payment confirmed and order paid.' : paymentStatus === 'EXPIRED' ? 'Invoice expired. The reserved item is available again.' : 'Scanning blockchain network...'}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-center">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Time Remaining</p>
                <p className="mt-2 font-mono text-3xl font-bold text-white">{formattedTime}</p>
              </div>
            </div>
            {paymentStatus === 'PAID' && (
              <div className="mt-6 w-full max-w-xl rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Digital delivery ready</p>
                <p className="mt-3 text-sm text-emerald-100">Payment confirmed and held in escrow. Open the secure order conversation to review your delivery and release funds when satisfied.</p>
                {checkoutOrderId && <Button type="button" onClick={() => window.location.assign(`/dashboard/orders/${checkoutOrderId}`)} className="mt-4 bg-indigo-600 text-white hover:bg-indigo-500">Access Gift Card &amp; Order Chat</Button>}
              </div>
            )}
            {checkoutError && <p className="mt-4 text-center text-sm text-red-300">{checkoutError}</p>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0A0A0F] px-4 py-8 text-white sm:py-12">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl border border-white/10 bg-[#141420] p-5 shadow-2xl shadow-black/20 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-300">Order total</p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {price > 0 ? `${price.toFixed(2)} USD` : 'Order total'}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {selected
                  ? `${selected.symbol} · ${selected.network} selected`
                  : 'Select a cryptocurrency and network below to continue.'}
              </p>
            </div>
            <Button
              type="button"
              disabled={!selectedAsset || startingCheckout}
              onClick={() => void startDirectCheckout()}
              className="h-12 w-full bg-indigo-600 px-8 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none sm:w-auto"
            >
              {startingCheckout ? 'Preparing invoice...' : 'Pay Now'} <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-300">Direct payment</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Choose a payment network</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Select the asset and network you want to use. Make sure the network matches the address shown on the next step.</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Secure checkout</div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((asset) => {
            const isSelected = selectedAsset === asset.id;
            return (
              <button
                key={asset.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedAsset(asset.id)}
                className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 ${
                  isSelected
                    ? 'border-indigo-400 bg-indigo-500/15 shadow-[0_0_24px_rgba(99,102,241,0.28)]'
                    : 'border-white/10 bg-black/10 hover:-translate-y-0.5 hover:border-indigo-400/50 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${asset.color} text-lg font-black text-slate-950 shadow-lg`}>
                    {asset.icon}
                  </span>
                  {isSelected ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-400 text-slate-950"><Check className="h-4 w-4" /></span> : <ChevronRight className="h-5 w-5 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-indigo-300" />}
                </div>
                <div className="mt-4">
                  <p className="font-bold text-white">{asset.symbol}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{asset.name}</p>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-slate-200">{asset.network}</span>
                  <span className="truncate text-[10px] text-slate-500">{asset.networkDetail}</span>
                </div>
              </button>
            );
          })}
          </div>

          <div className="mt-6 text-xs text-slate-500">
            {selectedAsset ? 'Payment network selected. Continue when you are ready.' : 'Choose an asset and network to continue.'}
          </div>
          {checkoutError && <p className="mt-3 text-sm text-red-300">{checkoutError}</p>}
        </section>
      </div>
    </main>
  );
}

export default function PayDirectPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#0A0A0F]" />}>
      <PayDirectPageContent />
    </Suspense>
  );
}
