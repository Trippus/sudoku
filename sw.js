// Offline support. Online, every request goes to the network first so players
// always get the latest version; the cached copy is only used when offline.
// Bump VERSION when shipping changes so old caches are dropped.
const VERSION = 'sudoku-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/sudoku.js',
  './js/audio.js',
  './js/ads.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './assets/logo.svg',
];

self.addEventListener('install', (e) => {
  // 'reload' skips the browser's HTTP cache, which could otherwise hand us stale files.
  const requests = ASSETS.map((url) => new Request(url, { cache: 'reload' }));
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      try {
        // 'no-cache' revalidates with the server (a cheap 304 when nothing changed).
        const res = await fetch(e.request.url, { cache: 'no-cache' });
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      } catch {
        return (await cache.match(e.request, { ignoreSearch: true })) || Response.error();
      }
    }),
  );
});
