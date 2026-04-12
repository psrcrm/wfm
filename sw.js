/* ApartmentCare SW v5 — force-replaces all old cached versions */
const CACHE = 'ac-v5';
const BASE  = '/wfm';

const ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/css/app.css',
  BASE + '/js/db.js',
  BASE + '/js/auth.js',
  BASE + '/js/tasks.js',
  BASE + '/js/admin.js',
  BASE + '/js/calendar.js',
  BASE + '/js/sync.js',
  BASE + '/js/app.js',
  BASE + '/manifest.json',
  BASE + '/icons/icon-192.png',
  BASE + '/icons/icon-512.png',
];

/* Install: cache everything, activate immediately without waiting */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(url => c.add(url))))
      .then(() => self.skipWaiting())
  );
});

/* Activate: delete ALL old caches, claim every open tab/window NOW */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => {
        console.log('[SW] v5 active — claiming all clients');
        return self.clients.claim();
      })
  );
});

/* Message: support manual skipWaiting trigger from app */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* Fetch: serve from cache, fall back to network */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('script.google.com')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => null);
      return cached || network || caches.match(BASE + '/index.html');
    })
  );
});
