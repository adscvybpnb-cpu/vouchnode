'use client';

import Link from 'next/link';
import {
  ChevronRight,
  CircleHelp,
  Heart,
  Link2,
  LogOut,
  MessageCircle,
  Package,
  Plus,
  Settings,
  ShoppingBag,
  Sparkles,
  Wallet,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import { apiClient } from '@/services/api.client';
import { useAuthStore, type User } from '@/store/auth.store';

type UserMenuProps = {
  user: User;
  onStartSelling: () => void;
  onSignedOut: () => void;
  onProfileNavigate?: () => void;
};

type MenuLinkProps = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  hints?: string;
  onClick?: () => void;
};

function MenuLink({ href, label, icon: Icon, hints, onClick }: MenuLinkProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <Icon className="h-[18px] w-[18px] shrink-0 text-slate-500 transition-colors group-hover:text-indigo-300" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hints && <span className="mt-0.5 block truncate text-[11px] text-slate-500">{hints}</span>}
      </span>
      <ChevronRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-400" />
    </Link>
  );
}

export function UserMenu({ user, onStartSelling, onSignedOut, onProfileNavigate }: UserMenuProps) {
  const [isOnline, setIsOnline] = useState(user.isOnline ?? false);
  const [stayOnlineOpen, setStayOnlineOpen] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<1 | 2 | 3 | 4>(4);
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const router = useRouter();
  const updateUser = useAuthStore((state) => state.updateUser);

  useEffect(() => {
    setIsOnline(user.isOnline ?? false);
  }, [user.isOnline]);

  useEffect(() => {
    const handlePresenceUpdate = (event: Event) => {
      const payload = (event as CustomEvent<{ userId?: string; isOnline?: boolean }>).detail;
      if (payload?.userId === user.id && typeof payload.isOnline === 'boolean') {
        setIsOnline(payload.isOnline);
      }
    };
    window.addEventListener('presence:update', handlePresenceUpdate);
    return () => window.removeEventListener('presence:update', handlePresenceUpdate);
  }, [user.id]);

  const signOut = async (allDevices: boolean) => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    const endpoint = allDevices ? '/auth/logout-all' : '/auth/logout';
    try {
      await apiClient.post(endpoint, {});
    } finally {
      // Local logout must complete even when the expired token makes the API return 401.
      onSignedOut();
      setIsSigningOut(false);
    }
  };

  const updatePresence = async (online: boolean, durationHours?: 1 | 2 | 3 | 4) => {
    if (presenceBusy) return;
    setPresenceBusy(true);
    try {
      const response = await apiClient.patch<{ isOnline: boolean; onlineUntil: string | null }>('/users/me/presence', {
        online,
        durationHours: online ? durationHours : null,
      });
      if (!response.error && response.data) {
        setIsOnline(response.data.isOnline);
        updateUser({
          isOnline: response.data.isOnline,
          onlineUntil: response.data.onlineUntil,
        });
        setStayOnlineOpen(false);
      }
    } finally {
      setPresenceBusy(false);
    }
  };

  return (
    <div className="absolute right-0 top-full z-50 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#12141d] shadow-2xl shadow-black/50">
      <div className="border-b border-white/10 bg-gradient-to-br from-indigo-500/10 to-transparent p-4">
        <Link
          href={`/sellers/${encodeURIComponent(user.id)}`}
          onClick={onProfileNavigate}
          aria-label="View your public profile"
          className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-indigo-400/40 bg-indigo-500/20 text-base font-bold text-indigo-200">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              user.username?.slice(0, 1).toUpperCase() || 'U'
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">{user.displayName || user.username || 'User'}</p>
            <p className="truncate text-sm text-slate-400">@{user.username || 'user'}</p>
          </div>
          <span className={`ml-auto h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]' : 'bg-slate-500'}`} title={isOnline ? 'Online' : 'Offline'} />
        </Link>
      </div>

      <div className="p-2">
        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Account</p>
        <button
          type="button"
          onClick={onStartSelling}
          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-slate-200 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <Plus className="h-[18px] w-[18px] text-indigo-300" />
          <span className="flex-1 text-sm font-semibold">Start Selling</span>
          <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-slate-400" />
        </button>
        <button
          type="button"
          aria-pressed={isOnline}
          onClick={() => setStayOnlineOpen(true)}
          disabled={presenceBusy}
          className={`mt-1 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
            isOnline
              ? 'border-blue-400/20 bg-blue-500/10 text-blue-100 hover:bg-blue-500/15'
              : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-800'
          }`}
        >
          {isOnline ? <Wifi className="h-[18px] w-[18px] text-blue-300" /> : <WifiOff className="h-[18px] w-[18px] text-slate-400" />}
          <span className="flex-1">
            <span className="block text-sm font-medium">{isOnline ? 'Go Offline' : 'Go Online'}</span>
            <span className="block text-[11px] opacity-70">{isOnline ? 'Visible to buyers' : 'Hidden from buyers'}</span>
          </span>
          <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-blue-300' : 'bg-slate-500'}`} />
        </button>
        {stayOnlineOpen && (
          <div className="mt-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-3">
            <p className="text-xs font-semibold text-slate-200">Stay online after closing?</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">Choose how long buyers can see you as online after you disconnect.</p>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 4].map((hours) => (
                <button
                  key={hours}
                  type="button"
                  onClick={() => setSelectedDuration(hours as 1 | 2 | 3 | 4)}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold ${selectedDuration === hours ? 'border-emerald-300 bg-emerald-400/20 text-emerald-200' : 'border-white/10 text-slate-300 hover:bg-white/[0.06]'}`}
                >
                  {hours}h
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={presenceBusy}
                onClick={() => void updatePresence(true, selectedDuration)}
                className="flex-1 rounded-lg bg-emerald-400 px-2 py-2 text-xs font-bold text-slate-950 disabled:opacity-60"
              >
                Confirm
              </button>
              <button
                type="button"
                disabled={presenceBusy}
                onClick={() => void updatePresence(false)}
                className="rounded-lg border border-white/10 px-2 py-2 text-xs font-semibold text-slate-300 disabled:opacity-60"
              >
                Go offline
              </button>
            </div>
          </div>
        )}

        <div className="my-2 border-t border-white/10" />
        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Navigate</p>
        <MenuLink href="/messages" label="Messaging" icon={MessageCircle} />
        <MenuLink href="/dashboard/wallet" label="Wallet" icon={Wallet} hints="Activity  |  Add Funds  |  Subscription" />
        <MenuLink href="/referrals" label="Referrals" icon={Link2} />
        <MenuLink href="/seller/products" label="Listings" icon={Package} hints="Draft  |  On Sale  |  Sold  |  Expired" />
        <MenuLink href="/dashboard/orders" label="Purchases" icon={ShoppingBag} />
        <MenuLink href="/favorites" label="Favorites" icon={Heart} hints="Saved Searches  |  Listings  |  Profiles" />
        <MenuLink href="/dashboard/profile" label="Settings" icon={Settings} />
        <MenuLink href="/support/ticket" label="Help" icon={CircleHelp} />

        <div className="my-2 border-t border-white/10" />
        <button
          type="button"
          disabled={isSigningOut}
          onClick={() => void signOut(false)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sign out
        </button>
        <button
          type="button"
          disabled={isSigningOut}
          onClick={() => void signOut(true)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-wait disabled:opacity-60"
        >
          <Sparkles className="h-[18px] w-[18px]" />
          Sign out all devices
        </button>
      </div>
    </div>
  );
}
