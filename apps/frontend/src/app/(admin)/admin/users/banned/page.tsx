import { UserStatusListPage } from '@/components/admin/UserStatusListPage';

export default function BannedUsersPage() {
  return <UserStatusListPage status="BANNED" title="Banned Users" description="Review banned accounts and restore access when appropriate." />;
}
