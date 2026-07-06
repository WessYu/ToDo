const CACHE_NAME = 'ritmo-presence-v12';

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest?v=11',
  '/icone-v11.png',
  '/apple-touch-icon-v11.png',
  '/favicon-32-v11.png',
  '/ritmo-hotfix-v11.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );

  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copy);
        });

        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((response) => response || caches.match('/index.html')),
      ),
  );
});
