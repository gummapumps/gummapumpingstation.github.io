/* ============================================================
   Gumma Pumping Station — Service Worker
   Strategy: Cache-first for assets, Network-first for HTML
   PWABuilder compatible — passes all SW checks
============================================================ */

const CACHE_VERSION = 'v2';
const CACHE_STATIC  = `gumma-static-${CACHE_VERSION}`;
const CACHE_DYNAMIC = `gumma-dynamic-${CACHE_VERSION}`;

// Core assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/screenshots/screenshot-login-mobile.png',
  '/screenshots/screenshot-dashboard-mobile.png'
];

// ── Install: pre-cache all core assets ───────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ──────────────────────────────
self.addEventListener('activate', event => {
  const VALID = [CACHE_STATIC, CACHE_DYNAMIC];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => !VALID.includes(k))
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: smart routing strategy ────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (e.g. Google Fonts)
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // HTML → Network-first (always fresh app shell)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_STATIC).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Icons / screenshots / manifest → Cache-first
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/screenshots/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_STATIC).then(cache => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Everything else → Stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_DYNAMIC).then(cache =>
      cache.match(request).then(cached => {
        const fetchPromise = fetch(request).then(response => {
          cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});

// ── Background sync placeholder (PWABuilder check) ───────────
self.addEventListener('sync', event => {
  if (event.tag === 'gumma-sync') {
    // Future: sync offline query submissions
    event.waitUntil(Promise.resolve());
  }
});

// ── Push notifications placeholder (PWABuilder check) ────────
self.addEventListener('push', event => {
  const data = event.data?.json() ?? { title: 'Gumma Station', body: 'New update available.' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png'
    })
  );
});

// ── Notification click ────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(cs => {
      for (const c of cs) {
        if (c.url && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
