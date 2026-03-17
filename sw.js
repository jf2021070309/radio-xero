const CACHE_NAME = 'radio-xero-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Solo manejamos el evento, no es necesario cachear todo para que sea instalable
});

