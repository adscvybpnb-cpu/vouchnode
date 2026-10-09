import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  username: string;
  role: 'BUYER' | 'SELLER' | 'ADMIN';
  kycStatus?: 'NOT_SUBMITTED' | 'PENDING_ADMIN_REVIEW' | 'PENDING_MANUAL_REVIEW' | 'REJECTED' | 'APPROVED' | 'AUTOMATED_VERIFIED';
  sellerStatus?: 'none' | 'pending' | 'approved' | 'suspended' | 'rejected';
  isOnline?: boolean;
  onlineUntil?: string | null;
  isVerified: boolean;
  avatarUrl?: string;
  displayName?: string;
  bio?: string;
  countryCode?: string;
  timezone?: string;
  language?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
  walletBalance?: {
    available: number;
    pending: number;
    currency: string;
  };
}

export function hasUsableAccessToken(token: string | null) {
  if (!token || typeof window === 'undefined') return false;

  try {
    const encodedPayload = token.split('.')[1];
    if (!encodedPayload) return false;
    const payload = JSON.parse(
      window.atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number };

    return typeof payload.exp !== 'number' || payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  setHydrated: (hydrated: boolean) => void;
  setAuth: (user: User, token: string) => void;
  updateUser: (user: Partial<User>) => void;
  clearAuth: () => void;
}

export function clearPersistedAuthStorage() {
  if (typeof window === 'undefined') return;

  window.localStorage.removeItem('auth-storage');
  window.sessionStorage.removeItem('auth-storage');
  window.localStorage.removeItem('user_avatar');

  // Refresh tokens are HttpOnly in production and are cleared by the server.
  // Remove any client-accessible auth cookies as a best-effort cleanup.
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=', 1)[0]?.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}

const authStorage = {
  getItem(name: string) {
    if (typeof window === 'undefined') return null;
    const sessionValue = window.sessionStorage.getItem(name);
    if (sessionValue) return sessionValue;
    const localValue = window.localStorage.getItem(name);
    if (!localValue) return null;
    const parsed = JSON.parse(localValue) as { state?: { user?: { role?: string } } };
    if (parsed.state?.user?.role === 'ADMIN') {
      window.localStorage.removeItem(name);
      return null;
    }
    return localValue;
  },
  setItem(name: string, value: string) {
    if (typeof window === 'undefined') return;
    try {
      const parsed = JSON.parse(value) as { state?: { user?: { role?: string } } };
      const isAdminSession = parsed.state?.user?.role === 'ADMIN';
      const target = isAdminSession ? window.sessionStorage : window.localStorage;
      const other = isAdminSession ? window.localStorage : window.sessionStorage;
      target.setItem(name, value);
      other.removeItem(name);
    } catch {
      window.localStorage.removeItem(name);
      window.sessionStorage.removeItem(name);
    }
  },
  removeItem(name: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(name);
    window.sessionStorage.removeItem(name);
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      hasHydrated: false,
      setHydrated: (hydrated) => set({ hasHydrated: hydrated }),
      setAuth: (user, token) =>
        set({ user, accessToken: token, isAuthenticated: true }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
      clearAuth: () => {
        clearPersistedAuthStorage();
        set({ user: null, accessToken: null, isAuthenticated: false });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('auth:cleared'));
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => authStorage),
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
      partialize: (state) => ({ 
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        // For production, tokens should be managed via secure HttpOnly cookies.
        // Keeping in local storage for this MVP phase.
        accessToken: state.accessToken 
      }),
    }
  )
);
