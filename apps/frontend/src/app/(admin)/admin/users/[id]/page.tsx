'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AdminPage } from '@/components/admin/AdminPage';
import { adminService, type AdminUserDetails } from '@/services/admin.service';
import { Button } from '@/components/ui/button';

const money = (value: unknown) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 8 });
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : '—';

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AdminUserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState<'suspend' | 'ban' | null>(null);
  const load = useCallback(() => {
    if (!params.id) return;
    setLoading(true); setError('');
    void adminService.getUserDetails(params.id)
      .then(setUser)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load user details.'))
      .finally(() => setLoading(false));
  }, [params.id]);
  useEffect(load, [load]);
  const updateStatus = async (action: 'suspend' | 'ban') => {
    if (!user) return;
    setActionBusy(action); setError('');
    try {
      if (action === 'suspend') await adminService.suspendUser(user.id);
      else await adminService.banUser(user.id);
      setUser((current) => current ? { ...current, status: action === 'suspend' ? 'SUSPENDED' : 'BANNED', trading: { ...current.trading, activeListings: [] } } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to ${action} account.`);
    } finally {
      setActionBusy(null);
    }
  };

  return <AdminPage title={user?.profile?.displayName || user?.profile?.username || user?.email || 'User details'} description="Complete account, financial, trading, and fraud-risk inspection." loading={loading} error={error} onRetry={load} actions={<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!user || Boolean(actionBusy)} isLoading={actionBusy === 'suspend'} onClick={() => void updateStatus('suspend')}>Suspend Account</Button><Button variant="destructive" disabled={!user || Boolean(actionBusy)} isLoading={actionBusy === 'ban'} onClick={() => void updateStatus('ban')}>Ban Account</Button><button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" />Back</button></div>}>
    {user && <div className="h-full space-y-5 overflow-y-auto pr-1">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Account status" value={user.status} />
        <Metric label="KYC status" value={user.kycStatus} />
        <Metric label="Risk score" value={`${user.riskScore}% (${user.riskLevel})`} critical={user.criticalRiskTrigger} />
        <Metric label="Registered" value={date(user.createdAt)} />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel title="Identity & security">
          <Detail label="Email" value={user.email} /><Detail label="Roles" value={user.roles.join(', ') || '—'} /><Detail label="Email verified" value={user.emailVerified ? 'Yes' : 'No'} /><Detail label="Two-factor authentication" value={user.twoFactorEnabled ? 'Enabled' : 'Disabled'} /><Detail label="Last login" value={`${date(user.lastLoginAt)} · ${user.lastLoginIp || 'No IP recorded'}`} /><Detail label="Seller account" value={user.seller ? `${user.seller.shopName} (${user.seller.status})` : 'No seller profile'} />
        </Panel>
        <Panel title="Financial overview">
          <Detail label="Total deposits" value={money(user.financials.totalDeposits)} /><Detail label="Total withdrawals" value={money(user.financials.totalWithdrawals)} />
          <div className="mt-3 space-y-2">{user.financials.wallets.map((wallet) => <div key={wallet.id} className="rounded-lg border border-white/10 p-3 text-sm"><div className="flex justify-between font-semibold text-white"><span>{wallet.currency}</span><span>Available {money(wallet.availableBalance)}</span></div><p className="mt-1 text-xs text-slate-400">Frozen {money(wallet.frozenBalance)} · Escrow {money(wallet.escrowBalance)} · Pending {money(wallet.pendingBalance)}</p></div>)}</div>
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel title="Trading activity">
          <Detail label="Completed sales" value={`${user.trading.completedSales} (${money(user.trading.completedSalesTotal)} total)`} /><Detail label="Feedback score" value={`${user.trading.feedback.averageRating.toFixed(2)} / 5 (${user.trading.feedback.count} ratings)`} />
          <h3 className="mt-4 text-sm font-semibold text-white">Active listings</h3>
          <div className="mt-2 space-y-2">{user.trading.activeListings.length ? user.trading.activeListings.map((listing) => <div key={listing.id} className="flex justify-between rounded-lg border border-white/10 p-2 text-sm"><span className="text-slate-200">{listing.name}</span><span className="text-slate-400">{listing.currency} {money(listing.currentPrice)} · {listing.status}</span></div>) : <p className="text-sm text-slate-500">No active listings.</p>}</div>
        </Panel>
        <Panel title="Dispute & fraud indicators">
          <Detail label="Open disputes" value={String(user.disputes.open)} /><Detail label="Closed disputes" value={String(user.disputes.closed)} /><Detail label="Known IP addresses" value={user.security.knownIps.join(', ') || 'None recorded'} />
          <div className="mt-3 space-y-2">{user.disputes.records.map((dispute) => <Link key={dispute.id} href={`/admin/disputes/${dispute.id}`} className="flex justify-between rounded-lg border border-white/10 p-2 text-sm hover:border-cyan-300/50"><span className="text-cyan-200">{dispute.disputeNumber}</span><span className="text-slate-400">{dispute.status}</span></Link>)}</div>
          <h3 className="mt-4 text-sm font-semibold text-white">Recent audit activity</h3>
          <div className="mt-2 space-y-2">{user.security.auditLogs.slice(0, 8).map((log) => <div key={log.id} className="rounded-lg border border-white/10 p-2 text-xs"><span className="text-slate-200">{log.action}</span><span className="ml-2 text-slate-500">{log.ipAddress || 'no IP'} · {date(log.createdAt)}</span></div>)}</div>
        </Panel>
      </section>

      <Panel title="Deposit history">
        <HistoryTable headers={['Date', 'Currency', 'Amount', 'Status', 'Transaction']} rows={user.financials.deposits.map((entry) => [date(entry.createdAt), entry.currency, money(entry.amount), entry.status, entry.cryptoTxHash || '—'])} />
      </Panel>
      <Panel title="Withdrawal history">
        <HistoryTable headers={['Date', 'Currency', 'Amount', 'Net amount', 'Status']} rows={user.financials.withdrawals.map((entry) => [date(entry.createdAt), entry.currency, money(entry.amount), money(entry.netAmount), entry.status])} />
      </Panel>
      <Panel title="Order history">
        <div className="space-y-2">{user.recentOrders.map((order) => <Link key={order.id} href={`/admin/orders/${order.id}`} className="flex justify-between rounded-lg border border-white/10 p-3 text-sm hover:border-cyan-300/50"><span className="text-cyan-200">{order.orderNumber}</span><span className="text-slate-400">{order.status} · {order.currency} {money(order.totalAmount)}</span></Link>)}</div>
      </Panel>
    </div>}
  </AdminPage>;
}

function Metric({ label, value, critical }: { label: string; value: string; critical?: boolean }) {
  return <div className={`rounded-xl border bg-white/[0.02] p-4 ${critical ? 'border-red-500/70 bg-red-500/10' : 'border-white/10'}`}><p className={`text-xs uppercase tracking-wider ${critical ? 'text-red-300' : 'text-slate-500'}`}>{label}</p><p className={`mt-2 text-sm font-semibold ${critical ? 'text-red-200' : 'text-white'}`}>{value}</p></div>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5"><h2 className="text-lg font-semibold text-white">{title}</h2>{children}</section>;
}
function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 border-b border-white/5 py-2 text-sm"><span className="text-slate-500">{label}</span><span className="text-right text-slate-200">{value}</span></div>;
}
function HistoryTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">{headers.map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-b border-white/5 text-slate-300">{row.map((value, cellIndex) => <td key={`${cellIndex}-${value}`} className="px-3 py-2">{value}</td>)}</tr>)}</tbody></table>{rows.length === 0 && <p className="py-5 text-sm text-slate-500">No records found.</p>}</div>;
}
