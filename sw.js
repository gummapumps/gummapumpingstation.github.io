/* ============================================================
   Gumma Pumping Station — Service Worker
   All paths are RELATIVE — works at any subfolder depth
   Compatible with GitHub Pages subfolders & Netlify root
============================================================ */

const CACHE_VERSION = 'v3';
const CACHE_STATIC  = `gumma-static-${CACHE_VERSION}`;
const CACHE_DYNAMIC = `gumma-dynamic-${CACHE_VERSION}`;

// Derive base path from sw.js location — works at any depth
const SW_BASE = self.location.pathname.replace('sw.js', '');

const PRECACHE_ASSETS = [
  SW_BASE,
  SW_BASE + 'index.html',
  SW_BASE + 'manifest.json',
  SW_BASE + 'icons/icon-192.png',
  SW_BASE + 'icons/icon-512.png',
  SW_BASE + 'icons/icon-maskable-512.png',
  SW_BASE + 'screenshots/screenshot-login-mobile.png',
  SW_BASE + 'screenshots/screenshot-dashboard-mobile.png'
];

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        // addAll fails if ANY asset 404s — use individual puts to be safe
        return Promise.allSettled(
          PRECACHE_ASSETS.map(url =>
            fetch(url).then(res => {
              if (res.ok) cache.put(url, res);
            }).catch(() => {})
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────────────────────────────
self.addEventListener('activate', event => {
  const VALID = [CACHE_STATIC, CACHE_DYNAMIC];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !VALID.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: smart routing ──────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip cross-origin (Google Fonts etc.)
  if (url.origin !== self.location.origin) return;

  // HTML → Network-first, fallback to cache
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          caches.open(CACHE_STATIC).then(c => c.put(request, res.clone()));
          return res;
        })
        .catch(() =>
          caches.match(request)
            .then(r => r || caches.match(SW_BASE + 'index.html'))
        )
    );
    return;
  }

  // Static assets → Cache-first
  if (
    url.pathname.includes('/icons/') ||
    url.pathname.includes('/screenshots/') ||
    url.pathname.endsWith('manifest.json')
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          caches.open(CACHE_STATIC).then(c => c.put(request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // Everything else → Stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_DYNAMIC).then(cache =>
      cache.match(request).then(cached => {
        const network = fetch(request).then(res => {
          cache.put(request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});

// ── Push notifications ────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {
    title: 'Gumma Station',
    body: 'New update available.'
  };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: SW_BASE + 'icons/icon-192.png',
      badge: SW_BASE + 'icons/icon-96.png'
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(cs => {
      for (const c of cs) {
        if (c.url && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(SW_BASE);
    })
  );
});

self.addEventListener('sync', event => {
  if (event.tag === 'gumma-sync') {
    event.waitUntil(Promise.resolve());
  }
});
