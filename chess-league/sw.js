const CACHE = 'chess-league-77f3b8205e';
const SHELL = [
  '/chess/chess-league/',
  '/chess/chess-league/index.html',
  '/chess/chess-league/styles.css?v=16',
  '/chess/chess-league/data.js?v=16',
  '/chess/chess-league/app.js?v=16',
  '/chess/chess-league/board.js?v=16',
  '/chess/chess-league/pwa.js?v=16',
  '/chess/chess-league/manifest.webmanifest?v=16',
  '/chess/ui/board.css',
  '/chess/ui/navigation.css',
  '/chess/vendor/chessground.min.js',
  '/chess/vendor/chessground.base.css',
  '/chess/vendor/chessground.brown.css',
  '/chess/vendor/chessground.cburnett.css',
  '/chess/icons/chess-icon-180.png',
  '/chess/icons/chess-icon-192.png',
  '/chess/icons/chess-icon-512.png'
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
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('chess-league-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const sharedBoardAsset = url.pathname === '/chess/ui/board.css'
    || url.pathname === '/chess/ui/navigation.css'
    || url.pathname.startsWith('/chess/vendor/')
    || url.pathname.startsWith('/chess/icons/');
  if (url.origin !== self.location.origin || (!url.pathname.startsWith('/chess/chess-league/') && !sharedBoardAsset)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.match('/chess/chess-league/index.html').then((cached) => cached || fetch(event.request)
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
