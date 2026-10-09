'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown, Archive, ClipboardList, FileWarning, Flag, LayoutDashboard, LogOut, Receipt, Settings, ShieldAlert, Store, Users, WalletCards, Share2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };
type NavGroup = { label: string; icon: typeof Users; children: NavItem[] };

const groups: NavGroup[] = [
  { label: 'Users', icon: Users, children: [
    { href: '/admin/users', label: 'Active Users', icon: Users },
    { href: '/admin/users/suspended', label: 'Suspended Users', icon: ShieldAlert },
    { href: '/admin/users/banned', label: 'Banned Users', icon: ShieldAlert },
  ] },
  { label: 'KYC', icon: ShieldAlert, children: [
    { href: '/admin/kyc', label: 'Pending KYC', icon: ShieldAlert },
    { href: '/admin/kyc/approved', label: 'Approved KYC', icon: ShieldAlert },
    { href: '/admin/kyc/rejected', label: 'Rejected KYC', icon: ShieldAlert },
  ] },
  { label: 'Deposits', icon: WalletCards, children: [
    { href: '/admin/finance/deposits/pending', label: 'Pending Deposits', icon: WalletCards },
    { href: '/admin/finance/deposits/completed', label: 'Completed Deposits', icon: WalletCards },
    { href: '/admin/finance/deposits/cancelled', label: 'Cancelled Deposits', icon: WalletCards },
    { href: '/admin/finance/address-pool', label: 'Static Address Pool', icon: WalletCards },
  ] },
  { label: 'Withdrawals', icon: WalletCards, children: [
    { href: '/admin/finance/withdrawals/pending', label: 'Pending Withdrawals', icon: WalletCards },
    { href: '/admin/finance/withdrawals/completed', label: 'Completed Withdrawals', icon: WalletCards },
    { href: '/admin/finance/withdrawals/cancelled', label: 'Cancelled Withdrawals', icon: WalletCards },
  ] },
  { label: 'Standard Disputes', icon: Flag, children: [
    { href: '/admin/disputes/standard', label: 'Active Standard Disputes', icon: Flag },
    { href: '/admin/disputes/standard/completed', label: 'Completed Standard Disputes', icon: Flag },
  ] },
  { label: 'Quick P2P Disputes', icon: Flag, children: [
    { href: '/admin/disputes/quick-p2p', label: 'Active P2P Disputes', icon: Flag },
    { href: '/admin/disputes/quick-p2p/completed', label: 'Completed P2P Disputes', icon: Flag },
  ] },
  { label: 'Live Products Catalog', icon: Store, children: [
    { href: '/admin/catalog', label: 'Live Products', icon: Store },
    { href: '/admin/catalog/archived', label: 'Deleted/Archived Products', icon: Archive },
  ] },
  { label: 'Affiliates', icon: Share2, children: [
    { href: '/admin/referrals', label: 'Referrals', icon: Share2 },
  ] },
];

const standalone: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/orders', label: 'Active Orders', icon: ClipboardList },
  { href: '/admin/orders/archive', label: 'All Orders / Archive', icon: Archive },
  { href: '/admin/sellers', label: 'Seller Management', icon: Store },
  { href: '/admin/transactions', label: 'Transactions', icon: Receipt },
  { href: '/admin/reports', label: 'Reports', icon: FileWarning },
  { href: '/admin/fraud', label: 'Fraud', icon: ShieldAlert },
  { href: '/admin/audit-logs', label: 'Audit logs', icon: Receipt },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const signOut = () => {
    clearAuth();
    window.location.replace('/admin/login');
  };
  const renderItem = ({ href, label, icon: Icon }: NavItem, nested = false) => {
    const active = href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    return <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${nested ? 'ml-4 text-xs' : ''} ${active ? 'bg-cyan-400/10 text-cyan-200' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><Icon className="h-4 w-4" />{label}</Link>;
  };
  return <aside translate="no" className="notranslate flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#0b0d14]">
    <div className="shrink-0 p-5 pb-3">
      <Link href="/admin" translate="no" className="notranslate text-lg font-bold tracking-tight text-white">VouchNode <span translate="no" className="notranslate text-cyan-300">Admin</span></Link>
    </div>
    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 pb-3 pr-4">
        {standalone.slice(0, 1).map((item) => renderItem(item))}
        {groups.map((group) => {
          const GroupIcon = group.icon;
          const expanded = open[group.label] ?? group.children.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
          return <div key={group.label}>
            <button type="button" onClick={() => setOpen((current) => ({ ...current, [group.label]: !expanded }))} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"><span className="flex items-center gap-3"><GroupIcon className="h-4 w-4" />{group.label}</span><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
            {expanded && <div className="mt-1 space-y-1">{group.children.map((item) => renderItem(item, true))}</div>}
          </div>;
        })}
        {standalone.slice(1).map((item) => renderItem(item))}
    </nav>
    <div className="shrink-0 border-t border-white/10 p-5">
      <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-red-400/10 hover:text-red-200">
        <LogOut className="h-4 w-4" />
        Sign Out
      </button>
    </div>
  </aside>;
}
