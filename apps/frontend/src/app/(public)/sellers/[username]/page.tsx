'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Facebook, Filter, Grid3X3, Search, ShieldAlert, ShieldCheck, Star, X } from 'lucide-react';
import { apiClient } from '@/services/api.client';
import { sellerService } from '@/services/seller.service';
import type { Product, Review, Seller } from '@/types/api.types';
import { formatDate } from '@/lib/format';
import { ProductCard } from '@/components/marketplace/ProductCard';
import { SellerProfileSkeleton } from './SellerProfileSkeleton';
import { useAuthStore } from '@/store/auth.store';

type SellerProfile = Seller & {
  shopSlug?: string;
  completedOrders?: number;
  completedSales?: number;
  positiveRatingPercentage?: number;
  reviewCount?: number;
  profile?: { displayName?: string; username?: string; avatarUrl?: string };
  user?: { profile?: { displayName?: string; username?: string; avatarUrl?: string } };
  listings?: Product[];
  reviews?: Review[];
  createdAt?: string;
  trustScore?: number;
  successfulSales?: number;
  feedback?: Array<{ good: number; neutral: number; poor: number; totalRatings: number; itemsSold: number }>;
};

function Stars({ rating }: { rating: number }) {
  return <div className="flex items-center gap-0.5 text-amber-400" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`h-4 w-4 ${star <= Math.round(rating) ? 'fill-current' : 'text-slate-600'}`} />)}
  </div>;
}

export default function SellerProfilePage() {
  const params = useParams<{ username: string }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [tab, setTab] = useState<'listings' | 'ratings' | 'gallery'>('listings');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sortPrice, setSortPrice] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<'report' | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const profile = await sellerService.getSeller(username) as SellerProfile;
        if (!mounted) return;
        setSeller(profile);
        setProducts(profile.listings || []);
        setReviews(profile.reviews || []);
        setLoading(false);
        const [productResult, reviewResult] = await Promise.allSettled([
          sellerService.getSellerProducts(username, { status: 'ACTIVE', limit: 48 }),
          profile.reviews ? Promise.resolve(profile.reviews) : apiClient.get<Review[] | { data: Review[] }>(`/reviews/seller/${profile.id}`),
        ]);
        if (!mounted) return;
        if (productResult.status === 'fulfilled') {
          const value = productResult.value as unknown as Product[] | { data?: Product[] };
          setProducts(Array.isArray(value) ? value : value.data || []);
        }
        if (reviewResult.status === 'fulfilled') {
          const value = reviewResult.value;
          setReviews(Array.isArray(value) ? value : Array.isArray(value.data) ? value.data : []);
        }
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'Unable to load this profile.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    if (username) void loadProfile(); else setLoading(false);
    const refreshProfile = () => { if (username) void loadProfile(); };
    window.addEventListener('vouchnode:review-created', refreshProfile);
    return () => { mounted = false; window.removeEventListener('vouchnode:review-created', refreshProfile); };
  }, [username]);

  const displayName = seller?.shopName || seller?.profile?.displayName || seller?.user?.profile?.displayName || username;
  const sellerUsername = seller?.profile?.username || seller?.user?.profile?.username || username;
  const avatar = seller?.avatarUrl || seller?.profile?.avatarUrl || seller?.user?.profile?.avatarUrl;
  const rating = reviews.length ? reviews.reduce((sum, review) => sum + (Number(review.rating) || 0), 0) / reviews.length : Number(seller?.avgRating) || 0;
  const successfulSales = Number(seller?.successfulSales ?? seller?.completedSales ?? seller?.completedOrders ?? seller?.totalSales ?? 0) || 0;
  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.categoryId).filter(Boolean))) as string[], [products]);
  const filteredProducts = useMemo(() => [...products]
    .filter((product) => !search.trim() || product.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((product) => category === 'all' || product.categoryId === category)
    .sort((a, b) => sortPrice === 'asc' ? Number(a.currentPrice) - Number(b.currentPrice) : Number(b.currentPrice) - Number(a.currentPrice)), [products, search, category, sortPrice]);
  const joinedDate = seller?.createdAt ? new Date(seller.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'September 2026';
  const userCode = (seller?.userId || seller?.id || '').slice(-8).toUpperCase();
  const ratingRows = ['30 DAYS', '90 DAYS', '180 DAYS', '12 MONTHS', 'LIFETIME'];
  const getCounts = (months?: number) => {
    const cutoff = months ? Date.now() - months * 30 * 24 * 60 * 60 * 1000 : 0;
    const scoped = reviews.filter((review) => !cutoff || new Date(review.createdAt).getTime() >= cutoff);
    return [scoped.filter((review) => Number(review.rating) >= 4).length, scoped.filter((review) => Number(review.rating) === 3).length, scoped.filter((review) => Number(review.rating) < 3).length, scoped.length];
  };
  const backendFeedback = seller?.feedback;
  const lifetimeCounts = getCounts();
  const goodAndPoorTotal = lifetimeCounts[0] + lifetimeCounts[2];
  const trustScore = goodAndPoorTotal > 0
    ? (lifetimeCounts[0] / goodAndPoorTotal) * 100
    : Number(seller?.trustScore ?? seller?.positiveRatingPercentage ?? 100) || 0;
  const isOwnProfile = Boolean(currentUserId && currentUserId === seller?.userId);
  const reportUser = () => {
    if (!currentUserId || !seller?.userId || actionBusy) return;
    setReportReason('');
    setReportOpen(true);
  };
  const submitReport = async () => {
    if (!currentUserId || !seller?.userId || !reportReason.trim() || actionBusy) return;
    setActionBusy('report');
    try {
      const response = await apiClient.post('/reports', {
        targetType: 'SELLER',
        targetId: seller.userId,
        reportedUserId: seller.userId,
        reason: reportReason.trim(),
        description: `Profile report for @${sellerUsername}`,
      });
      if (response.error) throw new Error(response.error);
      setError(null);
      setSuccessMessage('Report submitted for review');
      setReportOpen(false);
      setReportReason('');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to submit report.');
    } finally {
      setActionBusy(null);
    }
  };

  if (loading) return <SellerProfileSkeleton />;
  if (error || !seller) return <div className="mx-auto max-w-2xl px-4 py-16"><div className="flex items-center gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-red-200"><AlertCircle className="h-5 w-5" /><p>{error || 'Profile not found.'}</p></div></div>;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-white sm:px-6 lg:py-12">
      <section className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#12131a]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(99,102,241,0.18),transparent_35%),linear-gradient(135deg,rgba(30,41,82,0.35),transparent_55%)]" />
        <div className="relative px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-end gap-4">
              {avatar ? <img src={avatar} alt={displayName} className="h-20 w-20 rounded-3xl border-4 border-indigo-950/70 object-cover shadow-xl sm:h-24 sm:w-24" /> : <div className="flex h-20 w-20 items-center justify-center rounded-3xl border-4 border-indigo-950/70 bg-indigo-600 text-3xl font-bold sm:h-24 sm:w-24">{displayName.slice(0, 1).toUpperCase()}</div>}
              <div className="pb-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black tracking-tight sm:text-3xl">{displayName}</h1>{(seller.isVerified || Number(seller.verificationLevel ?? 0) > 0) && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> Verified</span>}{seller.status === 'ACTIVE' && <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-200">Active seller</span>}</div><p className="text-sm text-slate-400">@{sellerUsername}</p><p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Member since {joinedDate} · Your code: {userCode}</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/products" className="rounded-xl bg-indigo-500 px-4 py-2.5 text-center text-sm font-semibold transition hover:bg-indigo-400">Browse marketplace</Link>
              {!isOwnProfile && currentUserId && <button type="button" onClick={reportUser} disabled={actionBusy !== null} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-50"><ShieldAlert className="h-4 w-4" />Report</button>}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-400"><span>{successfulSales.toLocaleString()} items sold</span><span>•</span><span>{trustScore.toFixed(1)}% positive</span><span>•</span><span>{rating.toFixed(1)} / 5 average</span><span className="ml-auto flex items-center gap-3 text-slate-500"><span className="text-lg">@</span><Facebook className="h-4 w-4" /><span className="font-bold">𝕏</span></span></div>
        </div>
      </section>

      <section className="mx-auto mt-6 max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#12131a]">
        <div className="border-b border-white/10 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-white">Feedback ratings</h2>
          <p className="mt-1 text-xs text-slate-500">Sales and buyer feedback by timeframe</p>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-6 border-b border-white/10 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500 sm:px-5">
              <span>Timeframe</span><span className="text-emerald-300">Good (🙂)</span><span className="text-amber-300">Neutral (😐)</span><span className="text-rose-300">Poor (🙁)</span><span>Total ratings</span><span>Items sold</span>
            </div>
            {ratingRows.map((label, index) => {
              const counts = backendFeedback?.[index] || (() => { const local = getCounts(index === 0 ? 1 : index === 1 ? 3 : index === 2 ? 6 : index === 3 ? 12 : undefined); return { good: local[0], neutral: local[1], poor: local[2], totalRatings: local[3], itemsSold: index === 4 ? successfulSales : 0 }; })();
              return <div key={label} className="grid grid-cols-6 border-b border-white/5 px-3 py-2.5 text-xs text-slate-300 last:border-0 sm:px-5"><span className="font-semibold text-white">{label.toLowerCase()}</span><span>{counts.good}</span><span>{counts.neutral}</span><span>{counts.poor}</span><span>{counts.totalRatings}</span><span>{counts.itemsSold}</span></div>;
            })}
          </div>
        </div>
      </section>

      <div className="mt-8 flex gap-2 overflow-x-auto border-b border-white/10">{([['listings', `LISTINGS (${products.length})`], ['ratings', `RATINGS (${reviews.length})`], ['gallery', 'GALLERY']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`shrink-0 border-b-2 px-5 py-3 text-xs font-black tracking-[0.18em] ${tab === value ? 'border-indigo-400 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>{label}</button>)}</div>

      {tab === 'listings' && <><div className="mt-6 grid w-full gap-3 rounded-2xl border border-white/10 bg-[#12131a] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.35fr)_minmax(10rem,0.25fr)_auto] sm:items-center"><div className="relative min-w-0"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this user's listings" className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-9 text-sm text-white outline-none focus:border-indigo-400" />{search && <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"><X className="h-4 w-4" /></button>}</div><select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#171a25] px-3 py-3 text-sm text-slate-300"><option value="all">Category</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select><button type="button" onClick={() => setSortPrice((value) => value === 'asc' ? 'desc' : 'asc')} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300 hover:bg-white/5"><Filter className="h-4 w-4" /> Price {sortPrice === 'asc' ? '↑' : '↓'}</button><span className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-400/10 px-3 py-3 text-xs font-bold uppercase tracking-wide text-emerald-300">On Sale</span></div><div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filteredProducts.length ? filteredProducts.map((product) => <ProductCard key={product.id} product={product} />) : <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-slate-400 sm:col-span-2 lg:col-span-3 xl:col-span-4">This user has no active listings yet.</div>}</div></>}

      {tab === 'ratings' && <><section className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-[#12131a]"><div className="min-w-[720px]"><div className="grid grid-cols-6 border-b border-white/10 px-5 py-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500"><span>Timeframe</span><span className="text-emerald-300">Good</span><span className="text-amber-300">Neutral</span><span className="text-rose-300">Poor</span><span>Total ratings</span><span>Items sold</span></div>{ratingRows.map((label, index) => { const counts = getCounts(index === 0 ? 1 : index === 1 ? 3 : index === 2 ? 6 : index === 3 ? 12 : undefined); return <div key={label} className="grid grid-cols-6 border-b border-white/5 px-5 py-4 text-sm text-slate-300 last:border-0"><span className="font-semibold text-white">{label}</span><span>🟢 {counts[0]}</span><span>🟡 {counts[1]}</span><span>🔴 {counts[2]}</span><span>{counts[3]}</span><span>{index === 4 ? successfulSales : 0}</span></div>; })}</div></section><div className="mt-6 grid gap-3 md:grid-cols-2">{reviews.length ? reviews.map((review) => <div key={review.id} className="rounded-2xl border border-white/10 bg-[#12131a] p-4"><div className="flex items-center justify-between"><span className="text-sm font-semibold text-white">{review.maskedBuyerUsername || 'Buyer***'}</span><Stars rating={Number(review.rating) || 0} /></div><p className="mt-3 text-sm text-slate-300">{review.content || review.comment || 'Great transaction.'}</p><p className="mt-2 text-xs text-slate-500">{formatDate(review.createdAt)}</p></div>) : <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-slate-400 md:col-span-2">No ratings yet.</div>}</div></>}

      {tab === 'gallery' && <section className="mt-6 rounded-2xl border border-dashed border-white/15 p-16 text-center text-slate-400"><Grid3X3 className="mx-auto h-8 w-8 text-slate-600" /><p className="mt-3">No gallery items yet.</p></section>}
      {reportOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#171923] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div><h2 id="report-title" className="text-lg font-bold text-white">Report @{sellerUsername}</h2><p className="mt-1 text-sm text-slate-400">Please provide a reason for this report</p></div>
            <button type="button" onClick={() => setReportOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close report dialog"><X className="h-5 w-5" /></button>
          </div>
          <textarea value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder="Please provide a reason for this report" rows={5} autoFocus className="mt-5 w-full resize-none rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400" />
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setReportOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">Cancel</button>
            <button type="button" onClick={() => void submitReport()} disabled={!reportReason.trim() || actionBusy !== null} className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50">{actionBusy === 'report' ? 'Submitting...' : 'Submit'}</button>
          </div>
        </div>
      </div>}
      {successMessage && <div role="status" className="fixed bottom-5 right-5 z-50 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200 shadow-xl">{successMessage}</div>}
    </main>
  );
}
