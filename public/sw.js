// Archery Duel 3D service worker. The server stamps the build into CACHE, so every deploy gets a fresh cache and the old one is deleted.
const CACHE = 'ad3t-cache-__BUILD__';
const SHELL = ['/', '/index.html', '/style.css', '/game.js', '/sim.js', '/world.js', '/looks.js', '/audio.js', '/manifest.webmanifest',
  '/fonts/Fredoka-600.woff2', '/fonts/Fredoka-700.woff2', '/icons/icon-192.png', '/icons/icon-512.png',
  '/vendor/three.module.js', '/vendor/three.core.js', '/vendor/jsm/effects/OutlineEffect.js', '/vendor/jsm/geometries/RoundedBoxGeometry.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('ad3t-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const put = (req, res) => { if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/socket.io') || url.pathname === '/health' || url.pathname === '/sw.js') return; // never cache the live connection
  const stable = /^\/(vendor|fonts|icons)\//.test(url.pathname);
  if (stable) { // big immutable-per-build files: cache first
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => put(req, r))));
    return;
  }
  // HTML and app code: network first so a new deploy shows up straight away; cache only when offline
  const key = req.mode === 'navigate' ? '/' : req;
  e.respondWith(fetch(req).then(r => put(key, r)).catch(() => caches.match(key).then(hit => hit || caches.match('/'))));
});
