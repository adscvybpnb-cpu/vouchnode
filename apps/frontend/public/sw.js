self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open('vouchnodes-shell-v1');
    await Promise.allSettled(['/offline.html', '/favicon.svg'].map(async (path) => {
      const response = await fetch(path);
      if (response.ok) await cache.put(path, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith('vouchnodes-') && !['vouchnodes-shell-v1', 'vouchnodes-static-v1'].includes(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const shell = await caches.match('/offline.html');
      return shell || Response.error();
    }));
    return;
  }

  const isImmutableNextAsset = url.pathname.startsWith('/_next/static/');
  const isPublicAsset = url.pathname === '/favicon.svg' ||
    /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i.test(url.pathname);
  if (!isImmutableNextAsset && !isPublicAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open('vouchnodes-static-v1');
    const cached = await cache.match(request);
    if (cached && isImmutableNextAsset) return cached;

    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        try {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          if (keys.length > 120) await cache.delete(keys[0]);
        } catch (error) {
          console.warn('Unable to cache static VouchNodes asset:', error);
        }
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});

self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || 'VouchNodes';
  const options = {
    body: payload.message || 'You have a new notification.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: payload.tag || 'vouchnode-notification',
    data: { link: payload.link || '/dashboard/notifications', ...payload.data },
    requireInteraction: false,
  };

  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) =>
      clients.forEach((client) => client.postMessage({ type: 'push-notification-received', payload })),
    ),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.link || '/dashboard/notifications';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => 'focus' in client);
    if (existing) {
      void existing.focus();
      return existing.navigate(target);
    }
    return self.clients.openWindow(target);
  }));
});
