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
      typeof (parsed as FirstDepositBonusEligibility).totalDepositedUsd !== 'number'
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
  const query = useQuery({
    queryKey: firstDepositBonusEligibilityQueryKey(userId ?? ''),
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
    window.addEventListener('wallet:updated', refreshEligibility);
    return () => window.removeEventListener('wallet:updated', refreshEligibility);
  }, [hasSession, query.refetch, userId]);

  return {
    ...query,
    hasSession,
    showPromotion: hasSession && (query.data?.eligible ?? true),
  };
}
