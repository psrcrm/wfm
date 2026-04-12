/* ApartmentCare Service Worker v3 — fixed for /wfm/ subdirectory */
const CACHE = 'ac-v3';
const BASE  = '/wfm';

const ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/css/app.css?v=3',
  BASE + '/js/db.js?v=3',
  BASE + '/js/auth.js?v=3',
  BASE + '/js/tasks.js?v=3',
  BASE + '/js/admin.js?v=3',
  BASE + '/js/calendar.js?v=3',
  BASE + '/js/sync.js?v=3',
  BASE + '/js/app.js?v=3',
  BASE + '/manifest.json',
  BASE + '/icons/icon-192.png',
  BASE + '/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

/* Activate: delete every old cache, claim all clients immediately */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  /* Let Google Sheets/Script calls go straight to network */
  if (e.request.url.includes('script.google.com')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => null);
      /* Return cache immediately; update in background */
      return cached || network || caches.match(BASE + '/index.html');
    })
  );
});
