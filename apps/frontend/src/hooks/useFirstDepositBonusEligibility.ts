'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api.client';
import { hasUsableAccessToken, useAuthStore } from '@/store/auth.store';

export type FirstDepositBonusEligibility = {
  eligible: boolean;
  claimed: boolean;
  totalDepositedUsd: number;
};

export const firstDepositBonusEligibilityQueryKey = (userId: string) => [
  'wallet',
  'first-deposit-bonus-eligibility',
  userId,
] as const;

export function useFirstDepositBonusEligibility() {
  const { accessToken, hasHydrated, isAuthenticated, user } = useAuthStore();
  const hasSession = isAuthenticated && hasUsableAccessToken(accessToken);
  const userId = user?.id;
  const query = useQuery({
    queryKey: firstDepositBonusEligibilityQueryKey(userId ?? ''),
    enabled: hasHydrated && hasSession && Boolean(userId),
    queryFn: async (): Promise<FirstDepositBonusEligibility> => {
      const { data, error } = await apiClient.get<FirstDepositBonusEligibility>(
        '/wallet/first-deposit-bonus/eligibility',
      );
      if (error || !data) {
        throw new Error(error || 'Unable to check first-deposit bonus eligibility.');
      }
      return data;
    },
    refetchInterval: (currentQuery) => currentQuery.state.data?.eligible ? 15000 : false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    const refreshEligibility = () => {
      if (hasSession && userId) void query.refetch();
    };
    window.addEventListener('wallet:updated', refreshEligibility);
    return () => window.removeEventListener('wallet:updated', refreshEligibility);
  }, [hasSession, query.refetch, userId]);

  return { ...query, hasSession };
}
