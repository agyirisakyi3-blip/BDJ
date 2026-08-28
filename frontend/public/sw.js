var CACHE = 'att-v31';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  // For same-origin requests: stale-while-revalidate
  if (e.request.url.indexOf(self.location.origin) === 0) {
    e.respondWith(
      caches.open(CACHE).then(function (cache) {
        return cache.match(e.request).then(function (hit) {
          var fetchPromise = fetch(e.request).then(function (resp) {
            if (resp && resp.status === 200) {
              cache.put(e.request, resp.clone());
            }
            return resp;
          }).catch(function () {
            if (hit) return hit;
            if (e.request.mode === 'navigate') return cache.match('./index.html');
            return new Response('', { status: 504, statusText: 'Offline' });
          });
          return hit || fetchPromise;
        });
      })
    );
    return;
  }

  // For CDN requests (QR library): cache-first
  if (e.request.url.indexOf('cdnjs.cloudflare.com') !== -1) {
    e.respondWith(
      caches.open(CACHE).then(function (cache) {
        return cache.match(e.request).then(function (hit) {
          if (hit) return hit;
          return fetch(e.request).then(function (resp) {
            if (resp && resp.status === 200) {
              cache.put(e.request, resp.clone());
            }
            return resp;
          });
        });
      })
    );
  }
});
