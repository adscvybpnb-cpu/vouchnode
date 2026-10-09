import { UserStatusListPage } from '@/components/admin/UserStatusListPage';

export default function SuspendedUsersPage() {
  return <UserStatusListPage status="SUSPENDED" title="Suspended Users" description="Review suspended accounts and restore access when appropriate." />;
}
