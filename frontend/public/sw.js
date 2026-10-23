/*
 * addredance service worker
 *
 * Strategy:
 *  - navigations: network-first, falling back to the cached app shell so a
 *    cold start works offline and a new deploy is picked up immediately;
 *  - /assets/*: cache-first (Vite emits content-hashed filenames);
 *  - other same-origin GETs: stale-while-revalidate;
 *  - cross-origin requests (the Google Apps Script API): never intercepted.
 *
 * Bump the cache name in scripts/build-sw.mjs when the caching strategy
 * changes; old caches are removed on activate. Legacy `att-*` caches from
 * earlier builds are purged too.
 */
// Injected at build time (scripts/build-sw.mjs): the full list of hashed build
// assets and a hash of that list. The hash changes on every deploy, so the old
// cache is discarded automatically and the whole app is available offline from
// the first visit.
const BUILD = '__BUILD_ID__';
const CACHE = 'addredance-' + BUILD;
const PRECACHE_ASSETS = [];
const LEGACY_PREFIXES = ['att-'];

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/bdj-logo.jpg',
  '/jsQR.min.js',
  '/qrcode.min.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
].concat(PRECACHE_ASSETS);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => (key.startsWith('addredance-') && key !== CACHE) ||
            LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix)))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request, event));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await caches.match(request)) ||
      (await caches.match('/index.html')) ||
      (await caches.match('/')) ||
      new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const update = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(update);
    return cached;
  }
  const fresh = await update;
  return fresh || new Response('', { status: 504, statusText: 'Offline' });
}
