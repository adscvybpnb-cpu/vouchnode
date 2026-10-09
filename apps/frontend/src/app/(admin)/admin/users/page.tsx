'use client';
import { useCallback } from 'react';
import { AdminListPage } from '@/components/admin/AdminListPage';
import { AdminBadge } from '@/components/admin/AdminPage';
import { adminService } from '@/services/admin.service';
import type { AdminUserRow } from '@/services/admin.service';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import Link from 'next/link';

export default function UsersPage() {
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const load = useCallback((page: number, search?: string) => adminService.getUsers(page, search), []);
  const updateStatus = async (id: string, action: 'suspend' | 'ban') => {
    setBusy(id);
    setActionError('');
    setHiddenIds((current) => new Set(current).add(id));
    try {
      if (action === 'suspend') await adminService.suspendUser(id);
      else await adminService.banUser(id);
    } catch (cause) {
      setHiddenIds((current) => { const next = new Set(current); next.delete(id); return next; });
      setActionError(cause instanceof Error ? cause.message : `Unable to ${action} user.`);
    } finally {
      setBusy('');
    }
  };
  return <AdminListPage<AdminUserRow> title="Users" description="Review accounts, verification, and access status." headers={['Account', 'Role', 'Verified', 'Actions']} load={load} searchable refreshInterval={0} actionError={actionError} filterItem={(user) => !hiddenIds.has(user.id)} row={(user) => <><td className="px-4 py-4"><Link href={`/admin/users/${encodeURIComponent(user.id)}`} className="block rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-300"><p className="font-medium text-cyan-100 hover:text-cyan-300">{user.profile?.displayName || user.username || user.email}</p><p className="text-xs text-slate-500 hover:text-cyan-300">{user.email}</p></Link></td><td className="px-4 py-4"><AdminBadge value={user.roles.length ? user.roles.join(', ') : user.role} /></td><td className="px-4 py-4"><AdminBadge value={user.isVerified} /></td><td className="px-4 py-4"><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={busy === user.id} isLoading={busy === user.id} onClick={() => void updateStatus(user.id, 'suspend')}>Suspend</Button><Button type="button" size="sm" variant="destructive" disabled={busy === user.id} isLoading={busy === user.id} onClick={() => void updateStatus(user.id, 'ban')}>Ban</Button></div></td></>} />;
}
