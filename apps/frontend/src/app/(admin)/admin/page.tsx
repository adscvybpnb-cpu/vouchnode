'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AdminPage } from '@/components/admin/AdminPage';
import { adminService, type AdminDashboardStats } from '@/services/admin.service';

const cards: Array<[keyof AdminDashboardStats, string]> = [
  ['totalUsers', 'Users'],
  ['totalSellers', 'Sellers'],
  ['totalProducts', 'Products'],
  ['totalOrders', 'Orders'],
  ['pendingKyc', 'Pending KYC'],
  ['openDisputes', 'Open disputes'],
  ['pendingDeposits', 'Pending deposits'],
  ['pendingWithdrawals', 'Pending withdrawals'],
];

export default function AdminDashboardPage() {
  const { data: stats, error: queryError, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'dashboard', 'stats'],
    queryFn: () => adminService.getDashboardStats(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const error = queryError instanceof Error ? queryError.message : queryError ? 'Unable to load dashboard statistics.' : '';

  return <AdminPage title="Operations overview" description="Live platform counters sourced from users, sellers, orders, KYC, disputes, deposits, and withdrawals." loading={isLoading} error={stats ? '' : error} onRetry={() => void refetch()}>
    {stats && <>{error && <p role="alert" className="mb-4 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-200">Could not refresh dashboard statistics: {error}</p>}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cards.map(([key, label]) => <div key={key} className="rounded-2xl border border-white/10 bg-[#12131a] p-5"><p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold text-white">{Number(stats[key] || 0).toLocaleString()}</p></div>)}</div><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['/admin/users', 'Search users'], ['/admin/kyc', 'Review KYC'], ['/admin/orders', 'Monitor orders'], ['/admin/catalog', 'Inspect live catalog']].map(([href, label]) => <Link key={href} href={href} className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-cyan-200 hover:bg-cyan-400/10">{label}</Link>)}</div></>}
  </AdminPage>;
}
