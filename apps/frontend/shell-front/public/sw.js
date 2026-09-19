// Visin's service worker: what makes the shell installable as an app, and what
// shows an offline page instead of the browser's error when a navigation fails.
//
// It deliberately caches none of the app itself. The shell loads vision, label
// and account from their own deployments at runtime, so a cached shell would
// pair stale host code with freshly deployed remotes; and every page needs the
// APIs anyway. Only navigations are intercepted, and only to fall back when the
// network fails — every other request never touches this worker.
const CACHE = 'visin-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});
