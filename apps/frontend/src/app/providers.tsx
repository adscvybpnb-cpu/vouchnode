'use client';

import dynamic from 'next/dynamic';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { hasUsableAccessToken, useAuthStore } from '../store/auth.store';
import { useSocket } from '../hooks/useSocket';
import { usePathname } from 'next/navigation';
import { usePushNotifications, usePushSoundListener } from '../hooks/usePushNotifications';
import { API_URL } from '../lib/constants';
import { getReferralCode } from '../lib/referral-attribution';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { walletSnapshotQueryKey, walletTransactionsQueryKey } from '../hooks/useWalletSnapshot';

const ReactQueryDevtools = dynamic(
  () => import('@tanstack/react-query-devtools').then((module) => module.ReactQueryDevtools),
  { ssr: false },
);

function SessionProfileRevalidator({ enabled }: { enabled: boolean }) {
  useCurrentUser(enabled);
  return null;
}

function WalletCacheRevalidator() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: walletSnapshotQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: walletTransactionsQueryKey(userId) });
    };
    window.addEventListener('wallet:updated', refresh);
    window.addEventListener('p2p:wallet-updated', refresh);
    return () => {
      window.removeEventListener('wallet:updated', refresh);
      window.removeEventListener('p2p:wallet-updated', refresh);
    };
  }, [queryClient, userId]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  const { accessToken, isAuthenticated } = useAuthStore();
  const hasSession = isAuthenticated && hasUsableAccessToken(accessToken);
  const pathname = usePathname() ?? '';
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const { socket: presenceSocket } = useSocket('/presence', !isAdminRoute);
  usePushNotifications(hasSession);
  usePushSoundListener();

  useEffect(() => {
    void useAuthStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    getReferralCode(window.location?.search ?? '');
  }, [pathname]);

  useEffect(() => {
    if (!presenceSocket) return;
    const handlePresenceUpdate = (payload: { userId: string; isOnline: boolean; onlineUntil: string | null }) => {
      window.dispatchEvent(new CustomEvent('presence:update', { detail: payload }));
    };
    const handleAccountStatusRevoked = (payload: { reason: 'BANNED' | 'SUSPENDED'; message: string }) => {
      presenceSocket.disconnect();
      useAuthStore.getState().clearAuth();
      queryClient.clear();
      void fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
        keepalive: true,
      }).catch((error: unknown) => {
        console.error('Unable to clear the revoked session cookie', error);
      });
      window.sessionStorage.setItem(
        'account-restriction-message',
        payload.message || 'Your account has been restricted by administration.',
      );
      window.location.replace('/login');
    };
    presenceSocket.on('presence:update', handlePresenceUpdate);
    presenceSocket.on('ACCOUNT_STATUS_REVOKED', handleAccountStatusRevoked);
    return () => {
      presenceSocket.off('presence:update', handlePresenceUpdate);
      presenceSocket.off('ACCOUNT_STATUS_REVOKED', handleAccountStatusRevoked);
    };
  }, [presenceSocket, queryClient]);

  useEffect(() => {
    const clearQueryCache = () => queryClient.clear();
    window.addEventListener('auth:cleared', clearQueryCache);
    return () => window.removeEventListener('auth:cleared', clearQueryCache);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProfileRevalidator
        enabled={hasSession && (pathname.startsWith('/seller') || pathname.startsWith('/dashboard'))}
      />
      <WalletCacheRevalidator />
      {children}
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
