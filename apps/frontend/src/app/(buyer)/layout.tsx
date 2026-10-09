'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { Header } from '@/components/layout/Header';
import { DashboardSidebar } from '@/components/layout/DashboardSidebar';
import { TelegramVerificationBanner } from '@/components/layout/TelegramVerificationBanner';

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const router = useRouter();
  const [navigationOpen, setNavigationOpen] = useState(false);

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.replace('/login');
    }
  }, [hasHydrated, isAuthenticated, router]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated) return;
    router.prefetch('/dashboard/wallet/deposit');
    router.prefetch('/dashboard/wallet/withdraw');
    router.prefetch('/p2p-offers');
    router.prefetch('/products?category=all');
  }, [hasHydrated, isAuthenticated, router]);

  // Show nothing while hydrating or while unauthenticated (redirect pending)
  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0A0A0F]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <span className="text-sm text-slate-500">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <Header onMenuClick={() => setNavigationOpen(true)} />
      <TelegramVerificationBanner />
      <DashboardSidebar open={navigationOpen} onClose={() => setNavigationOpen(false)} />
      <main className="min-h-[calc(100vh-4rem)] min-w-0 overflow-x-hidden bg-background p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </>
  );
}
