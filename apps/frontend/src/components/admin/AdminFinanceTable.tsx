'use client';

import { useCallback } from 'react';
import { AdminListPage } from './AdminListPage';
import { AdminBadge } from './AdminPage';
import { adminService } from '@/services/admin.service';

type FinanceRow = { id: string; currency: string; amount?: number | string | null; status: string; createdAt: string; wallet?: { userId: string; currency: string }; user?: { id: string; email: string; profile?: { username?: string; displayName?: string } | null } };

export function AdminFinanceTable({ kind, status, title }: { kind: 'deposit' | 'withdrawal'; status: string; title: string }) {
  const load = useCallback((page: number) => kind === 'deposit' ? adminService.getFinanceDeposits(status, page) : adminService.getFinanceWithdrawals(status, page), [kind, status]);
  return <AdminListPage<FinanceRow> title={title} description="Review financial activity from the database source of truth." headers={['ID', 'User', 'Asset', 'Amount', 'Status', 'Created']} load={load} row={(item) => <><td className="px-4 py-4 font-mono text-xs text-white">{item.id}</td><td className="px-4 py-4 text-xs">{item.user?.profile?.username || item.user?.email || item.wallet?.userId || '—'}</td><td className="px-4 py-4">{item.currency}</td><td className="px-4 py-4">{String(item.amount ?? '—')}</td><td className="px-4 py-4"><AdminBadge value={item.status} /></td><td className="px-4 py-4 text-slate-400">{new Date(item.createdAt).toLocaleString()}</td></>} />;
}
