'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
      console.error('Unable to register the VouchNodes service worker:', error);
    });
  }, []);

  return null;
}
