'use client';

import { useEffect, useRef } from 'react';
import { apiClient } from '../services/api.client';

type PushConfig = { enabled: boolean; publicKey: string | null };

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(Array.from(raw, (character) => character.charCodeAt(0)));
}

export function usePushNotifications(enabled: boolean) {
  const attempted = useRef(false);

  useEffect(() => {
    if (!enabled || attempted.current || typeof window === 'undefined') return;
    attempted.current = true;

    const setup = async () => {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== 'granted') return;

      const configResponse = await apiClient.get<PushConfig>('/push/config');
      if (configResponse.error || !configResponse.data?.enabled || !configResponse.data.publicKey) return;

      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(configResponse.data.publicKey),
      });
      const payload = subscription.toJSON();
      if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys.auth) return;

      await apiClient.post('/push/subscription', {
        endpoint: payload.endpoint,
        keys: { p256dh: payload.keys.p256dh, auth: payload.keys.auth },
      });
    };

    void setup().catch(() => {
      // Push is an optional channel and must not block application rendering.
    });
  }, [enabled]);
}

export function usePushSoundListener() {
  useEffect(() => {
    const playChime = () => {
      const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor || document.visibilityState !== 'visible') return;
      const context = new AudioContextConstructor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.3);
      oscillator.addEventListener('ended', () => void context.close());
    };
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'push-notification-received') playChime();
    };
    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage);
  }, []);
}
