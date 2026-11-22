// Offline support: the site's own files are kept in a cache, so the archive and the days (stored in the
// browser's IndexedDB) open without internet. The AI proxy and other sites are never cached.
// build.mjs fills in VERSION and FILES (the hashed file names of this build).
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = 'ottenok-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(c => c.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('ottenok-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fonts, proxy, music services: straight to the network
  if (req.mode === 'navigate') {
    // pages: the newest from the network, the saved copy when offline
    e.respondWith(
      fetch(req)
        .then(r => {
          const copy = r.clone();
          if (r.ok) caches.open(CACHE).then(c => c.put(req, copy));
          return r;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('/'))),
    );
    return;
  }
  // hashed scripts, styles, icons: from the cache first (their names change with every update)
  e.respondWith(
    caches.match(req).then(
      hit =>
        hit ||
        fetch(req).then(r => {
          if (r.ok && /^\/(js|css|assets)\//.test(url.pathname)) {
            const copy = r.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return r;
        }),
    ),
  );
});
