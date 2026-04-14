// Service Worker — caches the app shell so the app opens offline.
// Game data itself is served from LocalStorage after first load, so it
// doesn't need to live in the cache.

const CACHE_NAME = 'nms-companion-v9';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/main.css',
  './js/app.js',
  './js/data.js',
  './js/views/ui.js',
  './js/views/resources.js',
  './js/views/recipes.js',
  './js/views/favorites.js',
  './js/views/settings.js',
  './js/views/item.js',
  './js/views/updates.js',
  './js/views/update.js',
  './icons/icon.svg',
  './data/icon-overrides.json',
  './data/updates.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for jsDelivr and for our own auto-synced data files (icon
// overrides, Steam updates). Cache-first for everything else (app shell).
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isSyncedData = url.pathname.endsWith('/data/icon-overrides.json')
                    || url.pathname.endsWith('/data/updates.json');

  if (url.host === 'cdn.jsdelivr.net' || isSyncedData) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (isSyncedData && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
