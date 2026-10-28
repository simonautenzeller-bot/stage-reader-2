// Version bei jeder Auslieferung erhöhen, damit alte Caches verschwinden.
const CACHE = 'stage-reader-2.0.0';
const SHELL = [
  './', './index.html', './manifest.json', './css/styles.css',
  './js/main.js', './js/util.js', './js/db.js', './js/libs.js', './js/dialogs.js', './js/logic.js', './js/files.js', './js/importer.js',
  './js/shell.js', './js/theme.js', './js/library.js', './js/setlists.js', './js/settings.js', './js/reader.js', './js/pdfview.js', './js/gpview.js',
  './vendor/alphatab/alphaTab.min.js', './vendor/alphatab/font/Bravura.woff2', './vendor/alphatab/font/Bravura.woff',
  './vendor/pdfjs/pdf.min.mjs', './vendor/pdfjs/pdf.worker.min.mjs',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

// Eigener Code: Netzwerk zuerst (immer aktuell), offline aus dem Cache.
// Große Bibliotheken und Icons: Cache zuerst.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const heavy = /\/(vendor|icons)\//.test(url.pathname);
  event.respondWith(heavy ? cacheFirst(request) : networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('./index.html');
    throw error;
  }
}
