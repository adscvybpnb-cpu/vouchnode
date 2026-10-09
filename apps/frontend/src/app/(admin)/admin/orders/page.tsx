'use client';
import { useCallback } from 'react';
import { AdminListPage } from '@/components/admin/AdminListPage';
import { AdminBadge } from '@/components/admin/AdminPage';
import { adminService } from '@/services/admin.service';
import type { Order } from '@/types/api.types';
import { useState } from 'react';
import { AdminChatViewer } from '@/components/admin/AdminChatViewer';
export default function OrdersPage() {
  const load = useCallback((page: number, search?: string) => adminService.getOrders(page, search), []);
  const [chatId, setChatId] = useState<string | null>(null);
  return <><AdminListPage<Order> title="Orders" description="Monitor fulfillment, payment, escrow, and live buyer-seller activity." headers={['Order', 'Product', 'Amount', 'Status', 'Escrow / Chat', 'Created']} load={load} searchable row={(order) => <><td className="px-4 py-4 font-medium text-white">{order.orderNumber || order.id}</td><td className="px-4 py-4">{order.product?.name || '—'}</td><td className="px-4 py-4">{Number(order.amount || 0).toFixed(2)} {order.currency}</td><td className="px-4 py-4"><AdminBadge value={`${order.status} · ${order.paymentStatus || 'PAYMENT_UNKNOWN'}`} /></td><td className="px-4 py-4">{order.conversation?.id ? <button type="button" onClick={() => setChatId(order.conversation!.id)} className="text-cyan-300 hover:text-cyan-200">Enter live chat</button> : <span className="text-slate-500">No chat</span>}</td><td className="px-4 py-4 text-slate-400">{new Date(order.createdAt).toLocaleString()}</td></>} />{chatId && <AdminChatViewer conversationId={chatId} title="Order conversation" onClose={() => setChatId(null)} />}</>;
}
