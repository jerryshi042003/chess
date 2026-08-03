/* GENERATED from wisdom/chess-coach/src/sw.template.js — edit there and run scripts/chess/sync_coach_ui.mjs */
const CACHE = 'chess-openings-f39255df5c';
const SHELL = [
  '/chess/',
  '/chess/index.html',
  '/chess/manifest.webmanifest',
  '/chess/pwa.js',
  '/chess/sw.js',
  '/chess/ui/styles.css',
  '/chess/ui/board.css',
  '/chess/ui/navigation.css',
  '/chess/ui/main.js',
  '/chess/ui/board.js',
  '/chess/ui/profile.js',
  '/chess/ui/classify.js',
  '/chess/data/episodes.js',
  '/chess/data/highlights.js',
  '/chess/data/puzzles.js',
  '/chess/data/fresh.js',
  '/chess/data/learnability.js',
  '/chess/data/read.js',
  '/chess/data/reviews.js',
  '/chess/vendor/chessground.min.js',
  '/chess/vendor/chessground.base.css',
  '/chess/vendor/chessground.brown.css',
  '/chess/vendor/chessground.cburnett.css',
  '/chess/icons/chess-icon-180.png',
  '/chess/icons/chess-icon-192.png',
  '/chess/icons/chess-icon-512.png',
  '/chess/chess-league/data.js?v=16'
];

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(SHELL.map(async (url) => {
    const versioned = `${url}${url.includes('?') ? '&' : '?'}sw=${encodeURIComponent(CACHE)}`;
    const response = await fetch(new Request(versioned, { cache: 'reload' }));
    if (!response.ok) throw new Error(`precache failed (${response.status}): ${url}`);
    await cache.put(url, response);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('chess-openings-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .then((clients) => clients.forEach((client) => client.postMessage({ type: 'chess-coach-update-ready', cache: CACHE }))));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const sharedLeagueData = url.pathname === '/chess/chess-league/data.js';
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || (!url.pathname.startsWith('/chess/') && !sharedLeagueData)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match('/chess/index.html').then((cached) => cached || fetch(event.request)
      .catch(() => new Response('Offline page unavailable', { status: 503, statusText: 'Offline page unavailable' }))));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => new Response('Offline asset unavailable', { status: 503, statusText: 'Offline asset unavailable' }))));
});
