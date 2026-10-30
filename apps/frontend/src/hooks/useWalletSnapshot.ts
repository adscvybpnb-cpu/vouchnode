import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { walletService } from '../services/wallet.service';
import { useAuthStore } from '../store/auth.store';
import type { PortfolioSummary } from '../types/api.types';

export type WalletSnapshot = {
  portfolio: PortfolioSummary;
};

export const walletSnapshotQueryKey = (userId: string) => ['wallet', 'snapshot', userId] as const;
export const walletTransactionsQueryKey = (userId: string) => ['wallet', 'transactions', userId] as const;

export function useWalletSnapshot() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryKey = useMemo(
    () => walletSnapshotQueryKey(userId ?? 'anonymous'),
    [userId],
  );
  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<WalletSnapshot> => ({
      portfolio: await walletService.getPortfolio(),
    }),
    enabled: Boolean(userId),
    staleTime: 10_000,
  });

  return query;
}
