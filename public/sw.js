/* FOCUS Service Worker — hand-rolled, zero dependencies.
 * Scope: /focus22/ (registered as `${import.meta.env.BASE_URL}sw.js`).
 * Strategy: precache app shell + icons; cache-first for hashed assets;
 * network-first + offline shell fallback for navigations.
 */
const CACHE_NAME = 'focus-pwa-v4';
const RUNTIME_CACHE = 'focus-pwa-runtime-v4';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './404.html',
  './icons/apple-touch-icon.png',
  './icons/focus-icon.svg',
  './icons/focus-16.png',
  './icons/focus-32.png',
  './icons/focus-48.png',
  './icons/focus-64.png',
  './icons/focus-72.png',
  './icons/focus-96.png',
  './icons/focus-128.png',
  './icons/focus-144.png',
  './icons/focus-152.png',
  './icons/focus-167.png',
  './icons/focus-180.png',
  './icons/focus-192.png',
  './icons/focus-256.png',
  './icons/focus-384.png',
  './icons/focus-512.png',
  './icons/focus-1024.png',
  './icons/focus-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

// ---------------------------------------------------------------------------
// Web Push (G-N3, additive only — cache behavior above is byte-untouched).
// Minimal payload contract from the order-push Edge function:
//   { order_id, store_id, total, target }
// Details always load post-open under the viewer's session; nothing sensitive
// travels in the push itself.
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {};
  }
  const orderId = typeof data.order_id === 'string' ? data.order_id : '';
  const total = typeof data.total === 'number' ? ` · ${data.total}` : '';
  event.waitUntil(
    self.registration.showNotification('New order', {
      body: orderId ? `#${orderId.slice(0, 8)}${total}` : 'A new family order arrived.',
      tag: orderId ? `new-order:${orderId}` : 'new-order',
      data: { orderId },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const orderId =
    event.notification && event.notification.data && typeof event.notification.data.orderId === 'string'
      ? event.notification.data.orderId
      : '';
  const url =
    new URL(self.registration.scope).origin +
    new URL(self.registration.scope).pathname +
    '#/pilot-store-ops' +
    (orderId ? `?order=${encodeURIComponent(orderId)}` : '');
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) client.focus();
          return client;
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
        return undefined;
      }),
  );
});
