'use client';
import { useCallback } from 'react';
import { AdminListPage } from '@/components/admin/AdminListPage';
import { AdminBadge } from '@/components/admin/AdminPage';
import { adminService } from '@/services/admin.service';
import type { Order } from '@/types/api.types';
export default function OrderArchivePage() {
  const load = useCallback((page: number, search?: string) => adminService.getOrderArchive(page, search), []);
  return <AdminListPage<Order> title="All Orders and Archive" description="Deep historical order lookbacks for fraud and operational audits." headers={['Order', 'Product', 'Amount', 'Status', 'Created']} load={load} searchable row={(order) => <><td className="px-4 py-4 font-medium text-white">{order.orderNumber || order.id}</td><td className="px-4 py-4">{order.product?.name || '—'}</td><td className="px-4 py-4">{Number(order.amount || 0).toFixed(2)} {order.currency}</td><td className="px-4 py-4"><AdminBadge value={order.status} /></td><td className="px-4 py-4 text-slate-400">{new Date(order.createdAt).toLocaleString()}</td></>} />;
}
