'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import { notificationService } from '@/services/notification.service';
import { useNotificationStore } from '@/store/notification.store';
import type { Notification } from '@/types/api.types';
import { getNotificationPath } from '@/utils/notification-navigation';

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const { setNotifications, markRead, markAllRead } = useNotificationStore();

  const load = async (nextPage = 1) => {
    setLoading(true);
    try {
      const result = await notificationService.getNotifications(nextPage, 25);
      setItems((current) => nextPage === 1 ? result.items : [...current, ...result.items]);
      setPage(result.page);
      setTotalPages(result.totalPages);
      if (nextPage === 1) setNotifications(result.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) setPermission(Notification.permission);
    void load();
  }, []);

  const enableDesktopNotifications = async () => {
    if (!('Notification' in window)) return;
    const next = await Notification.requestPermission();
    setPermission(next);
  };

  const markEverythingRead = async () => {
    await notificationService.markAllRead();
    markAllRead();
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
  };

  const markOneRead = async (item: Notification) => {
    if (item.isRead) return;
    await notificationService.markRead(item.id);
    markRead(item.id);
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: true } : entry));
  };

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="mt-1 text-sm text-slate-400">Stay up to date with your orders, wallet, and account.</p>
        </div>
        <div className="flex gap-2">
          {permission === 'default' && (
            <button onClick={() => void enableDesktopNotifications()} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">
              Enable desktop alerts
            </button>
          )}
          <button onClick={() => void markEverythingRead()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        {loading && items.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading notifications…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center text-slate-400">
            <Bell className="h-8 w-8" /><p>You&apos;re all caught up.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {items.map((item) => (
              <div key={item.id} className={`flex gap-4 p-5 ${item.isRead ? '' : 'bg-indigo-500/10'}`}>
                <Bell className={`mt-1 h-5 w-5 shrink-0 ${item.isRead ? 'text-slate-500' : 'text-indigo-300'}`} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-white">{item.title}</h2>
                  <p className="mt-1 text-sm text-slate-300">{item.message}</p>
                  <p className="mt-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  {!item.isRead && <button onClick={() => void markOneRead(item)} className="text-xs text-indigo-300 hover:underline">Mark read</button>}
                  {getNotificationPath(item) && <Link href={getNotificationPath(item) || '#'} onClick={() => void markOneRead(item)} aria-label="Open notification" className="text-slate-400 hover:text-white"><ExternalLink className="h-4 w-4" /></Link>}
                </div>
              </div>
            ))}
          </div>
        )}
        {page < totalPages && (
          <div className="border-t border-white/10 p-4 text-center">
            <button disabled={loading} onClick={() => void load(page + 1)} className="text-sm text-indigo-300 hover:underline disabled:opacity-50">Load more</button>
          </div>
        )}
      </div>
    </section>
  );
}
