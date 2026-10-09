self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || 'VouchNode';
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
