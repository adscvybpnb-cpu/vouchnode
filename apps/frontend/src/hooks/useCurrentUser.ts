import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authService } from '../services/auth.service';
import { useAuthStore } from '../store/auth.store';

export const currentUserQueryKey = (userId: string) => ['user', 'me', userId] as const;

export function useCurrentUser(enabled = true) {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const query = useQuery({
    queryKey: currentUserQueryKey(user?.id ?? 'anonymous'),
    queryFn: () => authService.getMe(),
    enabled: enabled && Boolean(user?.id),
    initialData: user ?? undefined,
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!query.data || !user) return;
    const changed = Object.entries(query.data).some(([key, value]) => (
      user[key as keyof typeof user] !== value
    ));
    if (changed) updateUser(query.data);
  }, [query.data, updateUser, user]);

  return query;
}
