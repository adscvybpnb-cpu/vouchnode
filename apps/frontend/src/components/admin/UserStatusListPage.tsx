'use client';

import { useCallback, useState } from 'react';
import { AdminBadge } from './AdminPage';
import { AdminListPage } from './AdminListPage';
import { Button } from '@/components/ui/button';
import { adminService } from '@/services/admin.service';
import type { AdminUserRow } from '@/services/admin.service';
import Link from 'next/link';

export function UserStatusListPage({ status, title, description }: { status: 'SUSPENDED' | 'BANNED'; title: string; description: string }) {
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [reloadVersion, setReloadVersion] = useState(0);
  const load = useCallback((page: number, search?: string) => status === 'SUSPENDED' ? adminService.getSuspendedUsers(page, search) : adminService.getBannedUsers(page, search), [reloadVersion, status]);
  const activate = async (id: string) => {
    setBusy(id);
    setActionError('');
    setSuccessMessage('');
    setHiddenIds((current) => new Set(current).add(id));
    try {
      await adminService.activateUser(id);
      setSuccessMessage('User activated successfully');
      setReloadVersion((version) => version + 1);
    } catch (cause) {
      setHiddenIds((current) => { const next = new Set(current); next.delete(id); return next; });
      setActionError(cause instanceof Error ? cause.message : 'Unable to activate account.');
    } finally {
      setBusy('');
    }
  };
  return <>
    {successMessage && <div role="status" className="mx-auto mb-4 max-w-7xl rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{successMessage}</div>}
    <AdminListPage<AdminUserRow> title={title} description={description} headers={['Account', 'Role', 'Status', 'Actions']} load={load} searchable refreshInterval={0} actionError={actionError} filterItem={(user) => !hiddenIds.has(user.id)} row={(user) => <><td className="px-4 py-4"><Link href={`/admin/users/${encodeURIComponent(user.id)}`} className="block rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-300"><p className="font-medium text-cyan-100 hover:text-cyan-300">{user.profile?.displayName || user.username || user.email}</p><p className="text-xs text-slate-500 hover:text-cyan-300">{user.email}</p></Link></td><td className="px-4 py-4"><AdminBadge value={user.roles.length ? user.roles.join(', ') : user.role} /></td><td className="px-4 py-4"><AdminBadge value={user.status || status} /></td><td className="px-4 py-4"><Button type="button" size="sm" disabled={busy === user.id} isLoading={busy === user.id} onClick={() => void activate(user.id)}>Activate Account</Button></td></>} />
  </>;
}
