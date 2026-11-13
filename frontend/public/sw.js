// Service worker PWA: HTML selalu dari jaringan (dengan fallback offline),
// aset kode memakai network-first agar deploy baru langsung terpakai.
//
// Cache hanya menjadi fallback saat perangkat offline. Versi cache dinaikkan
// agar cache shell lama dibersihkan saat service worker baru aktif.
const CACHE_NAME = 'anyostore-shell-v3';
const STATIC_DESTINATIONS = new Set(['script', 'style', 'font', 'image']);

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/dashboard')),
    );
    return;
  }
  if (!STATIC_DESTINATIONS.has(request.destination)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const fresh = await fetch(request, { cache: 'no-store' });
        if (fresh.ok) await cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    }),
  );
});
