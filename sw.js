/* ================================================================
   Gumma Pumping Station — Service Worker v4
   Strategy:
   - HTML/manifest → Network-first (always fresh on internet)
   - Icons/screenshots → Cache-first (stable assets)
   - Everything else → Stale-while-revalidate
   Paths are all relative — works in any subfolder on GitHub Pages
================================================================ */

const CACHE_V       = 'gumma-v4';
const CACHE_ASSETS  = 'gumma-assets-v4';
const SW_BASE       = self.location.pathname.replace('sw.js', '');

const CORE_ASSETS = [
  SW_BASE + 'index.html',
  SW_BASE + 'manifest.json',
  SW_BASE + 'icons/icon-192.png',
  SW_BASE + 'icons/icon-512.png',
  SW_BASE + 'icons/maskable-512.png',
];

// ── Install: cache core assets safely ────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_V).then(cache =>
      Promise.allSettled(
        CORE_ASSETS.map(url =>
          fetch(url, { cache: 'reload' })
            .then(res => { if (res.ok) cache.put(url, res); })
            .catch(() => {})
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ───────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_V && k !== CACHE_ASSETS)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Skip cross-origin (Google Fonts CDN etc.)
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // ── Icons & screenshots: Cache-first ─────────────────────
  if (path.includes('/icons/') || path.includes('/screenshots/')) {
    e.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res.ok) {
            caches.open(CACHE_ASSETS).then(c => c.put(req, res.clone()));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // ── HTML & manifest: Network-first → ensures fresh data ──
  if (req.headers.get('accept')?.includes('text/html') ||
      path.endsWith('manifest.json') ||
      path.endsWith('/') || path.endsWith('index.html')) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then(res => {
          if (res.ok) {
            caches.open(CACHE_V).then(c => c.put(req, res.clone()));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then(r => r || caches.match(SW_BASE + 'index.html'))
        )
    );
    return;
  }

  // ── Everything else: Stale-while-revalidate ───────────────
  e.respondWith(
    caches.open(CACHE_V).then(cache =>
      cache.match(req).then(cached => {
        const fresh = fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    )
  );
});

// ── Push (for future notifications) ──────────────────────────
self.addEventListener('push', e => {
  const d = e.data?.json() ?? { title: 'Gumma Station', body: 'Update available.' };
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: SW_BASE + 'icons/icon-192.png',
      badge: SW_BASE + 'icons/icon-96.png'
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(cs => {
      for (const c of cs) if (c.url && 'focus' in c) return c.focus();
      if (clients.openWindow) return clients.openWindow(SW_BASE);
    })
  );
});
