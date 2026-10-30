'use client';

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/api.client';
import { hasUsableAccessToken, useAuthStore } from '@/store/auth.store';

export type FirstDepositBonusEligibility = {
  eligible: boolean;
  claimed: boolean;
  totalDepositedUsd: number;
  status: 'BONUS_CLAIMED' | 'LEGACY_DEPOSIT_BLOCKER' | 'QUALIFIED_BUT_NOT_CLAIMED' | 'DEPOSIT_PROGRESS';
  minimumUsd: number;
  bonusAmountUsdt: number;
  claim: {
    depositSessionId: string;
    depositCurrency: string;
    depositUsdValue: number;
    bonusAmount: number;
    createdAt: string;
  } | null;
  recentDeposits: Array<{
    id: string;
    status: string;
    currency: string;
    network: string;
    amount: number;
    usdAmount: number;
    completedAt: string | null;
  }>;
  hasConfirmedLegacyDeposit: boolean;
  confirmedLegacyDeposit: {
    currency: string;
    amount: number | null;
    confirmedAt: string | null;
  } | null;
};

export const firstDepositBonusEligibilityQueryKey = (userId: string) => [
  'wallet',
  'first-deposit-bonus-eligibility',
  userId,
] as const;

function getCachedEligibility(userId: string): FirstDepositBonusEligibility | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const stored = window.localStorage.getItem(`first-deposit-bonus:${userId}`);
    if (!stored) return undefined;
    const parsed: unknown = JSON.parse(stored);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as FirstDepositBonusEligibility).eligible !== 'boolean' ||
      typeof (parsed as FirstDepositBonusEligibility).claimed !== 'boolean' ||
      typeof (parsed as FirstDepositBonusEligibility).totalDepositedUsd !== 'number' ||
      typeof (parsed as FirstDepositBonusEligibility).status !== 'string' ||
      !Array.isArray((parsed as FirstDepositBonusEligibility).recentDeposits)
    ) return undefined;
    return parsed as FirstDepositBonusEligibility;
  } catch (error) {
    console.warn('Unable to read cached first-deposit eligibility:', error);
    return undefined;
  }
}

export function useFirstDepositBonusEligibility() {
  const { accessToken, hasHydrated, isAuthenticated, user } = useAuthStore();
  const hasSession = isAuthenticated && hasUsableAccessToken(accessToken);
  const userId = user?.id;
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => firstDepositBonusEligibilityQueryKey(userId ?? ''), [userId]);
  const query = useQuery({
    queryKey,
    enabled: hasHydrated && hasSession && Boolean(userId),
    initialData: () => userId ? getCachedEligibility(userId) : undefined,
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
    if (!userId || !query.data || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(`first-deposit-bonus:${userId}`, JSON.stringify(query.data));
    } catch (error) {
      console.warn('Unable to cache first-deposit eligibility:', error);
    }
  }, [query.data, userId]);

  useEffect(() => {
    const refreshEligibility = () => {
      if (hasSession && userId) void query.refetch();
    };
    const markBonusClaimed = () => {
      if (!hasSession || !userId) return;
      queryClient.setQueryData<FirstDepositBonusEligibility>(queryKey, (current) => ({
        ...current,
        eligible: false,
        claimed: true,
        totalDepositedUsd: current?.totalDepositedUsd ?? 50,
        status: 'BONUS_CLAIMED',
        minimumUsd: current?.minimumUsd ?? 50,
        bonusAmountUsdt: current?.bonusAmountUsdt ?? 10,
        claim: current?.claim ?? null,
        recentDeposits: current?.recentDeposits ?? [],
        hasConfirmedLegacyDeposit: current?.hasConfirmedLegacyDeposit ?? false,
        confirmedLegacyDeposit: current?.confirmedLegacyDeposit ?? null,
      }));
    };
    window.addEventListener('wallet:updated', refreshEligibility);
    window.addEventListener('wallet:bonus-claimed', markBonusClaimed);
    return () => {
      window.removeEventListener('wallet:updated', refreshEligibility);
      window.removeEventListener('wallet:bonus-claimed', markBonusClaimed);
    };
  }, [hasSession, query.refetch, queryClient, queryKey, userId]);

  return {
    ...query,
    hasSession,
    showPromotion: hasSession && (query.data?.eligible ?? true),
  };
}
