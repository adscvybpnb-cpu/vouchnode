'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useAuthStore } from '@/store/auth.store';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  useEffect(() => {
    if (hasHydrated && pathname !== '/admin/login' && (!token || !isAuthenticated || user?.role !== 'ADMIN')) router.replace('/admin/login');
  }, [hasHydrated, isAuthenticated, pathname, router, token, user]);
  if (pathname === '/admin/login') return children;
  if (!hasHydrated || !token || !isAuthenticated || user?.role !== 'ADMIN') return null;
  return <div className="flex min-h-screen h-screen overflow-hidden bg-[#080a10]"><AdminSidebar /><main className="min-w-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</main></div>;
}