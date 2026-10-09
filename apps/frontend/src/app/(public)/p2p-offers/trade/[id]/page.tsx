'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { p2pService, type P2POffer } from '@/services/p2p.service';
import { OfferTerms } from '@/components/p2p/OfferTerms';

export default function P2PTradePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [offer, setOffer] = useState<P2POffer | null>(null);
  const [giftCardValue, setGiftCardValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tradeError, setTradeError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  useEffect(() => {
    const offerId = typeof params.id === 'string' ? params.id : '';
    if (!offerId) {
      setError('Offer not found.');
      setLoading(false);
      return;
    }

    void p2pService.getOffer(offerId)
      .then(setOffer)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load offer.'))
      .finally(() => setLoading(false));
  }, [params.id]);

  const cryptoAmount = useMemo(() => {
    const value = Number(giftCardValue);
    if (!offer || !Number.isFinite(value) || value < 0 || !offer.cryptoUsdPrice) return '';
    const payoutUSD = value * offer.giftCardRate;
    const precision = ({ USDT: 6, BTC: 8, ETH: 18, BNB: 18, SOL: 9, LTC: 8 } as const)[
      offer.cryptoCurrency as 'USDT' | 'BTC' | 'ETH' | 'BNB' | 'SOL' | 'LTC'
    ] ?? 8;
    return (payoutUSD / offer.cryptoUsdPrice).toFixed(precision);
  }, [giftCardValue, offer]);

  const initiateTrade = async () => {
    const amountUSD = Number(giftCardValue);
    const effectiveMax = offer!.effectiveMax ?? offer!.maxLimit;
    if (!Number.isFinite(amountUSD) || amountUSD < offer!.minLimit || amountUSD > effectiveMax) {
      setTradeError(`Enter a gift card value between ${offer!.minLimit.toFixed(2)} and ${effectiveMax.toFixed(2)} USD.`);
      return;
    }
    setTradeError('');
    setShowConfirmation(true);
  };

  const confirmTrade = async () => {
    const amountUSD = Number(giftCardValue);
    const effectiveMax = offer?.effectiveMax ?? offer?.maxLimit ?? 0;
    if (!offer || !Number.isFinite(amountUSD) || amountUSD < offer.minLimit || amountUSD > effectiveMax) {
      setTradeError("The gift card value is no longer within this offer's limits. Review the offer and try again.");
      setShowConfirmation(false);
      return;
    }
    setSubmitting(true);
    setTradeError('');
    try {
      const result = await p2pService.createOrder({ offerId: offer!.id, giftCardValueUSD: amountUSD });
      const orderPath = `/p2p-offers/order/${encodeURIComponent(result.order.id)}`;
      setShowConfirmation(false);
      router.push(orderPath);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to initiate the trade.';
      if (/balance has changed|insufficient available crypto balance/i.test(message)) {
        try {
          const refreshedOffer = await p2pService.getOffer(offer.id);
          setOffer(refreshedOffer);
          const refreshedMax = refreshedOffer.effectiveMax ?? refreshedOffer.maxLimit;
          setTradeError(`The merchant's available balance changed. Current trade limits are ${refreshedOffer.minLimit.toFixed(2)} - ${refreshedMax.toFixed(2)} USD.`);
        } catch (refreshCause) {
          const refreshMessage = refreshCause instanceof Error ? refreshCause.message : 'Unable to refresh the offer.';
          setTradeError(`${message} ${refreshMessage}`);
        }
      } else {
        setTradeError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <main className="min-h-screen bg-[#07090f] p-6 text-center text-slate-400">Loading trade offer...</main>;
  }

  if (error || !offer) {
    return <main className="min-h-screen bg-[#07090f] p-6 text-center text-red-200">{error || 'Offer not found.'}</main>;
  }

  return (
    <main className="min-h-screen bg-[#07090f] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/p2p-offers" className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to P2P offers
        </Link>
        <header className="mt-6 flex items-center gap-4 rounded-2xl border border-white/10 bg-[#11141d] p-5 shadow-2xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-xl font-black text-slate-950">{offer.merchantName.charAt(0).toUpperCase()}</div>
          <div>
            <h1 className="text-xl font-black">@{offer.username}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-400"><span className={`h-2 w-2 rounded-full ${offer.isOnline ? 'bg-emerald-400' : 'bg-slate-600'}`} />{offer.isOnline ? 'Online' : 'Offline'}</div>
          </div>
        </header>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 shadow-2xl sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-sm text-slate-500">Merchant</p>
                <p className="mt-1 text-sm text-slate-400">{offer.tradeVolume.toLocaleString()} trades · {offer.completionRate.toFixed(1)}% completion</p>
              </div>
              <div className="text-right"><p className="text-xs uppercase tracking-wider text-slate-500">Payout Rate</p><p className="mt-1 text-2xl font-black">${offer.giftCardRate.toFixed(4)} USD</p><p className="text-xs text-slate-500">per $1 card value</p></div>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-300">Gift Card Value (USD)<input type="number" min={offer.minLimit} max={offer.effectiveMax ?? offer.maxLimit} step="0.01" value={giftCardValue} onChange={(event) => setGiftCardValue(event.target.value)} placeholder={`${offer.minLimit.toFixed(2)} - ${(offer.effectiveMax ?? offer.maxLimit).toFixed(2)}`} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b0d14] p-4 text-lg text-white outline-none focus:border-emerald-400" /></label>
              <label className="text-sm font-semibold text-slate-300">Estimated Crypto ({offer.cryptoCurrency})<input type="text" value={cryptoAmount} readOnly placeholder="Calculating live quote..." className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 p-4 text-lg text-emerald-300 outline-none" /></label>
            </div>
            <p className="mt-3 text-xs text-slate-500">Final payout and crypto amount are calculated and locked by the server using its live spot quote when you confirm.</p>
            <p className="mt-4 text-xs text-slate-500">Limits: {offer.minLimit.toFixed(2)} - {(offer.effectiveMax ?? offer.maxLimit).toFixed(2)} USD · Avg. Release Time: {offer.avgReleaseMinutes > 0 ? `${offer.avgReleaseMinutes} mins` : 'No completed trades'}</p>
            {tradeError && <p className="mt-4 text-sm text-red-300">{tradeError}</p>}
            <button type="button" onClick={() => void initiateTrade()} disabled={submitting} className="mt-8 w-full rounded-xl bg-blue-500 px-5 py-4 text-lg font-bold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? 'Starting trade...' : `${offer.tradeType === 'BUY' ? 'Buy Crypto' : 'Sell Crypto'} with 0 fees`}</button>
          </section>
          <aside className="space-y-6">
            <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 shadow-2xl">
              <h2 className="text-lg font-bold">Trading Information</h2>
              <div className="mt-5 divide-y divide-white/5">
                <div className="flex justify-between gap-4 py-4 text-sm"><span className="text-slate-500">Payment Window</span><span className="font-semibold text-white">30 minutes</span></div>
                <div className="flex justify-between gap-4 py-4 text-sm"><span className="text-slate-500">Payment Method</span><span className="text-right font-semibold text-white">{offer.giftCardType}</span></div>
                <div className="flex justify-between gap-4 py-4 text-sm"><span className="text-slate-500">Asset</span><span className="font-semibold text-white">{offer.cryptoCurrency}</span></div>
              </div>
            </section>
            <section className="rounded-2xl border border-white/10 bg-[#11141d] p-6 shadow-2xl">
              <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="h-5 w-5 text-emerald-400" /> Offer Terms</h2>
              <OfferTerms className="mt-4" terms={offer.terms || 'The merchant has not provided additional terms.'} />
            </section>
          </aside>
        </div>
      </div>
      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#11141d] p-6 shadow-2xl">
            <h2 className="text-xl font-bold">Confirm Trade</h2>
            <div className="mt-5 space-y-3 rounded-xl bg-white/5 p-4 text-sm">
              <p>Gift Card Face Value: <span className="font-bold">{Number(giftCardValue).toFixed(2)} USD {offer.giftCardType}</span></p>
              <p>Merchant Payout: <span className="font-bold">${(Number(giftCardValue) * offer.giftCardRate).toFixed(2)} USD</span></p>
              <p>Estimated Escrow: <span className="font-bold text-emerald-300">{cryptoAmount} {offer.cryptoCurrency}</span></p>
            </div>
            {tradeError && <p className="mt-4 text-sm text-red-300">{tradeError}</p>}
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setShowConfirmation(false)} disabled={submitting} className="flex-1 rounded-xl border border-white/10 px-4 py-3 font-semibold text-slate-300 hover:bg-white/5">Cancel</button>
              <button type="button" onClick={() => void confirmTrade()} disabled={submitting || !Number.isFinite(Number(giftCardValue)) || Number(giftCardValue) < offer.minLimit || Number(giftCardValue) > (offer.effectiveMax ?? offer.maxLimit)} className="flex-1 rounded-xl bg-blue-500 px-4 py-3 font-semibold text-white hover:bg-blue-400 disabled:opacity-50">{submitting ? 'Creating...' : 'Continue Trading'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
