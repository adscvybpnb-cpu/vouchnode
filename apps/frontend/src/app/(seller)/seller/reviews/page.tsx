'use client';

import { useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { reviewService } from '@/services/review.service';
import { sellerService } from '@/services/seller.service';
import type { Review } from '@/types/api.types';

export default function SellerReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<{ rating: number; count: number } | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const profile = await sellerService.getMySellerProfile();
        const response = await reviewService.getSellerReviews(profile.id);
        if (!active) return;
        setReviews(response.data || []);
        setSummary({ rating: Number(profile.rating || profile.avgRating || 0), count: profile.reviewCount || response.total || 0 });
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load seller reviews.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return <section className="mx-auto max-w-5xl space-y-6 p-6 text-white"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Seller Studio</p><h1 className="mt-2 text-3xl font-bold">Reviews</h1><p className="mt-1 text-sm text-slate-400">See buyer feedback for your seller profile.</p></div>
    {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}
    {summary && <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5"><p className="text-sm text-slate-400">Seller rating</p><p className="mt-2 flex items-center gap-2 text-3xl font-bold"><Star className="h-6 w-6 fill-yellow-400 text-yellow-400" /> {summary.rating.toFixed(1)} <span className="text-sm font-normal text-slate-400">({summary.count} reviews)</span></p></div>}
    {loading ? <div className="flex justify-center p-12 text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading reviews...</div> : reviews.length === 0 ? <p className="rounded-xl border border-white/10 p-12 text-center text-slate-400">No reviews yet.</p> : <div className="space-y-3">{reviews.map((review) => <article key={review.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center justify-between gap-4"><strong>{review.maskedBuyerUsername || review.reviewer?.profile?.displayName || review.reviewer?.profile?.username || 'Buyer'}</strong><span className="flex items-center gap-1 text-yellow-300">{review.rating}/5 <Star className="h-4 w-4 fill-current" /></span></div>{(review.title || review.comment || review.content) && <p className="mt-3 text-slate-300">{review.title || review.comment || review.content}</p>}<p className="mt-3 text-xs text-slate-500">{new Date(review.createdAt).toLocaleDateString()}</p></article>)}</div>}
  </section>;
}
