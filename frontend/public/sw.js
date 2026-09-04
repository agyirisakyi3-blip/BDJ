var CACHE = 'att-v34';
var CDN_CACHE = 'att-cdn-v1';
var CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    Promise.all([
      caches.open(CACHE).then(function () { return self.skipWaiting(); }),
      caches.open(CDN_CACHE).then(function (c) {
        return Promise.allSettled(CDN_ASSETS.map(function (url) {
          return c.add(url);
        }));
      })
    ]).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== CDN_CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  // CDN requests: cache-first (versioned, immutable)
  if (e.request.url.indexOf('cdnjs.cloudflare.com') !== -1) {
    e.respondWith(
      caches.match(e.request).then(function (hit) {
        if (hit) return hit;
        return fetch(e.request).then(function (resp) {
          if (resp && resp.status === 200) {
            var copy = resp.clone();
            caches.open(CDN_CACHE).then(function (c) { c.put(e.request, copy); });
          }
          return resp;
        });
      })
    );
    return;
  }

  // Same-origin requests
  if (e.request.url.indexOf(self.location.origin) !== 0) return;

  // Page navigations: network-first so updates always win
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(function (resp) {
        if (resp && resp.status === 200) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (cache) { cache.put('./index.html', copy); });
        }
        return resp;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // Sub-resources: stale-while-revalidate
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
          return new Response('', { status: 504, statusText: 'Offline' });
        });
        return hit || fetchPromise;
      });
    })
  );
});
