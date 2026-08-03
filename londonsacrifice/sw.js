/* GENERATED from wisdom/chess-coach/src/sw.template.js — edit there and run scripts/chess/sync_coach_ui.mjs */
const CACHE = 'londonsacrifice-ab8c8dcbe3';
const SHELL = [
  '/chess/londonsacrifice/',
  '/chess/londonsacrifice/index.html',
  '/chess/londonsacrifice/manifest.webmanifest',
  '/chess/londonsacrifice/pwa.js',
  '/chess/londonsacrifice/sw.js',
  '/chess/londonsacrifice/ui/styles.css',
  '/chess/londonsacrifice/ui/board.css',
  '/chess/londonsacrifice/ui/navigation.css',
  '/chess/londonsacrifice/ui/main.js',
  '/chess/londonsacrifice/ui/board.js',
  '/chess/londonsacrifice/ui/profile.js',
  '/chess/londonsacrifice/ui/classify.js',
  '/chess/londonsacrifice/data/episodes.js',
  '/chess/londonsacrifice/data/highlights.js',
  '/chess/londonsacrifice/data/puzzles.js',
  '/chess/londonsacrifice/data/fresh.js',
  '/chess/londonsacrifice/data/learnability.js',
  '/chess/londonsacrifice/data/read.js',
  '/chess/londonsacrifice/data/reviews.js',
  '/chess/londonsacrifice/vendor/chessground.min.js',
  '/chess/londonsacrifice/vendor/chessground.base.css',
  '/chess/londonsacrifice/vendor/chessground.brown.css',
  '/chess/londonsacrifice/vendor/chessground.cburnett.css',
  '/chess/londonsacrifice/icons/chess-icon-180.png',
  '/chess/londonsacrifice/icons/chess-icon-192.png',
  '/chess/londonsacrifice/icons/chess-icon-512.png',
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
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('londonsacrifice-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .then((clients) => clients.forEach((client) => client.postMessage({ type: 'londonsacrifice-update-ready', cache: CACHE }))));
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const sharedLeagueData = url.pathname === '/chess/chess-league/data.js';
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || (!url.pathname.startsWith('/chess/londonsacrifice/') && !sharedLeagueData)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match('/chess/londonsacrifice/index.html').then((cached) => cached || fetch(event.request)
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
