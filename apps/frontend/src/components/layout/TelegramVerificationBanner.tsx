'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, MessageCircle } from 'lucide-react';
import { telegramService } from '@/services/telegram.service';
import { hasUsableAccessToken, useAuthStore } from '@/store/auth.store';

export function TelegramVerificationBanner() {
  const { accessToken, hasHydrated, isAuthenticated, user } = useAuthStore();
  const hasSession = isAuthenticated && hasUsableAccessToken(accessToken);
  const eligibleUser = user?.role === 'BUYER' || user?.role === 'SELLER';
  const [isLinked, setIsLinked] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [linkExpiresAt, setLinkExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  const refreshStatus = useCallback(async () => {
    const status = await telegramService.getLinkStatus();
    setIsLinked(status.linked);
    if (status.linked) setLinkExpiresAt(null);
    return status.linked;
  }, []);

  useEffect(() => {
    if (!hasHydrated || !hasSession || !eligibleUser) {
      setIsLinked(null);
      setLinkExpiresAt(null);
      setError('');
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    void telegramService.getLinkStatus()
      .then((status) => {
        if (!cancelled) setIsLinked(status.linked);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Unable to check Telegram verification status.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [eligibleUser, hasHydrated, hasSession, user?.id]);

  useEffect(() => {
    if (!hasHydrated || !hasSession || !eligibleUser || isLinked !== null) return;

    let cancelled = false;
    const refreshWhenUnknown = async () => {
      try {
        const status = await telegramService.getLinkStatus();
        if (!cancelled) {
          setIsLinked(status.linked);
          setError('');
        }
      } catch (reason: unknown) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Unable to check Telegram verification status.');
        }
      }
    };
    const interval = window.setInterval(() => void refreshWhenUnknown(), 15000);
    window.addEventListener('focus', refreshWhenUnknown);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenUnknown);
    };
  }, [eligibleUser, hasHydrated, hasSession, isLinked]);

  useEffect(() => {
    if (!linkExpiresAt || !hasSession || !eligibleUser) return;

    let cancelled = false;
    const checkStatus = async () => {
      try {
        const linked = await refreshStatus();
        if (!cancelled && linked) setError('');
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Unable to check Telegram verification status.');
        }
      }
    };
    const interval = window.setInterval(() => void checkStatus(), 3000);
    const expiryTimer = window.setTimeout(() => {
      setLinkExpiresAt(null);
      setError('The Telegram link expired. Select Verify Now to create a new one.');
    }, Math.max(0, linkExpiresAt - Date.now()));

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(expiryTimer);
    };
  }, [eligibleUser, hasSession, linkExpiresAt, refreshStatus]);

  const openTelegram = async () => {
    setError('');
    setIsOpening(true);
    const telegramWindow = window.open('about:blank', '_blank');

    try {
      const link = await telegramService.createLink();
      const destination = new URL(link.url);
      if (destination.protocol !== 'https:' || destination.hostname !== 't.me') {
        throw new Error('The server returned an invalid Telegram link.');
      }

      setIsLinked(false);
      setLinkExpiresAt(new Date(link.expiresAt).getTime());
      if (telegramWindow) {
        telegramWindow.opener = null;
        telegramWindow.location.replace(destination.href);
      } else {
        window.location.assign(destination.href);
      }
    } catch (reason) {
      telegramWindow?.close();
      setError(reason instanceof Error ? reason.message : 'Unable to open Telegram verification.');
    } finally {
      setIsOpening(false);
    }
  };

  if (!hasHydrated || !hasSession || !eligibleUser || isLinked !== false || isLoading) return null;

  return (
    <section
      aria-label="Telegram account verification"
      className="mx-auto flex w-full max-w-7xl flex-col gap-4 border-b border-indigo-300/20 bg-indigo-500/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-indigo-400/15 p-2 text-indigo-200">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium leading-6 text-white">
            Please verify your account and activate Telegram notifications to receive your gift card codes and order updates.
          </p>
          {error && (
            <p role="alert" className="mt-1 flex items-center gap-1.5 text-sm text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          {linkExpiresAt && !error && (
            <p className="mt-1 text-xs text-indigo-100/80">Complete the Telegram prompt to finish linking your account.</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void openTelegram()}
        disabled={isOpening}
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/20 transition hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-70"
      >
        {isOpening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {isOpening ? 'Opening Telegram...' : 'Verify Now'}
      </button>
    </section>
  );
}
