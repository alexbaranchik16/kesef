// Offline support: app files are served from cache, refreshed in the background.
const CACHE = 'kesef-v1';
const FILES = ['./', 'index.html', 'styles.css', 'parser.js', 'app.js', 'guide.html', 'manifest.webmanifest',
               'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('script.google')) return;          // inbox requests always go to the network
  const isApp = url.origin === location.origin;
  const isLib = url.hostname === 'cdnjs.cloudflare.com';
  if (!isApp && !isLib) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const req = isApp && url.search ? new Request(url.pathname) : e.request;   // ?text= share links → app shell
    const hit = await cache.match(req, { ignoreSearch: isApp });
    const net = fetch(e.request).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
