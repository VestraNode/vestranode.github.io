// sw.js — мінімальний service worker: «спершу мережа, інакше кеш». Завдяки йому головна сторінка й довідка відкриваються без інтернету,
// а сайт можна встановити як застосунок (PWA / Microsoft Store). Запити до API (інші домени, /api/) не кешуються.
const CACHE = 'vestranode-shell-v2';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/pay/')) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match(new URL('index.html', self.registration.scope).href))));
});
