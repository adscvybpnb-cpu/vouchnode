'use client';

import { useState } from 'react';
import { useAuthStore } from '../store/auth.store';
import { authService } from '../services/auth.service';

export function useAuth() {
  const store = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (data: any) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await authService.login(data);
      store.setAuth(res.user, res.accessToken);
      return res;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: any) => {
    setIsLoading(true);
    setError(null);
    try {
      // authService.register returns { message, user } — NO accessToken.
      // Do NOT call store.setAuth here; user must verify email then log in.
      const res = await authService.register(data);
      return res;
    } catch (err: any) {
      const msg =
        typeof err?.message === 'string' && err.message.trim()
          ? err.message
          : 'Registration failed. Please try again.';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      store.clearAuth();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
  };

  return {
    ...store,
    isLoading,
    error,
    login,
    register,
    logout
  };
}
