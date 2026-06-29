const CACHE_VERSION = 'v9';
const CACHE_NAME = `quran-memorizer-cache-${CACHE_VERSION}`;
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './quran_data.js',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install event - Cache static assets completely bypassing HTTP cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.log('[Service Worker] Caching App Shell bypassing HTTP cache...');
        // Fetch each asset with cache: 'reload' to ensure we get the absolute latest from the server
        for (const asset of ASSETS_TO_CACHE) {
          try {
            const req = new Request(asset, { cache: 'reload' });
            const response = await fetch(req);
            if (response && response.ok) {
              await cache.put(asset, response);
            }
          } catch (e) {
            console.error('[Service Worker] Failed to cache:', asset, e);
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Cache first with network fallback
self.addEventListener('fetch', (event) => {
  // Only handle local requests and known CDNs
  if (!event.request.url.startsWith(self.location.origin) && 
      !event.request.url.includes('cdnjs.cloudflare.com') && 
      !event.request.url.includes('api.alquran.cloud') &&
      !event.request.url.includes('cdn-icons-png.flaticon.com')) {
    return; // Bypass handling for third-party scripts/extensions
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then((networkResponse) => {
        // Cache external API text calls (like Quran texts and Tafsir)
        if (event.request.url.includes('api.alquran.cloud') && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cacheCopy);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline Fallback for Navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html', { ignoreSearch: true });
        }
        return null;
      });
    })
  );
});
