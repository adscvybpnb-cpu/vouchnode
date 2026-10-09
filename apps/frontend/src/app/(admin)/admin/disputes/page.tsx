'use client';
import Link from 'next/link';
import { useCallback } from 'react';
import { AdminListPage } from '@/components/admin/AdminListPage';
import { AdminBadge } from '@/components/admin/AdminPage';
import { adminService } from '@/services/admin.service';
import type { Dispute } from '@/types/api.types';
export default function DisputesPage() {
  const load = useCallback((page: number) => adminService.getDisputes(page), []);
  return <AdminListPage<Dispute> title="Disputes" description="Investigate escalations and make auditable buyer or seller resolutions." headers={['Dispute', 'Order', 'Reason', 'Status', 'Open']} load={load} row={(dispute) => <><td className="px-4 py-4 font-medium text-white">{dispute.disputeNumber || dispute.id}</td><td className="px-4 py-4">{dispute.order?.orderNumber || dispute.orderId}</td><td className="max-w-xs truncate px-4 py-4">{dispute.reason}</td><td className="px-4 py-4"><AdminBadge value={dispute.status} /></td><td className="px-4 py-4"><Link className="text-cyan-300 hover:text-cyan-200" href={`/admin/disputes/${dispute.id}`}>Review</Link></td></>} />;
}
