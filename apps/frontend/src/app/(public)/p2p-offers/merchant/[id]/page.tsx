'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Heart } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { favoriteService } from '@/services/favorite.service';
import { p2pService, type P2PProfile } from '@/services/p2p.service';
import { useAuthStore } from '@/store/auth.store';

export default function PublicMerchantProfilePage() {
  const reviewsPerPage = 20;
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<P2PProfile | null>(null);
  const [reviewsPage, setReviewsPage] = useState(1);
  const reviewsContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [favoriteError, setFavoriteError] = useState('');
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    setReviewsPage(1);
    const merchantId = typeof params.id === 'string' ? params.id : '';
    if (!merchantId) {
      setError('Merchant profile not found.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    void p2pService.getProfile(merchantId)
      .then(setProfile)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load merchant profile.'))
      .finally(() => setLoading(false));
  }, [params.id]);

  const reviews = profile?.reviews ?? [];
  const totalReviewPages = Math.ceil(reviews.length / reviewsPerPage);
  const paginatedReviews = reviews.slice(
    (reviewsPage - 1) * reviewsPerPage,
    reviewsPage * reviewsPerPage,
  );

  useEffect(() => {
    reviewsContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [reviewsPage]);

  const toggleFavorite = async () => {
    if (!profile || favoriteLoading) return;
    if (!isAuthenticated) {
      setFavoriteError('Sign in to favorite a merchant profile.');
      return;
    }

    const nextIsFavorite = !profile.isFavorite;
    setFavoriteError('');
    setFavoriteLoading(true);
    setProfile({ ...profile, isFavorite: nextIsFavorite });
    try {
      await (nextIsFavorite
        ? favoriteService.addProfile(profile.id)
        : favoriteService.removeProfile(profile.id));
    } catch (cause) {
      setProfile({ ...profile, isFavorite: !nextIsFavorite });
      setFavoriteError(cause instanceof Error ? cause.message : 'Unable to update profile favorite.');
    } finally {
      setFavoriteLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#07090f] px-4 pb-12 pt-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto mb-4 max-w-5xl">
        <button
          type="button"
          onClick={() => router.push('/p2p-offers')}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to P2P offers
        </button>
      </div>
      {loading && <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-[#11141d] p-12 text-center text-slate-400">Loading merchant profile...</div>}
      {error && <div className="mx-auto max-w-5xl rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-red-200">{error}</div>}
      {profile && <section className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-[#11141d] p-5 shadow-2xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-2xl font-black text-slate-950">{profile.displayName.charAt(0).toUpperCase()}</div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">{profile.displayName}</h1>
              <p className="mt-1 text-sm text-slate-500">@{profile.username}</p>
              <span className={`mt-2 inline-flex items-center gap-2 text-sm font-medium ${profile.isOnline ? 'text-emerald-300' : 'text-slate-500'}`}><span className={`h-2 w-2 rounded-full ${profile.isOnline ? 'bg-emerald-400' : 'bg-slate-600'}`} />{profile.isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void toggleFavorite()}
              disabled={favoriteLoading}
              aria-pressed={profile.isFavorite}
              aria-label={profile.isFavorite ? 'Remove merchant from favorites' : 'Add merchant to favorites'}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${profile.isFavorite ? 'border-pink-400/40 bg-pink-400/15 text-pink-200' : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-pink-400/40 hover:bg-pink-400/10 hover:text-pink-200'}`}
            >
              <Heart className={`h-4 w-4 ${profile.isFavorite ? 'fill-current' : ''}`} />
              {favoriteLoading ? 'Saving...' : profile.isFavorite ? 'Favorited' : 'Favorite'}
            </button>
            {[
              ['Email', profile.verification.email],
              ['SMS', profile.verification.sms],
              ['Identity', profile.verification.identity],
              ['Deposit', profile.verification.hasP2PInsuranceDeposit]
            ].filter(([, verified]) => verified === true).map(([badge]) => <span key={String(badge)} className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">{badge}</span>)}
          </div>
          {favoriteError && <p role="alert" className="mt-3 text-sm text-red-300">{favoriteError}</p>}
        </div>
        <div className="mt-8 divide-y divide-white/5">
          {[
            ['30-Day Orders', String(profile.stats.thirtyDayOrders)],
            ['Total Completed Orders', String(profile.stats.totalCompletedOrders)],
            ['30-Day Completion Rate', `${profile.stats.completionRate.toFixed(1)}%`],
            ['Positive Rating', `${profile.stats.positiveRating.toFixed(1)}%`],
            ['Account Age', `${profile.stats.accountAgeDays} days`]
          ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 py-4"><span className="text-sm text-slate-400">{label}</span><span className="text-sm font-semibold text-white">{value}</span></div>)}
        </div>
        <h2 className="mt-8 text-lg font-bold">Active Ads</h2>
        <div className="mt-3 space-y-3">
          {profile.ads.map((ad) => <article key={ad.id} className="rounded-xl border border-white/10 bg-[#0b0d14] p-4"><div className="flex justify-between gap-3"><span className="font-bold text-white">{ad.side} {ad.asset}</span><span className="font-bold text-white">{ad.price.toFixed(4)}</span></div><p className="mt-2 text-sm text-slate-400">{ad.limits || 'No limits specified'} · {ad.paymentMethods.join(', ') || 'No payment method specified'}</p></article>)}
        </div>
        <h2 className="mt-8 text-lg font-bold">Reviews</h2>
        <div
          ref={reviewsContainerRef}
          className="mt-3 max-h-[500px] space-y-3 overflow-y-auto pr-2 [scrollbar-color:#334155_#0b0d14] [scrollbar-width:thin]"
        >
          {paginatedReviews.length ? paginatedReviews.map((review) => <article key={review.id} className="rounded-xl border border-white/10 bg-[#0b0d14] p-4"><div className="flex justify-between gap-3"><span className="font-semibold text-white">{review.username}</span><span className={review.rating >= 4 ? 'text-emerald-300' : 'text-red-300'}>{review.rating >= 4 ? 'Positive' : 'Negative'}</span></div><p className="mt-2 text-sm text-slate-300">{review.feedback}</p></article>) : <p className="rounded-xl border border-white/10 bg-[#0b0d14] p-4 text-sm text-slate-400">No reviews yet.</p>}
        </div>
        {totalReviewPages > 1 && <nav aria-label="Reviews pagination" className="mt-4 flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={() => setReviewsPage((page) => Math.max(1, page - 1))}
            disabled={reviewsPage === 1}
            className="rounded-lg border border-white/10 px-3 py-2 font-semibold text-slate-300 transition hover:border-emerald-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span aria-live="polite" className="text-slate-400">Page {reviewsPage} of {totalReviewPages}</span>
          <button
            type="button"
            onClick={() => setReviewsPage((page) => Math.min(totalReviewPages, page + 1))}
            disabled={reviewsPage === totalReviewPages}
            className="rounded-lg border border-white/10 px-3 py-2 font-semibold text-slate-300 transition hover:border-emerald-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </nav>}
      </section>}
    </main>
  );
}
