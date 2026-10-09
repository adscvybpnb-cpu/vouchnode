'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AdminListPage } from './AdminListPage';
import { AdminBadge } from './AdminPage';
import { adminService } from '@/services/admin.service';
import type { AdminP2PDisputeRow } from '@/services/admin.service';
import type { Dispute } from '@/types/api.types';

export function StandardDisputeStatusPage({ status, title }: { status: string; title: string }) {
  const load = useCallback((page: number) => adminService.getDisputes(page, status), [status]);
  return <AdminListPage<Dispute> title={title} description="Multi-day marketplace dispute handling and evidence review." headers={['Dispute', 'Order', 'Reason', 'Status', 'Created']} load={load} row={(item) => <><td className="px-4 py-4 font-medium text-white">{item.disputeNumber || item.id}</td><td className="px-4 py-4">{item.order?.orderNumber || item.orderId}</td><td className="px-4 py-4">{item.reason}</td><td className="px-4 py-4"><AdminBadge value={item.status} /></td><td className="px-4 py-4 text-slate-400">{new Date(item.createdAt).toLocaleString()}</td></>} />;
}

export function P2PDisputeStatusPage({ status, title }: { status: readonly string[]; title: string }) {
  const router = useRouter();
  const load = useCallback((page: number) => adminService.getP2PDisputes(page, status), [status]);
  return <AdminListPage<AdminP2PDisputeRow> title={title} description="High-priority P2P dispute queue. Review server-controlled deadlines immediately." headers={['Dispute', 'Order', 'Reason', 'Status', 'Payment deadline', 'Action']} load={load} row={(item) => <><td className="px-4 py-4 font-medium text-white">{item.id}</td><td className="px-4 py-4">{item.order?.id || '—'} · {item.order?.cryptoAsset || ''}</td><td className="px-4 py-4">{item.reason}</td><td className="px-4 py-4"><AdminBadge value={item.status} /></td><td className="px-4 py-4 text-slate-400">{item.order?.paymentDeadline ? new Date(item.order.paymentDeadline).toLocaleString() : 'No active deadline'}</td><td className="px-4 py-4"><button type="button" onClick={() => router.push(`/admin/disputes/${encodeURIComponent(item.id)}`)} className="rounded-lg border border-cyan-400/40 px-3 py-1.5 text-sm font-medium text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-400/10">Verify</button></td></>} />;
}
