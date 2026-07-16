// sw.js - Service Worker المتقدم

const CACHE_VERSION = 'v103';
const CACHE_NAMES = {
  static: `static-${CACHE_VERSION}`,
  audio: `audio-${CACHE_VERSION}`,
  quran: `quran-${CACHE_VERSION}`,
  images: `images-${CACHE_VERSION}`
};

const STATIC_ASSETS = [
  './',
  './index.html',
  './styles/main.css',
  './styles/components.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './favicon.png',
  './qrcode.png',
  './quran_logo.jpg',
  './src/app.js',
  './src/core/State.js',
  './src/utils/StorageManager.js',
  './src/utils/MemoryManager.js',
  './src/api/QuranAPI.js',
  './src/engines/KaraokeEngine.js',
  './src/engines/SpeechEngine.js',
  './src/components/InteractiveTour.js',
  './src/utils/DbManager.js'
];

// استراتيجيات التخزين المختلفة
const STRATEGIES = {
  'cache-first': async (request) => {
    const cache = await caches.open(CACHE_NAMES.static);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // تحديث الكاش في الخلفية
      fetch(request).then(response => {
        if (response.ok) cache.put(request, response);
      }).catch(() => {});
      
      return cachedResponse;
    }
    
    return fetch(request).then(response => {
      if(response.ok) cache.put(request, response.clone());
      return response;
    });
  },
  
  'network-first': async (request) => {
    try {
      const response = await fetch(request);
      
      if (response.ok) {
        const cache = await caches.open(CACHE_NAMES.quran);
        cache.put(request, response.clone());
      }
      
      return response;
    } catch (error) {
      const cache = await caches.open(CACHE_NAMES.quran);
      const cachedResponse = await cache.match(request);
      
      if (cachedResponse) return cachedResponse;
      
      return new Response('Network error', { status: 503 });
    }
  },
  
  'stale-while-revalidate': async (request) => {
    const cache = await caches.open(CACHE_NAMES.audio);
    const cachedResponse = await cache.match(request);
    
    const fetchPromise = fetch(request).then(response => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    }).catch(() => {});
    
    return cachedResponse || fetchPromise;
  }
};

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  let strategy;
  
  if (url.hostname.includes('alquran.cloud')) {
    strategy = STRATEGIES['network-first'];
  } else if (url.pathname.endsWith('.mp3') || url.pathname.endsWith('.m4a')) {
    // Bypass service worker for audio to prevent 206 Partial Content caching issues
    return;
  } else if (url.pathname.includes('/api/')) {
    strategy = STRATEGIES['network-first'];
  } else {
    // All other requests (HTML, JS, CSS, images) use network-first
    // to ensure users always get the latest updates when online
    strategy = STRATEGIES['network-first'];
  }
  
  event.respondWith(strategy(event.request));
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAMES.static)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => !Object.values(CACHE_NAMES).includes(name))
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});
