'use client';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '@/store/notification.store';
import { useState } from 'react';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { notificationService } from '@/services/notification.service';
import { getNotificationPath } from '@/utils/notification-navigation';
import { useAuthStore } from '@/store/auth.store';

export function NotificationBell() {
  const { unreadCount, notifications, markAllRead, markRead } = useNotificationStore();
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canUseNotifications = typeof window !== 'undefined' && 'Notification' in window;
  const permission = canUseNotifications ? Notification.permission : 'unsupported';

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const enableDesktopNotifications = async () => {
    if (!canUseNotifications || Notification.permission !== 'default') return;
    await Notification.requestPermission();
  };

  return (
    <div ref={containerRef} className="relative">
      <button 
        onClick={() => setOpen(!open)}
        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full relative transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-5 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="p-3 border-b border-border flex justify-between items-center bg-muted/30">
            <h3 className="font-semibold text-sm">Notifications</h3>
            <div className="flex items-center gap-3">
              {permission === 'default' && (
                <button className="text-xs text-primary hover:underline" onClick={() => void enableDesktopNotifications()}>
                  Enable desktop alerts
                </button>
              )}
              <button className="text-xs text-primary hover:underline" onClick={() => void notificationService.markAllRead().then(() => markAllRead())}>
                Mark all read
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No new notifications</p>
            ) : (
              notifications.slice(0, 5).map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={`block w-full rounded-md p-2 text-left ${notification.isRead ? 'opacity-60' : 'bg-red-500/10'}`}
                  onClick={() => {
                    if (!notification.isRead) void notificationService.markRead(notification.id).then(() => markRead(notification.id));
                    const isSeller = user?.role === 'SELLER' || user?.sellerStatus === 'approved';
                    const path = getNotificationPath(notification, isSeller);
                    if (path) window.location.assign(path);
                  }}
                >
                  <p className="text-sm font-medium">{notification.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{notification.message}</p>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-border text-center bg-muted/30">
            <Link href="/dashboard/notifications" onClick={() => setOpen(false)} className="text-xs text-primary hover:underline">View All</Link>
          </div>
        </div>
      )}
    </div>
  );
}
