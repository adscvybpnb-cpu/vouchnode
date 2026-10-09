'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  adminService,
  type AdminReferralSettings,
  type AdminReferralSummary,
  type AdminReferralTreeRow,
} from '@/services/admin.service';
import type { PaginatedResponse } from '@/types/api.types';

export default function AdminReferralsPage() {
  const [summary, setSummary] = useState<AdminReferralSummary | null>(null);
  const [settings, setSettings] = useState<AdminReferralSettings | null>(null);
  const [commissionRatePercent, setCommissionRatePercent] = useState('');
  const [platformFeeCapPercent, setPlatformFeeCapPercent] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [result, setResult] = useState<PaginatedResponse<AdminReferralTreeRow> | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReferrals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextSummary, nextResult, nextSettings] = await Promise.all([
        adminService.getReferralSummary(),
        adminService.getReferrals(page, appliedSearch),
        adminService.getReferralSettings(),
      ]);
      setSummary(nextSummary);
      setResult(nextResult);
      setSettings(nextSettings);
      setCommissionRatePercent(String(nextSettings.commissionRatePercent));
      setPlatformFeeCapPercent(String(nextSettings.platformFeeCapPercent));
    } catch (loadError) {
      console.error('Failed to load admin referrals', loadError);
      setError('Unable to load referral data. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, page]);

  useEffect(() => {
    void loadReferrals();
  }, [loadReferrals]);

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  };

  const saveSettings = async () => {
    const commissionRate = Number(commissionRatePercent);
    const platformFeeCap = Number(platformFeeCapPercent);
    if (
      !Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100 ||
      !Number.isFinite(platformFeeCap) || platformFeeCap < 0 || platformFeeCap > 100
    ) {
      setError('Referral rates must be between 0 and 100 percent.');
      return;
    }
    setSavingSettings(true);
    setSettingsSaved(false);
    setError('');
    try {
      const updated = await adminService.updateReferralSettings({
        enabled: settings?.enabled ?? true,
        commissionRatePercent: commissionRate,
        platformFeeCapPercent: platformFeeCap,
      });
      setSettings(updated);
      setCommissionRatePercent(String(updated.commissionRatePercent));
      setPlatformFeeCapPercent(String(updated.platformFeeCapPercent));
      setSettingsSaved(true);
    } catch (saveError) {
      console.error('Failed to update referral settings', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Unable to update referral settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 text-white">
      <div className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#12131a] p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-200">Admin controls</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Referrals &amp; affiliates</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Review referrer accounts, direct referral relationships, and commissions recorded by the platform.</p>
        </div>
        <form onSubmit={applySearch} className="flex gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search email, username, or code"
            className="min-w-0 rounded-xl border border-white/10 bg-[#0d0f14] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none"
          />
          <button type="submit" className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold hover:bg-indigo-400">Search</button>
        </form>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

      <section aria-label="Referral summary" className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#12131a] p-5">
          <p className="text-sm text-slate-400">Referred users</p>
          <p className="mt-2 text-3xl font-semibold">{loading && !summary ? '—' : (summary?.referredUsers ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#12131a] p-5">
          <p className="text-sm text-slate-400">Active referrers</p>
          <p className="mt-2 text-3xl font-semibold">{loading && !summary ? '—' : (summary?.activeReferrers ?? 0).toLocaleString()}</p>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-white/10 bg-[#12131a] p-5">
        <h2 className="text-lg font-semibold">Commissions recorded</h2>
        {!summary?.commissions.length
          ? <p className="mt-3 text-sm text-slate-400">{loading ? 'Loading commission totals…' : 'No referral commissions recorded.'}</p>
          : <div className="mt-3 flex flex-wrap gap-3">
            {summary.commissions.map((commission) => (
              <div key={commission.currency} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-slate-400">{commission.currency} · {commission.count} commissions</p>
                <p className="mt-1 font-semibold">{commission.amount} {commission.currency}</p>
              </div>
            ))}
          </div>}
      </section>

      <section className="mb-6 rounded-2xl border border-white/10 bg-[#12131a] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Referral policy</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">Changes apply to new completed-order commissions. Disabling bonuses does not reverse commissions already credited.</p>
          </div>
          <button
            type="button"
            disabled={!settings || savingSettings}
            onClick={() => void saveSettings()}
            className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50"
          >
            {savingSettings ? 'Saving…' : 'Save policy'}
          </button>
        </div>
        {settingsSaved && <p role="status" className="mt-3 text-sm text-emerald-300">Referral policy saved.</p>}
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <input
              type="checkbox"
              checked={settings?.enabled ?? false}
              disabled={!settings || savingSettings}
              onChange={(event) => setSettings((current) => current ? { ...current, enabled: event.target.checked } : current)}
              className="h-4 w-4 accent-indigo-400"
            />
            <span><span className="block text-sm font-medium">Referral bonuses enabled</span><span className="text-xs text-slate-400">Controls new bonus accruals</span></span>
          </label>
          <label className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span className="block text-sm font-medium">Commission rate (%)</span>
            <input type="number" min="0" max="100" step="0.1" value={commissionRatePercent} onChange={(event) => setCommissionRatePercent(event.target.value)} disabled={!settings || savingSettings} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0d0f14] px-3 py-2 text-sm text-white disabled:opacity-50" />
          </label>
          <label className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span className="block text-sm font-medium">Platform fee cap (%)</span>
            <input type="number" min="0" max="100" step="0.1" value={platformFeeCapPercent} onChange={(event) => setPlatformFeeCapPercent(event.target.value)} disabled={!settings || savingSettings} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0d0f14] px-3 py-2 text-sm text-white disabled:opacity-50" />
          </label>
        </div>
      </section>

      <div className="overflow-x-auto rounded-3xl border border-white/10 bg-[#12131a]">
        <table className="min-w-full text-left text-sm text-slate-200">
          <thead className="bg-white/[0.03] text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Referrer</th>
              <th className="px-4 py-3 font-medium">Referral code</th>
              <th className="px-4 py-3 font-medium">Direct referrals</th>
              <th className="px-4 py-3 font-medium">Commissions</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading referral accounts…</td></tr>}
            {!loading && result?.data.map((referrer) => (
              <tr key={referrer.id} className="border-t border-white/10 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium text-white">{referrer.profile?.displayName || referrer.profile?.username || referrer.email}</p>
                  <p className="text-xs text-slate-400">{referrer.email}</p>
                  {referrer.referredUsers.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-indigo-300">{referrer.referredUsers.length} latest direct referrals</summary>
                      <ul className="mt-2 space-y-1 border-l border-white/10 pl-3 text-xs text-slate-400">
                        {referrer.referredUsers.map((user) => (
                          <li key={user.id}>{user.profile?.displayName || user.profile?.username || user.email} · {user.email}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{referrer.referralCode || '—'}</td>
                <td className="px-4 py-3">{referrer.referredCount.toLocaleString()}</td>
                <td className="px-4 py-3">
                  {referrer.commissions.length
                    ? referrer.commissions.map((commission) => (
                      <p key={commission.currency}>{commission.amount} {commission.currency} <span className="text-xs text-slate-500">({commission.count})</span></p>
                    ))
                    : <span className="text-slate-500">None</span>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{new Date(referrer.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {!loading && result?.data.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No referrers found.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
        <span>{result?.total ?? 0} referrers</span>
        <div className="flex gap-2">
          <button disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40">Previous</button>
          <span className="px-2 py-1.5">Page {result?.page ?? page} of {Math.max(1, result?.totalPages ?? 1)}</span>
          <button disabled={page >= (result?.totalPages ?? 1) || loading} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
