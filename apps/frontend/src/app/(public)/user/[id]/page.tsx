'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Flag, MessageSquare, ShieldCheck, Star, UserPlus, X } from 'lucide-react';
import { marketplaceProducts, marketplaceSellers } from '@/lib/marketplace-data';
import { favoriteService } from '@/services/favorite.service';
import { messageService } from '@/services/message.service';
import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/store/auth.store';

const baseFeedbackMatrix = {
  '30 days': { good: 38, neutral: 5, poor: 1 },
  '90 days': { good: 120, neutral: 11, poor: 4 },
  '12 months': { good: 432, neutral: 28, poor: 9 },
  'Lifetime': { good: 1846, neutral: 132, poor: 27 },
};

export default function UserProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [actionBusy, setActionBusy] = useState<'follow' | 'message' | 'report' | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);

  const seller = useMemo(
    () => marketplaceSellers.find((item) => item.username === params.id || item.id === params.id) ?? marketplaceSellers[0],
    [params.id],
  );

  const products = useMemo(
    () => marketplaceProducts.filter((product) => product.sellerId === seller.id).slice(0, 6),
    [seller.id],
  );

  const isOfficialPlatformAccount =
    seller.id === 'vaultmarket-official' ||
    seller.username === 'vaultmarket-official' ||
    seller.username === '@vaultmarket-official' ||
    params.id === '@vaultmarket-official';

  const feedbackMatrix = isOfficialPlatformAccount
    ? {
        '30 days': { good: 100, neutral: 0, poor: 0 },
        '90 days': { good: 100, neutral: 0, poor: 0 },
        '12 months': { good: 100, neutral: 0, poor: 0 },
        'Lifetime': { good: 100, neutral: 0, poor: 0 },
      }
    : baseFeedbackMatrix;

  const isOwnProfile = user?.id === seller.id;

  useEffect(() => {
    if (!user) {
      setIsFollowing(false);
      return;
    }
    let active = true;
    void favoriteService.getAll().then(({ profiles }) => {
      if (active) setIsFollowing(profiles.some(({ following }) => following.id === seller.id));
    }).catch((error: unknown) => {
      if (active) setActionError(error instanceof Error ? error.message : 'Unable to load follow status.');
    });
    return () => { active = false; };
  }, [seller.id, user]);

  const handleFollowToggle = async () => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    if (actionBusy || isOwnProfile) return;
    setActionBusy('follow');
    setActionError('');
    setActionSuccess('');
    try {
      if (isFollowing) await favoriteService.removeProfile(seller.id);
      else await favoriteService.addProfile(seller.id);
      setIsFollowing(!isFollowing);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to update followed sellers.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleMessage = async () => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    if (actionBusy || isOwnProfile) return;
    setActionBusy('message');
    setActionError('');
    try {
      const conversation = await messageService.startConversation(seller.id);
      router.push(`/chat?conversationId=${encodeURIComponent(conversation.id)}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to start a conversation.');
    } finally {
      setActionBusy(null);
    }
  };

  const handleReportSubmit = async () => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    if (!reportText.trim() || actionBusy) return;
    setActionBusy('report');
    setActionError('');
    setActionSuccess('');
    try {
      const response = await apiClient.post('/reports', {
        targetType: 'SELLER',
        targetId: seller.id,
        reason: reportText.trim(),
        description: `Profile report for @${seller.username}`,
      });
      if (response.error) throw new Error(response.error);
      setShowReport(false);
      setReportText('');
      setActionSuccess('Report submitted for review.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to submit report.');
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-white">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#12131a] shadow-2xl shadow-indigo-950/10">
        <div className="border-b border-white/10 p-6 sm:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <img src={seller.avatar} alt={seller.displayName} className="h-20 w-20 rounded-full border-2 border-indigo-500/40 object-cover" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{seller.displayName}</h1>
                  {seller.verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300">
                      <ShieldCheck className="h-3 w-3" /> Verified
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-400">@{seller.username} • Member since {seller.memberSince}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleFollowToggle}
                disabled={Boolean(actionBusy) || isOwnProfile}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                {actionBusy === 'follow' ? 'Saving...' : isFollowing ? 'Following' : 'Follow'}
              </button>
              <button
                type="button"
                onClick={handleMessage}
                disabled={Boolean(actionBusy) || isOwnProfile}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MessageSquare className="h-4 w-4" /> {actionBusy === 'message' ? 'Opening...' : 'Message'}
              </button>
              <button
                type="button"
                onClick={() => setShowReport(true)}
                disabled={Boolean(actionBusy) || isOwnProfile}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-5 py-2.5 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Flag className="h-4 w-4" /> Report
              </button>
            </div>
          </div>
          {(actionError || actionSuccess) && <p role={actionError ? 'alert' : 'status'} className={`mt-4 rounded-xl px-4 py-3 text-sm ${actionError ? 'bg-rose-500/10 text-rose-200' : 'bg-emerald-500/10 text-emerald-200'}`}>{actionError || actionSuccess}</p>}
        </div>

        <div className="grid gap-4 border-b border-white/10 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Completed sales</p><p className="mt-2 text-2xl font-bold">{seller.sales.toLocaleString()}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Rating</p><p className="mt-2 text-2xl font-bold">{seller.rating.toFixed(1)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Response time</p><p className="mt-2 text-2xl font-bold">{seller.responseTime}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Positive feedback</p><p className="mt-2 text-2xl font-bold">{isOfficialPlatformAccount ? '100%' : `${seller.feedback}%`}</p></div>
        </div>

        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <h2 className="text-lg font-semibold text-white">Seller feedback overview</h2>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-white/[0.03] text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Timeframe</th>
                    <th className="px-4 py-3 font-medium">Good</th>
                    <th className="px-4 py-3 font-medium">Neutral</th>
                    <th className="px-4 py-3 font-medium">Poor</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(feedbackMatrix).map(([period, values]) => (
                    <tr key={period} className="border-t border-white/10">
                      <td className="px-4 py-3 font-medium text-white">{period}</td>
                      <td className="px-4 py-3 text-emerald-300">{values.good}</td>
                      <td className="px-4 py-3 text-amber-300">{values.neutral}</td>
                      <td className="px-4 py-3 text-rose-300">{values.poor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <h2 className="text-lg font-semibold text-white">Trust signals</h2>
            </div>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0d0e14] px-3 py-2"><span>Identity Verified</span><span className="text-indigo-300">KYC</span></div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0d0e14] px-3 py-2"><span>Average Delivery Speed</span><span className="text-indigo-300">2 mins</span></div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0d0e14] px-3 py-2"><span>Success Rate</span><span className="text-indigo-300">{isOfficialPlatformAccount ? '100%' : '99.4%'}</span></div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-200">Storefront</p>
              <h2 className="text-2xl font-bold text-white">Other items for sale</h2>
            </div>
            <Link href="/products" className="text-sm font-medium text-indigo-300 transition hover:text-indigo-200">Browse catalog</Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <Link key={product.id} href={`/products/${product.slug}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#0d0e14] transition hover:border-indigo-500/50">
                <div className="flex items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-950 to-slate-900 p-4">
                  <img src={product.images[0]?.url} alt={product.name} className="h-20 w-20 rounded-2xl object-cover" />
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-indigo-300">{product.brand}</span>
                    <span className="text-xs text-slate-400">{product.deliveryType}</span>
                  </div>
                  <h3 className="font-semibold text-white">{product.name}</h3>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400 line-through">${product.originalPrice}</span>
                    <span className="text-lg font-bold text-indigo-300">${product.currentPrice}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-rose-500/30 bg-[#12151d] p-5 shadow-2xl shadow-rose-950/30">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-rose-300">Report vendor</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Flag this account</h3>
              </div>
              <button type="button" onClick={() => setShowReport(false)} className="rounded-full p-2 text-slate-400 hover:bg-white/5 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={reportText}
              onChange={(event) => setReportText(event.target.value)}
              maxLength={2000}
              rows={5}
              placeholder="Describe the issue or suspicious behavior..."
              className="w-full rounded-2xl border border-white/10 bg-[#0d0f14] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-rose-500/60 focus:outline-none"
            />

            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setShowReport(false)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Cancel</button>
              <button type="button" onClick={() => void handleReportSubmit()} disabled={!reportText.trim() || actionBusy === 'report'} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50">{actionBusy === 'report' ? 'Submitting...' : 'Submit report'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
