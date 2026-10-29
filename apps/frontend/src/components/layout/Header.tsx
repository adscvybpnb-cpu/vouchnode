'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Wallet } from 'lucide-react';
import { apiClient } from '@/services/api.client';
import { hasUsableAccessToken, useAuthStore } from '@/store/auth.store';
import { useToast } from '@/hooks/use-toast';
import { NotificationBell } from './NotificationBell';
import { useNotifications } from '@/hooks/useNotifications';
import { SearchBar } from '../marketplace/SearchBar';
import { UserMenu } from './UserMenu';
import { walletService } from '@/services/wallet.service';
import { getSellerStartPath } from '@/lib/seller-access';
import { siteConfigService } from '@/services/site-config.service';
import { APP_NAME } from '@/lib/constants';
import { VouchNodesLogo } from './VouchNodesLogo';

export function Header() {
  const router = useRouter();
  const { accessToken, user, isAuthenticated, clearAuth } = useAuthStore();
  const hasSession = isAuthenticated && hasUsableAccessToken(accessToken);
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuHoveredByMouse = useRef(false);
  const [isCheckingSellerStatus, setIsCheckingSellerStatus] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [logoUrl, setLogoUrl] = useState('/favicon.svg');
  useNotifications();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    void siteConfigService.getPublic().then((config) => {
      setLogoUrl(config.logoUrl);
      document.title = APP_NAME;
    }).catch(() => undefined);
  }, []);

  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    if (!hasSession) {
      setWalletBalance(0);
      return;
    }

    let requestInFlight = false;
    let lastRefreshAt = 0;
    const refreshWalletBalance = () => {
      const now = Date.now();
      if (requestInFlight || now - lastRefreshAt < 5_000) return;
      requestInFlight = true;
      lastRefreshAt = now;
      void walletService.getPortfolio()
        .then((portfolio) => setWalletBalance(Number(portfolio.totalUsdBalance) || 0))
        .catch(() => setWalletBalance(0))
        .finally(() => {
          requestInFlight = false;
        });
    };

    refreshWalletBalance();
    const interval = window.setInterval(refreshWalletBalance, 30_000);
    window.addEventListener('wallet:updated', refreshWalletBalance);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('wallet:updated', refreshWalletBalance);
    };
  }, [hasSession]);

  const handleSellerView = async () => {
    if (isCheckingSellerStatus) return;
    setIsCheckingSellerStatus(true);
    try {
      router.push(await getSellerStartPath());
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Unable to check seller status',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsCheckingSellerStatus(false);
    }
  };
  const navLinks = [
    { href: '/products', label: 'Marketplace' },
    { href: '/products?category=gift-cards', label: 'Deals' },
    { href: '/chat', label: 'Messages' },
  ];

  if (!isMounted) {
    return (
      <header
        aria-hidden="true"
        translate="no"
        className="notranslate sticky top-0 z-40 w-full border-b border-white/10 bg-[#0A0A0F]/90 backdrop-blur-xl"
      >
        <div className="mx-auto h-20 max-w-7xl px-3 sm:px-6 lg:px-8" />
      </header>
    );
  }

  return (
    <header
      translate="no"
      className="notranslate sticky top-0 z-40 w-full border-b border-white/10 bg-[#0A0A0F]/90 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-20 min-w-0 max-w-7xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <VouchNodesLogo logoUrl={logoUrl} />
            <span translate="no" className="notranslate hidden truncate text-lg font-bold tracking-tight text-white sm:inline">
              {APP_NAME}
            </span>
          </Link>

          <div className="hidden flex-1 max-w-xl md:block">
            <SearchBar />
          </div>

          <Link
            href="/products"
            aria-label="Browse marketplace"
            className="hidden h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white md:inline-flex"
          >
            <Search className="h-4 w-4" />
          </Link>
        </div>

        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {hasSession ? (
            <>
              <Link
                href="/dashboard/wallet"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs text-slate-200 transition-colors hover:bg-white/10 sm:gap-2 sm:px-3 sm:text-sm"
              >
                <Wallet className="h-4 w-4 shrink-0 text-indigo-300" />
                <span translate="no" className="notranslate whitespace-nowrap">${walletBalance.toFixed(2)}</span>
              </Link>

              <NotificationBell />

              <div
                className="relative"
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') {
                    menuHoveredByMouse.current = true;
                    setMenuOpen(true);
                  }
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType === 'mouse') {
                    menuHoveredByMouse.current = false;
                    setMenuOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-2 rounded-lg p-1 transition-colors hover:bg-white/5"
                  aria-expanded={menuOpen}
                  aria-label="Open profile menu"
                  onClick={() => {
                    if (menuHoveredByMouse.current) {
                      setMenuOpen(true);
                      return;
                    }
                    setMenuOpen((open) => !open);
                  }}
                >
                  <div
                    translate="no"
                    className="notranslate flex h-8 w-8 items-center justify-center rounded-full border border-indigo-500/50 bg-indigo-600/30 text-sm font-bold text-indigo-200"
                  >
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={`${user.displayName || user.username || 'User'} avatar`}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      user?.username?.[0]?.toUpperCase() || 'U'
                    )}
                  </div>
                  <span translate="no" className="notranslate hidden text-sm text-slate-300 sm:block">
                    {user?.username}
                  </span>
                  <ChevronDown className={`hidden h-4 w-4 text-slate-500 transition-transform sm:block ${menuOpen ? 'rotate-180' : ''}`} />
                </button>

                {user && menuOpen && (
                  <UserMenu
                    user={user}
                    onStartSelling={() => {
                      setMenuOpen(false);
                      void handleSellerView();
                    }}
                    onSignedOut={() => {
                      setMenuOpen(false);
                      clearAuth();
                    }}
                    onProfileNavigate={() => setMenuOpen(false)}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white">
                Sign In
              </Link>
              <Link href="/register" className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-500">
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
