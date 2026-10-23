/* eslint-env serviceworker */
/**
 * Service Worker de App Wallet.
 * Cachea el "app shell" (HTML/CSS/JS/iconos) para que la cartera abra sin conexión.
 * Las apps externas del iframe NO se cachean: viven en su propio origen.
 */
const VERSION = 'appwallet-v4';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/styles.css',
  '/js/app.js',
  '/js/config.js',
  '/js/storage.js',
  '/js/cards.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // cache: 'reload' salta la caché HTTP del navegador: si no, una versión
      // nueva del SW podría guardar el CSS/íconos viejos que ya tenía el navegador.
      .then((cache) =>
        cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))).catch(() => undefined)
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Solo gestionamos nuestro propio origen.
  // (Los iframes de apps externas se cargan directamente del navegador.)
  if (url.origin !== self.location.origin) return;

  // Navegaciones: red primero, con fallback al cache (offline).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Resto de assets propios: cache primero, revalidando en segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Permite que la página fuerce la activación de una versión nueva.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
