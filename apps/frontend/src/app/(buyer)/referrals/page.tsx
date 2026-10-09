'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, Users, Wallet } from 'lucide-react';
import { apiClient } from '@/services/api.client';
import { APP_URL } from '@/lib/constants';

interface ReferralOverview {
  referralCode: string;
  totalFriendsInvited: number;
  totalCommissionEarned: number;
  currency: string;
}

function buildReferralUrl(referralCode: string) {
  const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const baseUrl = (runtimeOrigin || APP_URL).replace(/\/+$/, '');
  return `${baseUrl}/register?ref=${encodeURIComponent(referralCode)}`;
}

export default function ReferralsPage() {
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const referralUrl = overview ? buildReferralUrl(overview.referralCode) : '';

  useEffect(() => {
    let active = true;
    void apiClient.get<ReferralOverview>('/users/me/referrals').then((response) => {
      if (!active) return;
      if (response.error || !response.data) {
        setError(response.error || 'Unable to load referral details.');
        return;
      }
      setOverview(response.data);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const copyReferralUrl = async () => {
    if (!overview?.referralCode) return;
    try {
      await navigator.clipboard.writeText(buildReferralUrl(overview.referralCode));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Unable to copy the referral link. Please copy it manually.');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-300">Invite friends</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Referrals</h1>
        <p className="mt-2 text-slate-400">Share your link and earn when invited friends complete marketplace purchases.</p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-[#141420] p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300"><Link2 className="h-5 w-5" /></span>
          <div>
            <h2 className="font-semibold text-white">Your referral link</h2>
            <p className="text-sm text-slate-400">Friends who sign up using this link will be attributed to you.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            readOnly
            aria-label="Your referral link"
            value={loading ? 'Loading your referral link…' : referralUrl}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200 outline-none"
          />
          <button
            type="button"
            onClick={() => void copyReferralUrl()}
            disabled={loading || !referralUrl}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy Link'}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      </section>

      <section className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#141420] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Friends Invited</p>
              <p className="mt-3 text-3xl font-bold text-white">{loading ? '—' : overview?.totalFriendsInvited ?? 0}</p>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300"><Users className="h-6 w-6" /></span>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#141420] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Commission Earned</p>
              <p className="mt-3 text-3xl font-bold text-white">
                {loading ? '—' : `${overview?.currency || 'USDT'} ${Number(overview?.totalCommissionEarned || 0).toFixed(2)}`}
              </p>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300"><Wallet className="h-6 w-6" /></span>
          </div>
          <p className="mt-3 text-xs text-slate-500">1% of eligible purchase value, capped at 20% of the platform fee.</p>
        </div>
      </section>
      {loading && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading referral overview…</p>}
    </div>
  );
}
