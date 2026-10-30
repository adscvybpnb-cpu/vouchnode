const SHELL_CACHE = 'vouchnodes-shell-v2';
const STATIC_CACHE = 'vouchnodes-static-v2';
const PUBLIC_PAGE_CACHE = 'vouchnodes-public-pages-v1';
const PUBLIC_PAGES = ['/', '/products', '/sellers', '/about', '/help'];
const MAX_STATIC_ASSETS = 120;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(['/offline.html', '/favicon.svg'].map(async (path) => {
      const response = await fetch(path);
      if (response.ok) await cache.put(path, response);
    }));

    await Promise.allSettled(PUBLIC_PAGES.map(async (path) => {
      const response = await fetch(path, { headers: { Accept: 'text/html' } });
      if (isPublicPageResponse(response)) {
        const pageCache = await caches.open(PUBLIC_PAGE_CACHE);
        await pageCache.put(path, response);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith('vouchnodes-') &&
        ![SHELL_CACHE, STATIC_CACHE, PUBLIC_PAGE_CACHE].includes(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

function isPublicPageResponse(response) {
  if (!response.ok || response.type !== 'basic' || response.redirected) return false;
  const contentType = response.headers.get('content-type') || '';
  const cacheControl = response.headers.get('cache-control') || '';
  const vary = response.headers.get('vary') || '';
  return !response.headers.has('set-cookie') &&
    contentType.includes('text/html') &&
    /\bpublic\b/i.test(cacheControl) &&
    !/\b(private|no-store)\b/i.test(cacheControl) &&
    !/(^|,)\s*(\*|cookie)\s*(,|$)/i.test(vary);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    const isPublicPage = url.search === '' && PUBLIC_PAGES.includes(url.pathname);
    if (!isPublicPage) {
      event.respondWith(fetch(request).catch(async () => {
        const shell = await caches.match('/offline.html');
        return shell || Response.error();
      }));
      return;
    }

    event.respondWith((async () => {
      const cache = await caches.open(PUBLIC_PAGE_CACHE);
      const cached = await cache.match(url.pathname);
      const refresh = fetch(request).then(async (response) => {
        if (isPublicPageResponse(response)) await cache.put(url.pathname, response.clone());
        return response;
      });

      if (cached) {
        event.waitUntil(refresh.catch((error) => {
          console.warn('Unable to refresh cached public VouchNodes page:', error);
        }));
        return cached;
      }
      try {
        return await refresh;
      } catch {
        const shell = await caches.match('/offline.html');
        return shell || Response.error();
      }
    })());
    return;
  }

  const isImmutableNextAsset = url.pathname.startsWith('/_next/static/');
  const isPublicAsset = url.pathname === '/favicon.svg' ||
    /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i.test(url.pathname);
  if (!isImmutableNextAsset && !isPublicAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached && isImmutableNextAsset) return cached;

    const updateCache = async () => {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        try {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          if (keys.length > MAX_STATIC_ASSETS) await cache.delete(keys[0]);
        } catch (error) {
          console.warn('Unable to cache static VouchNodes asset:', error);
        }
      }
      return response;
    };

    if (cached) {
      event.waitUntil(updateCache().catch((error) => {
        console.warn('Unable to refresh cached public VouchNodes asset:', error);
      }));
      return cached;
    }

    return updateCache();
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
