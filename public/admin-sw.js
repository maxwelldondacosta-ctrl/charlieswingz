// Charlie's Wingz Admin — Service Worker
// Network-first for everything (admin needs live data). Cache only as offline fallback.

const CACHE_VERSION = 'cw-admin-v3';
const PRECACHE = [
  '/admin',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Network-first for admin — admin needs fresh data, only fall back to cache if offline.
// Path-agnostic: works whether admin is mounted at /admin or a hidden URL like /cw-x9k2m.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Only intercept same-origin requests within our scope
  if (url.origin !== self.location.origin) return;
  // Only handle GETs for the admin shell + API + icons
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache the admin shell HTML so we have an offline fallback
        if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── PUSH NOTIFICATIONS ──────────────────────────────────────────────────────
// Receive push from server, display rich notification on locked phone

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Charlie\'s Wingz', body: event.data ? event.data.text() : 'New notification' };
  }

  const title = data.title || '👑 Charlie\'s Wingz';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'cw-notify',
    renotify: data.renotify === true,
    requireInteraction: data.requireInteraction !== false,
    data: data.data || {},
    actions: data.actions || [],
    vibrate: [200, 100, 200, 100, 400] // distinctive pattern for new orders
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click on notification → open admin to the relevant order.
// Path-agnostic: looks for any open client whose URL starts within our SW scope.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  // The data.url should be a relative path within the admin scope (e.g. "#order-123").
  // We resolve it against the SW's scope so it works at any mount point.
  const scope = self.registration.scope;
  let targetUrl = scope;
  if (data.url) {
    try {
      // If url starts with the scope already, keep it. Otherwise treat as
      // a fragment/relative path within the scope.
      if (data.url.startsWith(scope) || data.url.startsWith('/')) {
        targetUrl = data.url.startsWith(scope) ? data.url : (scope.replace(/\/$/, '') + data.url);
      } else {
        targetUrl = scope.replace(/\/$/, '') + '/' + data.url;
      }
    } catch (_) {
      targetUrl = scope;
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // If admin is already open in a tab/PWA window, focus it
      for (const client of clientList) {
        if (client.url.startsWith(scope) && 'focus' in client) {
          client.postMessage({ type: 'navigate', url: targetUrl });
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
