'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, ClipboardList, Copy, Heart, LayoutGrid, Megaphone, MessageCircle, RefreshCw, Search, ShieldCheck, Trash2, UserRound, Zap, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { p2pService, type P2POrder, type P2POffer, type P2PProfile } from '@/services/p2p.service';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth.store';
import { getSellerOnboardingPath, isApprovedSeller } from '@/lib/seller-access';
import { ResponsiveRowCard } from '@/components/layout/ResponsiveRowCard';
import { AUTO_P2P_PAYMENT_METHODS } from '@vouchnode/shared';
import { useSocket } from '@/hooks/useSocket';

type ProfileTab = 'Info' | 'Ads' | 'Reviews';
const popularGiftCards = [
  'Amazon Gift Card',
  'Apple Store Gift Card',
  'Paysafecard',
  'Razer Gold PIN Gift Card',
  'Steam Wallet Gift Card',
  'Xbox Gift Card',
  'iTunes Gift Card'
];
const allGiftCards = [
  'Adidas Gift Card',
  'AirBnb Gift Card',
  'American Express Gift Card',
  'Barnes & Noble eGift Card',
  'Bed Bath & Beyond Gift Card',
  'Best Buy Gift Card',
  'Blizzard Gift Card',
  'CASHlib Vouchers',
  'CVS Gift Card',
  'Coles Gift Card',
  'Costco Cash Card',
  'Delta Air Line Gift Card',
  'Disney Gift Cards',
  'DoorDash Gift Card',
  'Eneba Gift Card',
  'Footlocker Sports Gift Card',
  'GameStop Gift Card',
  'Google Play Gift Card',
  'Grubhub Gift Card',
  'Home Depot Gift Card',
  'Hotels.com Gift Card',
  'Kohls Store Gift Card',
  "Lowe's Gift Card",
  "Macy's Gift Card",
  'MasterCard Gift Card',
  'MoneyPak',
  'MyVanilla Prepaid Card',
  'Neosurf Gift Card',
  'Netflix Gift Card',
  'Nike Gift Card',
  'Nintendo eShop Digital Card/Gift card',
  'Nordstrom Gift Card',
  'Old Navy E Gift Card',
  'One4all Card',
  'OneVanilla VISA/MasterCard Gift Card',
  'PCS Prepaid Cash Services',
  'Playstation Network Gift Card',
  'Reloadit by Netspend',
  'Restaurant Gift Cards',
  'Roblox Game Card',
  'Saks Fifth Avenue Gift Card',
  'Sephora Gift Card',
  'Southwest Airlines Gift Card',
  'Starbucks Card',
  'Target Gift Card',
  'Target VISA Gift Card',
  'Uber Eats',
  'Uber Gift Card',
  'Ulta Gift Card',
  'VISA Gift Card',
  "Victoria's Secret Gift Card",
  'Walmart Gift Card',
  'Walmart Visa Gift Card',
  'eBay Gift Card',
  'eGifter.com code'
];

function MerchantProfileView({ profile, loading, error }: { profile: P2PProfile | null; loading: boolean; error: string }) {
  const [profileTab, setProfileTab] = useState<ProfileTab>('Info');
  if (loading) return <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-[#11141d] p-12 text-center text-slate-400">Loading merchant profile...</div>;
  if (error) return <div className="mx-auto max-w-5xl rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-red-200">{error}</div>;
  if (!profile) return null;
  const badges = [
    ['Email', profile.verification.email],
    ['SMS', profile.verification.sms],
    ['Identity', profile.verification.identity],
    ['Deposit', profile.verification.hasP2PInsuranceDeposit]
  ] as const;
  return (
    <section className="mx-auto max-w-5xl">
      <div className="rounded-2xl border border-white/10 bg-[#11141d] p-5 shadow-2xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-2xl font-black text-slate-950">{profile.displayName.charAt(0).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">{profile.displayName}</h1>
                <button type="button" aria-label="Favorite merchant" className="text-amber-300 transition hover:scale-110"><Heart className="h-5 w-5 fill-current" /></button>
              </div>
              <p className="mt-1 truncate text-sm text-slate-500">@{profile.username}</p>
              <span className={`mt-2 inline-flex items-center gap-2 text-sm font-medium ${profile.isOnline ? 'text-emerald-300' : 'text-slate-500'}`}><span className={`h-2 w-2 rounded-full ${profile.isOnline ? 'bg-emerald-400' : 'bg-slate-600'}`} />{profile.isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {badges.filter(([, verified]) => verified).map(([badge]) => (
              <span key={badge} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300"><Check className="h-3.5 w-3.5" />{badge}</span>
            ))}
          </div>
        </div>
        <div className="mt-8 flex gap-4 overflow-x-auto border-b border-white/10 sm:gap-6" role="tablist" aria-label="Merchant profile sections">
          {(['Info', 'Ads', 'Reviews'] as const).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={profileTab === tab} onClick={() => setProfileTab(tab)} className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-semibold transition ${profileTab === tab ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-slate-500 hover:text-slate-200'}`}>{tab}</button>
          ))}
        </div>

        {profileTab === 'Info' && (
          <div className="mt-6 divide-y divide-white/5">
            {[
              ['30-Day Orders', String(profile.stats.thirtyDayOrders)],
              ['Total Completed Orders', `${profile.stats.totalCompletedOrders} total · ${profile.stats.completedBuyOrders} Buy · ${profile.stats.completedSellOrders} Sell`],
              ['30-Day Completion Rate (%)', `${profile.stats.completionRate.toFixed(1)}%`],
              ['Positive Rating (%)', `${profile.stats.positiveRating.toFixed(1)}%`],
              ['Avg. Release Time', `${profile.stats.avgReleaseMinutes} minutes`],
              ['Avg. Payment Time', `${profile.stats.avgPaymentMinutes} minutes`],
              ['Account Age (Days)', String(profile.stats.accountAgeDays)]
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-2"><span className="text-sm text-slate-400">{label}</span><span className="break-words text-left text-sm font-semibold text-white sm:text-right">{value}</span></div>
            ))}
          </div>
        )}

        {profileTab === 'Ads' && (
          <div className="mt-6 space-y-3">
            {profile.ads.map((ad) => (
              <article key={ad.side} className="rounded-xl border border-white/10 bg-[#0b0d14] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs font-bold text-cyan-300">{ad.side}</span><span className="font-bold text-white">{ad.asset}</span></div><span className="text-lg font-bold text-white">${ad.price.toFixed(4)} / $1 card</span></div>
                <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3"><div><p className="text-xs text-slate-500">Limits</p><p className="mt-1 text-slate-200">{ad.limits || 'Not specified'}</p></div><div><p className="text-xs text-slate-500">Available Quantity</p><p className="mt-1 text-slate-200">{ad.availableQuantity ?? 'Not specified'}</p></div><div><p className="text-xs text-slate-500">Payment Methods</p><p className="mt-1 text-slate-200">{ad.paymentMethods.length ? ad.paymentMethods.join(', ') : 'Not specified'}</p></div></div>
              </article>
            ))}
          </div>
        )}

        {profileTab === 'Reviews' && (
          <div className="mt-6">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-3xl font-black text-white">{profile.stats.positiveRating.toFixed(1)}%</p><p className="mt-1 text-sm text-emerald-300">Positive Rating</p></div><div className="text-sm text-slate-400"><span className="font-semibold text-white">{profile.stats.goodReviews}</span> Good <span className="mx-2 text-slate-600">·</span><span className="font-semibold text-white">{profile.stats.badReviews}</span> Bad</div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-red-400/20"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${profile.stats.positiveRating}%` }} /></div></div>
            <div className="mt-5 max-h-80 space-y-3 overflow-y-auto pr-1">
              {profile.reviews.map((review) => (
                <article key={review.id} className="rounded-xl border border-white/10 bg-[#0b0d14] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="font-semibold text-white">{review.username}</span><span className="text-amber-300">{'★'.repeat(review.rating)}</span></div><time className="text-xs text-slate-500">{new Date(review.timestamp).toLocaleString()}</time></div><p className="mt-2 text-xs text-slate-500">Paid with {review.paymentMethod}</p><p className="mt-3 text-sm leading-6 text-slate-300">{review.feedback}</p></article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function OrdersView({ orders, loading, error }: { orders: P2POrder[]; loading: boolean; error: string }) {
  const router = useRouter();
  const [scope, setScope] = useState<'Active' | 'Completed'>('Active');
  const [filter, setFilter] = useState('All');
  const filters = scope === 'Active' ? ['All', 'Unpaid', 'Paid', 'Appeal'] : ['All', 'Completed', 'Cancelled'];
  const visible = orders.filter((order) => {
    const completed = ['COMPLETED', 'SUCCESS'].includes(order.status);
    if (scope === 'Active' && completed) return false;
    if (scope === 'Completed' && !completed && order.status !== 'CANCELLED') return false;
    if (filter === 'All') return true;
    if (filter === 'Completed') return completed;
    if (filter === 'Cancelled') return order.status === 'CANCELLED';
    if (filter === 'Paid') return ['PAID', 'ESCROW_LOCKED'].includes(order.status);
    if (filter === 'Appeal') return ['DISPUTED', 'ESCALATED'].includes(order.status);
    return filter === 'Unpaid' && order.status === 'PENDING';
  });
  return <section className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-[#11141d] p-5 shadow-2xl sm:p-8">
    <div className="flex gap-6 border-b border-white/10">
      {(['Active', 'Completed'] as const).map((item) => <button key={item} type="button" onClick={() => { setScope(item); setFilter('All'); }} className={`border-b-2 px-1 pb-3 text-sm font-semibold ${scope === item ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-slate-500'}`}>{item}</button>)}
    </div>
    <div className="mt-5 flex flex-wrap gap-2">{filters.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === item ? 'bg-emerald-400 text-slate-950' : 'bg-white/5 text-slate-400'}`}>{item}</button>)}</div>
    {loading || error ? <div className="p-12 text-center text-slate-400">{loading ? 'Loading orders...' : error}</div> : visible.length === 0 ? <div className="flex flex-col items-center gap-3 p-16 text-center text-slate-500"><ClipboardList className="h-12 w-12 text-slate-700" /><p className="font-semibold text-slate-300">No records found</p><p className="text-sm">There are no orders in this category.</p></div> : <div className="mt-5 space-y-3">{visible.map((order) => <button key={order.id} type="button" onClick={() => order.isP2POrder ? router.push(`/p2p-offers/order/${encodeURIComponent(order.id)}`) : undefined} className={`block w-full rounded-xl border border-white/10 bg-[#0b0d14] p-4 text-left ${order.isP2POrder ? 'transition hover:border-emerald-400/40' : ''}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-white">{order.orderType}</p><p className="mt-1 text-xs text-slate-500">{new Date(order.timestamp).toLocaleString()}</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${order.actionRequired ? 'bg-blue-400/15 text-blue-300' : ['COMPLETED', 'SUCCESS'].includes(order.status) ? 'bg-emerald-400/10 text-emerald-300' : order.status === 'CANCELLED' ? 'bg-red-400/10 text-red-300' : 'bg-amber-400/10 text-amber-300'}`}>{order.actionRequired ? 'Action Required' : ['COMPLETED', 'SUCCESS'].includes(order.status) ? 'Completed' : order.status === 'CANCELLED' ? 'Cancelled' : order.status}</span>{order.isP2POrder && <MessageCircle className="h-4 w-4 text-emerald-300" />}</div></div><div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-slate-500">Fiat Amount</p><p className="mt-1 text-slate-200">${order.fiatAmount.toFixed(2)}</p></div><div><p className="text-xs text-slate-500">Rate</p><p className="mt-1 text-slate-200">${order.rate.toFixed(4)}</p></div><div><p className="text-xs text-slate-500">Crypto Volume</p><p className="mt-1 text-slate-200">{order.cryptoVolume}</p></div><div><p className="text-xs text-slate-500">Counterparty</p><p className="mt-1 text-slate-200">{order.counterpartyUsername}</p></div></div><p className="mt-4 flex items-center gap-2 text-xs text-slate-500">Order {order.orderNumber}<span onClick={(event) => { event.stopPropagation(); void navigator.clipboard.writeText(order.orderNumber); }} role="button" tabIndex={0} aria-label="Copy order number" className="text-slate-400 hover:text-white"><Copy className="h-3.5 w-3.5" /></span></p></button>)}</div>}
  </section>;
}

function AdsView({ profile, loading, error, onPublished, editOffer }: { profile: P2PProfile | null; loading: boolean; error: string; onPublished: (deletedId?: string) => void; editOffer?: P2POffer | null }) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [formOpen, setFormOpen] = useState(false);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [giftCardType, setGiftCardType] = useState(popularGiftCards[0]);
  const [asset, setAsset] = useState('USDT');
  const [minLimit, setMinLimit] = useState('');
  const [maxLimit, setMaxLimit] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [terms, setTerms] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState('');

  useEffect(() => {
    if (!editOffer) return;
    setSide(editOffer.tradeType);
    setGiftCardType(editOffer.giftCardType);
    setAsset(editOffer.cryptoCurrency);
    setMinLimit(String(editOffer.minLimit));
    setMaxLimit(String(editOffer.maxLimit));
    setExchangeRate(String(editOffer.giftCardRate));
    setTerms(editOffer.terms || '');
    setFormOpen(true);
  }, [editOffer]);

  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      router.push('/login?redirect=/p2p-offers');
      return;
    }
    if (!isApprovedSeller(user)) {
      router.push(getSellerOnboardingPath('/p2p-offers'));
      return;
    }
    const minimum = Number(minLimit);
    if (!Number.isFinite(minimum) || minimum < 10) {
      setFormError('The minimum trading limit must be at least $10 USD.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      await p2pService.createAd({
        side,
        giftCardType,
        cryptoAsset: asset,
        minLimit: Number(minLimit),
        maxLimit: Number(maxLimit),
        exchangeRate: Number(exchangeRate),
        terms
      });
      setFormOpen(false);
      setMinLimit('');
      setMaxLimit('');
      setExchangeRate('');
      setTerms('');
      onPublished();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setFormError(
        /insufficient|unable to create the p2p offer/i.test(message)
          ? 'Insufficient wallet balance to publish this offer.'
          : message || 'Unable to publish ad.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="mx-auto max-w-5xl">
    <div className="space-y-1 text-sm text-slate-400" aria-label="P2P offer guidelines">
      <p>• Rate means USD payout per $1 of gift card face value. Previously published ads were deactivated and must be republished.</p>
      <p>• Creating an offer is completely free.</p>
      <p>• A minimum P2P wallet balance is required to keep your offer active.</p>
    </div>
    <section className="mt-6 rounded-2xl border border-white/10 bg-[#11141d] p-5 shadow-2xl sm:p-8">
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-black tracking-tight">My Ads</h1><p className="mt-1 text-sm text-slate-500">Manage your active cryptocurrency advertisements.</p></div>
      <button type="button" onClick={() => { if (!user) { router.push('/login?redirect=/p2p-offers'); return; } if (!isApprovedSeller(user)) { router.push(getSellerOnboardingPath('/p2p-offers')); return; } setFormOpen(true); setFormError(''); }} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-300"><span className="text-lg leading-none">+</span> Publish Now</button>
    </div>
    {loading ? <div className="p-12 text-center text-slate-400">Loading ads...</div> : error ? <div className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</div> : profile?.ads.length ? <div className="mt-6 space-y-3">{profile.ads.map((ad) => <article key={ad.id} className="rounded-xl border border-white/10 bg-[#0b0d14] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="shrink-0 rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs font-bold text-cyan-300">{ad.side}</span><span className="font-bold">{ad.asset}</span></div><div className="flex items-center justify-between gap-3 sm:justify-end"><span className="font-bold">${ad.price.toFixed(4)} / $1 card</span><button type="button" aria-label={`Delete ${ad.asset} ${ad.side} ad`} disabled={deletingId === ad.id} onClick={async () => { setDeletingId(ad.id); setFormError(''); try { await p2pService.deleteAd(ad.id); onPublished(ad.id); } catch (cause) { setFormError(cause instanceof Error ? cause.message : 'Unable to delete ad.'); } finally { setDeletingId(''); } }} className="rounded-lg p-2 text-slate-500 transition hover:bg-red-400/10 hover:text-red-300 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div></div></article>)}</div> : <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 p-12 text-center"><Megaphone className="h-10 w-10 text-slate-600" /><p className="font-semibold text-slate-300">No active ads</p><p className="text-sm text-slate-500">Publish a buy or sell ad to start trading.</p><button type="button" onClick={() => { if (!user) { router.push('/login?redirect=/p2p-offers'); return; } if (!isApprovedSeller(user)) { router.push(getSellerOnboardingPath('/p2p-offers')); return; } setFormOpen(true); }} className="mt-2 rounded-lg border border-emerald-400/30 px-4 py-2 text-sm font-semibold text-emerald-300">+</button></div>}
    {formOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
        <form onSubmit={publish} className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#11141d] p-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Publish Ad</h2>
            <button type="button" onClick={() => setFormOpen(false)} className="text-slate-400"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['BUY', 'SELL'] as const).map((item) => (
              <button key={item} type="button" onClick={() => setSide(item)} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${side === item ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300' : 'border-white/10 text-slate-400'}`}>
                {item === 'BUY' ? 'Buy' : 'Sell'}
              </button>
            ))}
          </div>
          <label className="block text-sm text-slate-400">
            {side === 'SELL' ? 'Select payment method or asset you want to sell' : 'Select payment method'}
            <select value={giftCardType} onChange={(event) => setGiftCardType(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0b0d14] p-3 text-white">
              {Array.from(new Set([...popularGiftCards, ...allGiftCards, ...AUTO_P2P_PAYMENT_METHODS])).map((method) => <option key={method}>{method}</option>)}
            </select>
          </label>
          <label className="block text-sm text-slate-400">
            {side === 'SELL' ? 'The crypto asset you want to receive' : 'The crypto asset you want to sell'}
            <select value={asset} onChange={(event) => setAsset(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0b0d14] p-3 text-white">
              {['USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'LTC'].map((supportedAsset) => <option key={supportedAsset}>{supportedAsset}</option>)}
            </select>
          </label>
          <fieldset>
            <legend className="mb-2 text-sm text-slate-400">Trading Limits (Gift Card USD)</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-500">Minimum Limit
                <input type="number" min="10" step="0.01" value={minLimit} onChange={(event) => setMinLimit(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0b0d14] p-3 text-sm text-white" required />
              </label>
              <label className="text-xs text-slate-500">Maximum Limit
                <input type="number" min="10" step="0.01" value={maxLimit} onChange={(event) => setMaxLimit(event.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#0b0d14] p-3 text-sm text-white" required />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm text-slate-400">Merchant Payout Per $1 of Gift Card (USD)</legend>
            <div className="grid grid-cols-2 gap-3">
              <input type="text" value="$1 Gift Card Value" disabled aria-label="$1 Gift Card Value" className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-500" />
              <input type="number" min="0.0001" step="0.0001" value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b0d14] p-3 text-white" required />
            </div>
          </fieldset>
          <label className="block w-full max-w-full min-w-0 text-sm text-slate-400">Offer Terms
            <textarea value={terms} onChange={(event) => setTerms(event.target.value)} rows={5} placeholder="Describe your payment and trade requirements" className="mt-1 block w-full max-w-full min-w-0 resize-y break-words whitespace-pre-wrap rounded-xl border border-white/10 bg-[#0b0d14] p-3 text-sm text-white outline-none [overflow-wrap:anywhere] placeholder:text-slate-600" />
          </label>
          {formError && <p className="text-sm text-red-300">{formError}</p>}
          <button type="submit" disabled={submitting} className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">{submitting ? 'Publishing...' : 'Publish Ad'}</button>
        </form>
      </div>
    )}
    </section>
  </div>;
}

export default function P2POffersPage() {
  const router = useRouter();
  const [offers, setOffers] = useState<P2POffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [marketSide, setMarketSide] = useState<'buy' | 'sell'>('buy');
  const [selectedAsset, setSelectedAsset] = useState('USDT');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const [giftCardSearch, setGiftCardSearch] = useState('');
  const [activeNavigation, setActiveNavigation] = useState<'Profile' | 'Ads' | 'Orders' | 'P2P'>('P2P');
  const [profile, setProfile] = useState<P2PProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [orders, setOrders] = useState<P2POrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const { isAuthenticated, user } = useAuth();
  const [editOffer, setEditOffer] = useState<P2POffer | null>(null);
  const { socket: presenceSocket } = useSocket('/presence');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const type = marketSide === 'buy' ? 'BUY' : 'SELL';
      const matchingOffers = await p2pService.getOffers({
        type,
        asset: selectedAsset,
        paymentMethod: selectedPaymentMethod || undefined
      });
      setOffers(matchingOffers.filter((offer) => offer.tradeType === type));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load P2P offers.');
    } finally {
      setLoading(false);
    }
  }, [marketSide, selectedAsset, selectedPaymentMethod]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!presenceSocket) return;
    const handleP2POfferUpdate = (payload: { cryptoAsset?: string }) => {
      if (!payload.cryptoAsset || payload.cryptoAsset === selectedAsset) void load();
    };
    presenceSocket.on('p2p:offers-updated', handleP2POfferUpdate);
    return () => {
      presenceSocket.off('p2p:offers-updated', handleP2POfferUpdate);
    };
  }, [load, presenceSocket, selectedAsset]);
  useEffect(() => {
    const handlePresenceUpdate = (event: Event) => {
      const payload = (event as CustomEvent<{ userId?: string; isOnline?: boolean }>).detail;
      if (!payload?.userId || typeof payload.isOnline !== 'boolean') return;
      setOffers((current) => current.map((offer) => offer.userId === payload.userId
        ? { ...offer, isOnline: payload.isOnline!, isActiveWithinFiveMinutes: payload.isOnline! || offer.isActiveWithinFiveMinutes }
        : offer));
      setProfile((current) => current && payload.userId === user?.id
        ? { ...current, isOnline: payload.isOnline! }
        : current);
    };
    window.addEventListener('presence:update', handlePresenceUpdate);
    return () => window.removeEventListener('presence:update', handlePresenceUpdate);
  }, [user?.id]);
  useEffect(() => {
    if (activeNavigation === 'Profile' || activeNavigation === 'Ads') {
      setProfileLoading(true); setProfileError('');
      void p2pService.getProfile().then(setProfile).catch((err) => setProfileError(err instanceof Error ? err.message : 'Unable to load profile.')).finally(() => setProfileLoading(false));
    }
    if (activeNavigation === 'Orders') {
      setOrdersLoading(true); setOrdersError('');
      void p2pService.getOrders().then(setOrders).catch((err) => setOrdersError(err instanceof Error ? err.message : 'Unable to load orders.')).finally(() => setOrdersLoading(false));
    }
  }, [activeNavigation]);

  const openTradeForm = (offer: P2POffer) => {
    if (offer.userId === user?.id) {
      setEditOffer(offer);
      setActiveNavigation('Ads');
      return;
    }
    router.push(`/p2p-offers/trade/${encodeURIComponent(offer.id)}`);
  };

  return (
    <main className="min-h-screen bg-[#07090f] px-4 pb-28 pt-8 text-white sm:px-6 lg:px-8">
      {activeNavigation === 'Profile' ? <MerchantProfileView profile={profile} loading={profileLoading} error={profileError} /> : activeNavigation === 'Ads' ? <AdsView profile={profile} loading={profileLoading} error={profileError} editOffer={editOffer} onPublished={(deletedId) => { setEditOffer(null); if (deletedId) setProfile((current) => current ? { ...current, ads: current.ads.filter((ad) => ad.id !== deletedId) } : current); setProfileLoading(true); void p2pService.getProfile().then(setProfile).catch((err) => setProfileError(err instanceof Error ? err.message : 'Unable to refresh ads.')).finally(() => setProfileLoading(false)); }} /> : activeNavigation === 'Orders' ? <OrdersView orders={orders} loading={ordersLoading} error={ordersError} /> : <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-emerald-300">Fast, protected trading</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">Quick P2P Exchange</h1>
            <p className="mt-3 max-w-2xl text-slate-400">Trade crypto with verified merchants using gift cards.</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <div className="inline-flex rounded-xl border border-white/10 bg-[#11141d] p-1" aria-label="Market side">
              {(['buy', 'sell'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => {
                    setMarketSide(side);
                    setSelectedPaymentMethod('');
                  }}
                  aria-pressed={marketSide === side}
                  className={`rounded-lg px-5 py-2 text-sm font-semibold capitalize transition ${
                    marketSide === side
                      ? 'bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/10'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {side}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mb-6 flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-[#11141d] p-3">
          <label className="relative min-w-[150px] flex-1 text-xs font-semibold text-slate-500">
            Crypto Asset
            <select value={selectedAsset} onChange={(event) => setSelectedAsset(event.target.value)} className="mt-1 w-full appearance-none rounded-xl border border-white/10 bg-[#0b0d14] p-3 pr-9 text-sm text-white outline-none">
              {['USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'LTC'].map((asset) => <option key={asset}>{asset}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 text-slate-500" />
          </label>
          <button type="button" onClick={() => setPaymentDrawerOpen(true)} className="mt-4 flex min-w-[220px] flex-1 items-center justify-between rounded-xl border border-white/10 bg-[#0b0d14] px-3 py-3 text-left text-sm text-slate-300">
            {selectedPaymentMethod || (marketSide === 'buy' ? 'Select Payment Method' : 'Select Gift Card You Want')}<ChevronDown className="h-4 w-4 text-slate-500" />
          </button>
          <Button variant="outline" onClick={() => void load()} className="mt-4 border-white/10 text-slate-300"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        </div>
        <div className="mb-6 inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-sm font-semibold text-emerald-300">
          {marketSide === 'buy' ? 'Buy' : 'Sell'} {selectedAsset} with 0 fees
        </div>
        {error && <div className="mb-5 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}
        <div className="w-full space-y-2 overflow-hidden">
          {loading ? <div className="rounded-2xl border border-white/10 bg-[#11141d] p-12 text-center text-slate-400">Loading live offers...</div> : offers.length === 0 ? <div className="rounded-2xl border border-white/10 bg-[#11141d] p-12 text-center text-slate-400">No active merchant offers match these filters.</div> : offers.map((offer) => (
            <ResponsiveRowCard key={offer.id} className="rounded-xl border border-white/10 bg-[#11141d] shadow-lg transition hover:border-white/20">
                <Link href={`/p2p-offers/merchant/${offer.merchantId}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-sm font-bold text-slate-950 sm:h-11 sm:w-11">{offer.merchantName.charAt(0).toUpperCase()}</div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5"><p className="truncate text-sm font-bold text-white sm:text-base">@{offer.username}</p><span className={`h-2 w-2 shrink-0 rounded-full ${offer.isOnline ? 'bg-emerald-400' : 'bg-slate-600'}`} /></div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 sm:text-xs">{offer.tradeVolume.toLocaleString()} trades · {offer.completionRate.toFixed(1)}% completion</p>
                    <span className="mt-1 inline-block max-w-full truncate rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">{offer.giftCardType}</span>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                  <div className="min-w-0 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rate</p>
                    <p className="mt-0.5 whitespace-nowrap text-base font-black text-white sm:text-lg">${offer.giftCardRate.toFixed(4)} <span className="text-[10px] font-medium text-slate-500">USD / $1 card</span></p>
                    <p className="mt-0.5 max-w-[150px] truncate text-[10px] text-slate-500">Limits: {offer.minLimit.toFixed(2)}-{(offer.effectiveMax ?? offer.maxLimit).toFixed(2)} USD</p>
                  </div>
                  <Button type="button" onClick={() => openTradeForm(offer)} className={`h-9 shrink-0 rounded-lg px-2.5 text-xs text-white sm:px-3 ${offer.userId === user?.id ? 'bg-slate-600 hover:bg-slate-500' : 'bg-blue-500 hover:bg-blue-400'}`}>{offer.userId === user?.id ? 'Edit' : marketSide === 'buy' ? 'Buy' : 'Sell'}{offer.userId === user?.id ? null : <ArrowRight className="ml-1 h-3.5 w-3.5" />}</Button>
                </div>
            </ResponsiveRowCard>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-400"><span><ShieldCheck className="mr-1 inline h-4 w-4 text-emerald-400" />Platform-protected workflow</span><span><Clock3 className="mr-1 inline h-4 w-4 text-cyan-400" />Live activity priority</span></div>
      </div>}

      {paymentDrawerOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-6" onClick={() => setPaymentDrawerOpen(false)}>
        <div className="flex max-h-[85vh] h-[min(600px,85vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#11141d] shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="shrink-0 border-b border-white/10 px-5 pb-4 pt-4 sm:px-6">
            <div className="flex items-center gap-3"><button type="button" onClick={() => setPaymentDrawerOpen(false)} aria-label="Back to P2P offers" className="rounded-full p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"><ArrowLeft className="h-5 w-5" /></button><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Gift card filter</p><h2 className="mt-1 text-xl font-bold text-white">Select Payment Method</h2></div></div>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-[#0b0d14] px-3 transition focus-within:border-blue-400/60"><Search className="h-4 w-4 shrink-0 text-slate-500" /><input value={giftCardSearch} onChange={(event) => setGiftCardSearch(event.target.value)} placeholder="Search payment methods" className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-600" /></div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            {[
              { title: 'POPULAR GIFT CARDS', cards: popularGiftCards, popular: true },
              { title: 'FIAT, BANKS & WALLETS', cards: AUTO_P2P_PAYMENT_METHODS, popular: false },
              { title: 'ALL GIFT CARDS', cards: allGiftCards, popular: false }
            ].map(({ title, cards, popular }) => {
              const filtered = cards.filter((card) => card.toLowerCase().includes(giftCardSearch.toLowerCase()));
              return <section key={title} className="mb-6 last:mb-0"><h3 className="text-xs font-semibold tracking-wider text-gray-500">{title}</h3><div className="mt-2 divide-y divide-white/5">{filtered.map((card) => <button key={card} type="button" onClick={() => { setSelectedPaymentMethod(card); setPaymentDrawerOpen(false); }} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"><span>{card}{popular && <span className="ml-2 text-xs font-semibold text-orange-400">🔥 Hot</span>}</span>{selectedPaymentMethod === card && <Check className="h-4 w-4 shrink-0 text-blue-400" />}</button>)}</div></section>;
            })}
            <button type="button" onClick={() => { setSelectedPaymentMethod(''); setPaymentDrawerOpen(false); }} className="mt-1 text-sm text-slate-500 transition hover:text-white">Clear payment method</button>
          </div>
        </div>
      </div>}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0d14]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl shadow-black/40 backdrop-blur-xl" aria-label="P2P navigation">
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {[
            { label: 'Profile', icon: UserRound },
            { label: 'Ads', icon: Megaphone },
            { label: 'Orders', icon: ClipboardList },
            { label: 'P2P', icon: LayoutGrid }
          ].map(({ label, icon: Icon }) => {
            const active = label === activeNavigation;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setActiveNavigation(label as typeof activeNavigation)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold transition ${
                  active ? 'bg-emerald-400/10 text-emerald-300' : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

    </main>
  );
}
