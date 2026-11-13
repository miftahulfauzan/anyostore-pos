// Service worker PWA: HTML selalu dari jaringan (dengan fallback offline),
// aset statis memakai stale-while-revalidate.
//
// CATATAN: sebelumnya aset memakai cache-first sehingga setelah deploy CSS/JS
// lama terus dipakai (mis. logo resi tetap kotak karena aturan border-radius
// baru tidak pernah terunduh). Versi cache dinaikkan setiap kali strategi ini
// berubah agar cache lama dibersihkan saat activate.
const CACHE_NAME = 'anyostore-shell-v2';
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

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/dashboard')),
    );
    return;
  }
  if (!STATIC_DESTINATIONS.has(request.destination)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      // Perbarui di latar belakang; permintaan berikutnya memakai versi baru.
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);
      if (cached) return cached;
      const fresh = await network;
      return fresh || Response.error();
    }),
  );
});