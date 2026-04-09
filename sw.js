const CACHE_NAME = 'radio-xero-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Manejo explícito de fetch para mayor compatibilidad en Edge y Chrome
  event.respondWith(
    fetch(event.request).catch(() => {
      // Fallback si no hay red, aunque no estamos cacheando archivos para streaming
      return null;
    })
  );
});

