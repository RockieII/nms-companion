// Service Worker — caches the app shell so the app opens offline.
// Game data itself is served from LocalStorage after first load, so it
// doesn't need to live in the cache.

const CACHE_NAME = 'nms-companion-v1';

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
  './icons/icon.svg',
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

// Network-first for jsDelivr (keeps data fresh when online).
// Cache-first for everything else (the app shell).
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.host === 'cdn.jsdelivr.net') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
