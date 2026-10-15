/* Litpax Tasks — service worker: caches the app shell, never API calls */
const CACHE = 'litpax-tasks-v4';   // bump this on every frontend update
const SHELL = ['./', './index.html', './style.css', './app.js', './config.js', './manifest.json', './icon.svg',
  './assets/litpax-logo-light.png', './assets/litpax-logo-dark.png', './assets/favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Speed: serve app files from cache instantly, update the cache in the background */
const SHELL_PATHS = SHELL.map(p => new URL(p, self.location).pathname);
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only the app's own files; never API calls, fonts or anything else
  if (e.request.method !== 'GET' || url.origin !== location.origin || !SHELL_PATHS.includes(url.pathname)) return;
  const net = fetch(e.request).then(res => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => null);
  e.waitUntil(net);
  e.respondWith(
    caches.match(e.request)
      .then(hit => hit || net.then(res => res || caches.match('./index.html')))
  );
});
