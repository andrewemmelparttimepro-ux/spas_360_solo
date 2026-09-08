/* SPAS 360 update-safe cache. Never force-refresh a working client. */
const CACHE_NAME = 'spas360-v2';
function validAsset(response, pathname) {
  if (!response || !response.ok) return false;
  const type = response.headers.get('content-type') || '';
  if (type.includes('text/html')) return false;
  if (pathname.endsWith('.js')) return /javascript|ecmascript/i.test(type);
  if (pathname.endsWith('.css')) return /text\/css/i.test(type);
  return true;
}
self.addEventListener('install', event => {
  event.waitUntil(fetch('/', { cache: 'no-store' }).then(async response => {
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
      await (await caches.open(CACHE_NAME)).put('/', response);
    }
  }).catch(() => undefined));
  // Taking over the fetch handler is safe: this worker never navigates a client.
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  // Previous caches may still contain assets needed by open tabs. Keep them.
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const hit = await caches.match(event.request);
      if (validAsset(hit, url.pathname)) return hit;
      if (hit) {
        for (const name of await caches.keys()) {
          if (name.startsWith('spas360-')) await (await caches.open(name)).delete(event.request);
        }
      }
      const response = await fetch(event.request);
      if (validAsset(response, url.pathname)) {
        await (await caches.open(CACHE_NAME)).put(event.request, response.clone());
      }
      return response;
    })());
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
          await (await caches.open(CACHE_NAME)).put('/', response.clone());
        }
        return response;
      } catch {
        return (await (await caches.open(CACHE_NAME)).match('/')) ||
          new Response('SPAS 360 is offline. Reconnect and try again.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
  }
});

// ─── Web Push ────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let payload = { title: 'SPAS 360', body: '', link: '/' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data ? event.data.text() : '';
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      data: { link: payload.link },
      tag: payload.tag || undefined,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(link);
          return;
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
