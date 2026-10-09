'use client';

import { useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import { useNotificationStore } from '../store/notification.store';
import { hasUsableAccessToken, useAuthStore } from '../store/auth.store';
import { notificationService } from '../services/notification.service';
import { getNotificationPath } from '../utils/notification-navigation';

export function useNotifications() {
  const { socket, isConnected } = useSocket('/notifications');
  const addNotification = useNotificationStore(s => s.addNotification);
  const setNotifications = useNotificationStore(s => s.setNotifications);
  const { accessToken, isAuthenticated } = useAuthStore();
  const hasSession = isAuthenticated && hasUsableAccessToken(accessToken);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConversationRef = useRef<string | null>(null);
  const alertContextRef = useRef<AudioContext | null>(null);
  const alertTimerRef = useRef<number | null>(null);

  const stopContinuousOrderAlert = () => {
    if (alertTimerRef.current !== null) {
      window.clearInterval(alertTimerRef.current);
      alertTimerRef.current = null;
    }
    if (alertContextRef.current) {
      void alertContextRef.current.close();
      alertContextRef.current = null;
    }
  };

  const playMessageChime = () => {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return;
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1046, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(784, context.currentTime + 0.16);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.22);
      window.setTimeout(() => void context.close(), 300);
    } catch {
      // Browser audio policies may require a prior user interaction.
    }
  };

  const playCancellationChime = () => {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return;
    try {
      const context = new AudioContext();
      [523, 392].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.18;
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.13, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.16);
      });
      window.setTimeout(() => void context.close(), 500);
    } catch {
      // Browser audio policies may require a prior user interaction.
    }
  };

  const playCompletionChime = () => {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return;
    try {
      const context = new AudioContext();
      [784, 1046, 1318].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.14;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.3);
      });
      window.setTimeout(() => void context.close(), 700);
    } catch {
      // Browser audio policies may require prior user interaction.
    }
  };

  const startContinuousOrderAlert = () => {
    stopContinuousOrderAlert();
    if (typeof window === 'undefined' || !('AudioContext' in window)) return;
    try {
      const context = new AudioContext();
      alertContextRef.current = context;
      const ring = () => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, context.currentTime);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.5);
      };
      void context.resume();
      ring();
      alertTimerRef.current = window.setInterval(ring, 900);
    } catch {
      stopContinuousOrderAlert();
    }
  };

  useEffect(() => {
    const activate = (event: Event) => {
      const conversationId = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId || null;
      activeConversationRef.current = conversationId;
      setActiveConversationId(conversationId);
    };
    const deactivate = (event: Event) => {
      const conversationId = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (activeConversationRef.current === conversationId) {
        activeConversationRef.current = null;
        setActiveConversationId(null);
      }
    };
    window.addEventListener('chat:active', activate);
    window.addEventListener('chat:inactive', deactivate);
    return () => {
      window.removeEventListener('chat:active', activate);
      window.removeEventListener('chat:inactive', deactivate);
    };
  }, []);

  useEffect(() => {
    const stop = () => stopContinuousOrderAlert();
    window.addEventListener('pointerdown', stop);
    window.addEventListener('keydown', stop);
    return () => {
      window.removeEventListener('pointerdown', stop);
      window.removeEventListener('keydown', stop);
      stopContinuousOrderAlert();
    };
  }, []);

  useEffect(() => {
    if (!hasSession || typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => undefined);
    }
  }, [hasSession]);

  useEffect(() => {
    if (!hasSession) {
      setNotifications([]);
      return;
    }

    void notificationService.getNotifications(1, 50)
      .then((result) => setNotifications(result.items))
      .catch(() => setNotifications([]));
  }, [hasSession, setNotifications]);

  useEffect(() => {
    if (!isConnected || !socket || !hasSession) return;

    const handleNotification = (notification: import('../types/api.types').Notification) => {
      addNotification(notification);
      if (notification.type === 'ORDER_NEW') startContinuousOrderAlert();
      else if (notification.type === 'ORDER_UPDATE' && notification.data?.status === 'CANCELLED') {
        stopContinuousOrderAlert();
        playCancellationChime();
      } else if (notification.type === 'ORDER_UPDATE' && notification.data?.status === 'COMPLETED') {
        stopContinuousOrderAlert();
        playCompletionChime();
        window.dispatchEvent(new CustomEvent('p2p:wallet-updated', {
          detail: notification.data
        }));
      } else playMessageChime();
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        const desktopNotification = new Notification(notification.title, { body: notification.message, icon: '/favicon.svg', tag: notification.id });
        desktopNotification.onclick = () => {
          window.focus();
          const path = getNotificationPath(notification);
          if (path) window.location.assign(path);
          desktopNotification.close();
        };
      }
    };
    socket.on('new_notification', handleNotification);

    return () => {
      socket.off('new_notification', handleNotification);
    };
  }, [isConnected, socket, hasSession, addNotification, activeConversationId]);
}
