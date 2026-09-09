/* Offline shell only. Requests containing account or committee API data are never cached. */
const CACHE_NAME = 'vinayaka-seva-v12';
const CORE = ['./index.html', './app.js?v=12', './styles.css?v=12', './manifest.json', './ganesh.png', './LOGO.png', './VINYAKA.jpg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('vinayaka-seva-') && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const known = CORE.some(path => new URL(path, self.registration.scope).pathname === url.pathname);
  if (!known && request.mode !== 'navigate') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Each active worker serves its own matching HTML/CSS/JS shell together.
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return await cache.match('./index.html');
    try { return await fetch(request); }
    catch { return new Response('This file is unavailable offline.', { status: 503 }); }
  })());
});
