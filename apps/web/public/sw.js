/* eslint-env serviceworker */
/* eslint-disable no-console */
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `apcd-static-${CACHE_VERSION}`;
const API_CACHE = `apcd-api-${CACHE_VERSION}`;
const REFERENCE_CACHE = `apcd-reference-${CACHE_VERSION}`;

// Pre-cache essential static assets on install
const PRECACHE_URLS = ['/', '/dashboard', '/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== API_CACHE && key !== REFERENCE_CACHE)
            .map((key) => caches.delete(key)),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension, webpack HMR, etc.
  if (!url.protocol.startsWith('http')) return;

  // API requests: Network-first with 5s timeout
  if (url.pathname.startsWith('/api/')) {
    // Reference data: stale-while-revalidate
    if (
      url.pathname.includes('/reference/') ||
      url.pathname.includes('/apcd-types') ||
      url.pathname.includes('/states')
    ) {
      event.respondWith(staleWhileRevalidate(request, REFERENCE_CACHE));
      return;
    }
    event.respondWith(networkFirst(request, API_CACHE, 5000));
    return;
  }

  // Static assets: cache-first
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML pages: network-first
  event.respondWith(networkFirst(request, STATIC_CACHE, 5000));
});

// Background Sync for offline form submissions
self.addEventListener('sync', (event) => {
  if (event.tag === 'apcd-sync-queue') {
    event.waitUntil(replaySyncQueue());
  }
});

// Push notification handler
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'APCD Portal', body: 'New notification' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      data: data.url ? { url: data.url } : undefined,
      tag: data.tag || 'apcd-notification',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});

// --- Caching strategy implementations ---

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cacheName, timeoutMs) {
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-APCD-Source', 'cache');
      return new Response(cached.body, { status: cached.status, headers });
    }
    // For API requests, return JSON error
    if (request.url.includes('/api/')) {
      return new Response(
        JSON.stringify({
          error: 'OFFLINE',
          message: 'You are offline and no cached data is available.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }
    // For pages, try offline fallback
    const offlinePage = await caches.match('/offline');
    if (offlinePage) return offlinePage;
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await fetchPromise) || new Response('Offline', { status: 503 });
}

async function replaySyncQueue() {
  // This will be implemented by the IndexedDB sync queue task
  // For now, just a placeholder that the sync handler exists
  console.log('[SW] Background sync triggered for apcd-sync-queue');
}
