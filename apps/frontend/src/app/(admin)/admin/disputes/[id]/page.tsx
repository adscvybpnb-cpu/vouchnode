'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminBadge, AdminPage } from '@/components/admin/AdminPage';
import { Button } from '@/components/ui/button';
import { adminService } from '@/services/admin.service';
import type { Dispute } from '@/types/api.types';
import { AdminChatViewer } from '@/components/admin/AdminChatViewer';
type ProfileCard = {
  id: string;
  name: string;
  email: string;
  metrics: {
    thirtyDayOrders: number;
    totalCompletedOrders: number;
    thirtyDayCompletionRate: number;
    positiveRating: number;
    accountAgeDays: number;
  } | null;
};

export default function DisputeDetailPage() {
  const params = useParams<{ id: string }>(); const router = useRouter();
  const [dispute, setDispute] = useState<Dispute | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [chatOpen, setChatOpen] = useState(false);
  const [profiles, setProfiles] = useState<{ buyer: ProfileCard | null; seller: ProfileCard | null }>({ buyer: null, seller: null });
  const [accountAction, setAccountAction] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void adminService.getDispute(params.id).then((result) => {
      if (!active) return;
      if (result.disputeType !== 'STANDARD' && result.disputeType !== 'P2P') {
        setError('This dispute has no valid dispute type. Resolution actions have been disabled.');
        return;
      }
      setDispute(result);
      const loadProfile = async (id?: string) => {
        if (!id) return null;
        const details = await adminService.getUserDetails(id);
        return { id: details.id, name: details.profile?.displayName || details.email, email: details.email, metrics: null };
      };
      void Promise.all([loadProfile(result.buyerId), loadProfile(result.sellerId)])
        .then(async ([buyer, seller]) => {
          const metrics = await adminService.getP2PUserMetrics([result.buyerId, result.sellerId].filter((id): id is string => Boolean(id)));
          const byUserId = new Map(metrics.map((item) => [item.userId, item]));
          if (active) setProfiles({
            buyer: buyer ? { ...buyer, metrics: byUserId.get(buyer.id) || null } : null,
            seller: seller ? { ...seller, metrics: byUserId.get(seller.id) || null } : null,
          });
        })
        .catch(() => { if (active) setProfiles({ buyer: null, seller: null }); });
    }).catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : 'Unable to load dispute.')).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.id]);
  const resolve = (side: 'buyer' | 'seller') => {
    if (!dispute || busy) return;
    setError('');
    setBusy(true);
    if (dispute.disputeType !== 'P2P' && dispute.disputeType !== 'STANDARD') {
      setBusy(false);
      setError('This dispute has no valid dispute type and cannot be resolved.');
      return;
    }
    const isP2P = dispute.disputeType === 'P2P';
    const request = isP2P
      ? adminService.resolveP2PDispute(params.id, side === 'buyer' ? 'RESOLVED_BUYER' : 'RESOLVED_SELLER')
      : side === 'buyer'
        ? adminService.resolveDisputeForBuyer(params.id)
        : adminService.resolveDisputeForSeller(params.id);
    void request
      .then(() => {
        setBusy(false);
        router.push(isP2P ? '/admin/disputes/quick-p2p/completed' : '/admin/disputes/standard/completed');
      })
      .catch((requestError: unknown) => {
        setBusy(false);
        setError(requestError instanceof Error ? requestError.message : 'Unable to resolve dispute.');
      });
  };
  const moderate = (id: string | undefined, action: 'suspend' | 'ban') => {
    if (!id || accountAction) return;
    setAccountAction(`${action}-${id}`);
    const request = action === 'suspend' ? adminService.suspendUser(id) : adminService.banUser(id);
    void request.catch((cause: unknown) => setError(cause instanceof Error ? cause.message : `Unable to ${action} account.`)).finally(() => setAccountAction(null));
  };
  return <div className="min-h-full overflow-y-auto pb-8"><AdminPage title="Dispute review" description="Review the evidence, live buyer-seller conversation, and final resolution." loading={loading} error={error} onRetry={() => window.location.reload()}>{dispute && <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-5"><div><p className="text-sm text-slate-400">{dispute.disputeNumber || dispute.id}</p><h2 className="mt-1 text-xl font-semibold">{dispute.reason}</h2></div><AdminBadge value={dispute.status} /></div><div className="grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-white/10 bg-white/[0.02] p-5"><h3 className="font-semibold">Description</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{dispute.description || 'No description provided.'}</p><p className="mt-5 text-xs text-slate-500">Order: {dispute.order?.orderNumber || dispute.orderId}</p></section><section className="rounded-xl border border-white/10 bg-white/[0.02] p-5"><h3 className="font-semibold">Timeline</h3><div className="mt-3 space-y-3">{(dispute.timeline || []).map((event) => <div key={event.id} className="border-l border-cyan-400/40 pl-3"><p className="text-sm text-slate-200">{event.action}</p><p className="text-xs text-slate-500">{event.description || 'No additional details.'}</p></div>)}</div></section></div><section className="grid gap-5 lg:grid-cols-2">{(['buyer', 'seller'] as const).map((side) => { const profile = profiles[side]; const id = side === 'buyer' ? dispute.buyerId : dispute.sellerId; const label = side === 'buyer' ? 'Buyer' : 'Seller'; const metrics = profile?.metrics; return <div key={side} className="rounded-xl border border-white/10 bg-white/[0.02] p-5"><h3 className="font-semibold text-cyan-200">{label} inspection</h3>{profile && <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><p className="text-slate-500">Full name</p><a href={`/admin/users/${profile.id}`} className="text-cyan-200 hover:underline">{profile.name}</a></div><div><p className="text-slate-500">Email</p><a href={`/admin/users/${profile.id}`} className="break-all text-cyan-200 hover:underline">{profile.email}</a></div>{metrics ? <><div><p className="text-slate-500">30-Day Orders</p><p>{metrics.thirtyDayOrders}</p></div><div><p className="text-slate-500">Total Completed Orders</p><p>{metrics.totalCompletedOrders}</p></div>  <div><p className="text-slate-500">30-Day Completion Rate (%)</p><p>{metrics.thirtyDayCompletionRate.toFixed(1)}%</p></div><div><p className="text-slate-500">Positive Rating (%)</p><p>{metrics.positiveRating.toFixed(1)}%</p></div><div><p className="text-slate-500">Account Age (Days)</p><p>{metrics.accountAgeDays}</p></div></> : <p className="text-sm text-slate-500">P2P metrics unavailable.</p>}</div>}<div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4"><Button size="sm" variant="outline" disabled={!id || Boolean(accountAction)} isLoading={accountAction === `suspend-${id}`} onClick={() => moderate(id, 'suspend')}>Suspend {label}</Button><Button size="sm" variant="secondary" disabled={!id || Boolean(accountAction)} isLoading={accountAction === `ban-${id}`} onClick={() => moderate(id, 'ban')}>Ban {label}</Button></div></div>; })}</section><section className="grid gap-5 lg:grid-cols-2">{(['buyer', 'seller'] as const).map((side) => <div key={side} className="rounded-xl border border-white/10 bg-white/[0.02] p-5"><h3 className="font-semibold text-cyan-200">{side === 'buyer' ? "Buyer's Evidence" : "Seller's Evidence"}</h3><div className="mt-3 space-y-3">{(dispute.evidence || []).filter((item) => side === 'buyer' ? (item.uploaderId || item.uploadedBy) === dispute.buyerId : (item.uploaderId || item.uploadedBy) === dispute.sellerId).map((item) => <a key={item.id} href={item.fileUrl} target="_blank" rel="noreferrer" className="block rounded-lg border border-white/10 p-3 text-sm text-cyan-200 hover:border-cyan-300/50">View submitted evidence{item.description ? <span className="mt-1 block text-slate-400">{item.description}</span> : null}</a>)}</div></div>)}</section><div className="flex flex-wrap gap-3">{dispute.order?.conversation?.id && <Button variant="outline" onClick={() => setChatOpen(true)}>Enter live chat</Button>}<Button isLoading={busy} disabled={busy} onClick={() => resolve('buyer')}>Resolve for buyer</Button><Button isLoading={busy} disabled={busy} variant="secondary" onClick={() => resolve('seller')}>Resolve for seller</Button><Button variant="outline" onClick={() => router.push('/admin/disputes')}>Back to disputes</Button></div></div>}</AdminPage>{chatOpen && dispute?.order?.conversation?.id && <AdminChatViewer conversationId={dispute.order.conversation.id} buyerId={dispute.buyerId} sellerId={dispute.sellerId} title="Dispute conversation" onClose={() => setChatOpen(false)} />}</div>;
}
