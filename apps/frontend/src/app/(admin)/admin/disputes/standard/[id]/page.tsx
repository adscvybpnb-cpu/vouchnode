'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminBadge, AdminPage } from '@/components/admin/AdminPage';
import { AdminChatViewer } from '@/components/admin/AdminChatViewer';
import { Button } from '@/components/ui/button';
import { adminService } from '@/services/admin.service';
import type { Dispute } from '@/types/api.types';
import { API_ORIGIN } from '@/lib/constants';

const evidenceUrl = (fileUrl: string) => {
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  return `${API_ORIGIN}/${fileUrl.replace(/^\/+/, '')}`;
};

type ProfileCardData = {
  id: string;
  name: string;
  email: string;
  disputes: number;
  riskScore: number;
};

export default function StandardDisputeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accountAction, setAccountAction] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [error, setError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [profiles, setProfiles] = useState<{ buyer: ProfileCardData | null; seller: ProfileCardData | null }>({ buyer: null, seller: null });

  useEffect(() => {
    let active = true;
    void adminService.getDispute(params.id)
      .then((result) => {
        if (active) {
          setDispute(result);
          const loadProfile = async (userId: string | undefined): Promise<ProfileCardData | null> => {
            if (!userId) return null;
            const details = await adminService.getUserDetails(userId);
            return {
              id: details.id,
              name: details.profile?.displayName || details.email,
              email: details.email,
              disputes: details.disputes.total,
              riskScore: Math.max(
                details.riskScore,
                details.disputes.total > details.trading.completedSales
                  ? Math.min(90, Math.max(10, details.disputes.total * 10))
                  : 0,
              ),
            };
          };
          void Promise.all([loadProfile(result.buyerId), loadProfile(result.sellerId)])
            .then(([buyer, seller]) => {
              if (active) setProfiles({ buyer, seller });
            })
            .catch(() => {
              if (active) setProfiles({ buyer: null, seller: null });
            });
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load dispute.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.id]);

  const resolve = (side: 'buyer' | 'seller') => {
    if (!dispute || busy) return;
    setBusy(true);
    setError('');
    const request = side === 'buyer'
      ? adminService.resolveDisputeForBuyer(params.id)
      : adminService.resolveDisputeForSeller(params.id);
    void request
      .then(() => {
        setBusy(false);
        router.push('/admin/disputes/standard/completed');
      })
      .catch((cause: unknown) => {
        setBusy(false);
        setError(cause instanceof Error ? cause.message : 'Unable to resolve dispute.');
      });
  };

  const updateAccountStatus = (userId: string | undefined, action: 'suspend' | 'ban', label: string) => {
    if (!userId || accountAction) return;
    setAccountAction(`${action}-${userId}`);
    setError('');
    setActionNotice('');
    const request = action === 'suspend'
      ? adminService.suspendUser(userId)
      : adminService.banUser(userId);
    void request
      .then(() => setActionNotice(`${label} account ${action === 'suspend' ? 'suspended' : 'banned'} successfully. Active market listings have been hidden.`))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : `Unable to ${action} account.`))
      .finally(() => setAccountAction(null));
  };

  return (
    <AdminPage
      title="Standard dispute review"
      description="Inspect the traditional marketplace dispute history, evidence, and conversation."
      loading={loading}
      error={error}
      onRetry={() => window.location.reload()}
    >
      {dispute && (
        <div className="min-h-full space-y-5 pb-8">
          {actionNotice && <p role="status" className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">{actionNotice}</p>}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div>
              <p className="text-sm text-slate-400">{dispute.disputeNumber || dispute.id}</p>
              <h2 className="mt-1 text-xl font-semibold text-white">{dispute.reason}</h2>
              <p className="mt-1 text-xs text-slate-500">Order: {dispute.order?.orderNumber || dispute.orderId}</p>
            </div>
            <AdminBadge value={dispute.status} />
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="font-semibold text-white">Description</h3>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{dispute.description || 'No description provided.'}</p>
            </section>
            <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="font-semibold text-white">System logs</h3>
              <div className="mt-3 space-y-3">
                {(dispute.timeline || []).map((event) => (
                  <div key={event.id} className="border-l border-cyan-400/40 pl-3">
                    <p className="text-sm text-slate-200">{event.action}</p>
                    <p className="text-xs text-slate-500">{event.description || 'No additional details.'}</p>
                    <time className="text-[11px] text-slate-600">{new Date(event.createdAt).toLocaleString()}</time>
                  </div>
                ))}
                {!dispute.timeline?.length && <p className="text-sm text-slate-500">No system logs available.</p>}
              </div>
            </section>
          </div>

          <section className="grid gap-5 lg:grid-cols-2">
            {(['buyer', 'seller'] as const).map((side) => (
              <div key={side} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
                <h3 className="font-semibold text-cyan-200">{side === 'buyer' ? "Buyer's Evidence" : "Seller's Evidence"}</h3>
                <div className="mt-3 space-y-3">
                  {(dispute.evidence || [])
                    .filter((item) => (item.uploaderId || item.uploadedBy) === (side === 'buyer' ? dispute.buyerId : dispute.sellerId))
                    .map((item) => (
                      <a key={item.id} href={evidenceUrl(item.fileUrl)} target="_blank" rel="noreferrer" className="block rounded-lg border border-white/10 p-3 text-sm text-cyan-200 hover:border-cyan-300/50">
                        View submitted evidence
                        {item.description && <span className="mt-1 block text-slate-400">{item.description}</span>}
                      </a>
                    ))}
                  {!dispute.evidence?.some((item) => (item.uploaderId || item.uploadedBy) === (side === 'buyer' ? dispute.buyerId : dispute.sellerId)) && (
                    <p className="text-sm text-slate-500">No evidence submitted.</p>
                  )}
                </div>
                {(() => {
                  const profile = side === 'buyer' ? profiles.buyer : profiles.seller;
                  const label = side === 'buyer' ? 'Buyer' : 'Seller';
                  return (
                    <div className="mt-5 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">{label} profile</p>
                      {profile ? (
                        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                          <div><dt className="text-slate-500">Full name</dt><dd><a href={`/admin/users/${encodeURIComponent(profile.id)}`} className="text-cyan-200 hover:text-cyan-100 hover:underline">{profile.name}</a></dd></div>
                          <div><dt className="text-slate-500">Email</dt><dd><a href={`/admin/users/${encodeURIComponent(profile.id)}`} className="break-all text-cyan-200 hover:text-cyan-100 hover:underline">{profile.email}</a></dd></div>
                          <div><dt className="text-slate-500">Past disputes</dt><dd className="text-white">{profile.disputes}</dd></div>
                          <div><dt className="text-slate-500">Risk score</dt><dd className={profile.riskScore >= 70 ? 'font-semibold text-red-300' : 'text-white'}>{profile.riskScore}%</dd></div>
                        </dl>
                      ) : <p className="mt-3 text-sm text-slate-500">Profile data unavailable.</p>}
                    </div>
                  );
                })()}
                <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!((side === 'buyer' ? dispute.buyerId : dispute.sellerId)) || Boolean(accountAction)}
                    isLoading={accountAction === `suspend-${side === 'buyer' ? dispute.buyerId : dispute.sellerId}`}
                    onClick={() => updateAccountStatus(side === 'buyer' ? dispute.buyerId : dispute.sellerId, 'suspend', side === 'buyer' ? 'Buyer' : 'Seller')}
                  >
                    Suspend {side === 'buyer' ? 'Buyer' : 'Seller'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!((side === 'buyer' ? dispute.buyerId : dispute.sellerId)) || Boolean(accountAction)}
                    isLoading={accountAction === `ban-${side === 'buyer' ? dispute.buyerId : dispute.sellerId}`}
                    onClick={() => updateAccountStatus(side === 'buyer' ? dispute.buyerId : dispute.sellerId, 'ban', side === 'buyer' ? 'Buyer' : 'Seller')}
                  >
                    Ban {side === 'buyer' ? 'Buyer' : 'Seller'}
                  </Button>
                </div>
              </div>
            ))}
          </section>

          <div className="flex flex-wrap gap-3">
            {dispute.order?.conversation?.id && (
              <Button variant="outline" onClick={() => setChatOpen(true)}>View chat and messages</Button>
            )}
            <Button isLoading={busy} disabled={busy} onClick={() => resolve('buyer')}>Resolve for buyer</Button>
            <Button isLoading={busy} disabled={busy} variant="secondary" onClick={() => resolve('seller')}>Resolve for seller</Button>
            <Button variant="outline" onClick={() => router.push('/admin/disputes/standard')}>Back to active disputes</Button>
          </div>
        </div>
      )}
      {chatOpen && dispute?.order?.conversation?.id && (
        <AdminChatViewer
          conversationId={dispute.order.conversation.id}
          buyerId={dispute.buyerId}
          sellerId={dispute.sellerId}
          title="Standard dispute conversation"
          onClose={() => setChatOpen(false)}
        />
      )}
    </AdminPage>
  );
}
