'use client';
import { useCallback } from 'react';
import { AdminListPage } from '@/components/admin/AdminListPage';
import { AdminBadge } from '@/components/admin/AdminPage';
import { adminService } from '@/services/admin.service';
import type { Transaction } from '@/types/api.types';
export default function TransactionsPage() {
  const load = useCallback((page: number, search?: string) => adminService.getTransactions(page, search), []);
  return <AdminListPage<Transaction> title="Transactions" description="Track marketplace payments and escrow movement." headers={['Transaction', 'Type', 'Amount', 'Status', 'Created']} load={load} searchable row={(transaction) => <><td className="px-4 py-4 font-medium text-white">{transaction.id}</td><td className="px-4 py-4">{transaction.type}</td><td className="px-4 py-4">{Number(transaction.amount).toFixed(2)} {transaction.currency}</td><td className="px-4 py-4"><AdminBadge value={transaction.status} /></td><td className="px-4 py-4 text-slate-400">{new Date(transaction.createdAt).toLocaleDateString()}</td></>} />;
}
