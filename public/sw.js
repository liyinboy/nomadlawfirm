// Nomad Law Firm — Service Worker
// Strategi sederhana & aman: cache aset statis (CSS/JS/logo/ikon) untuk pemakaian
// offline/koneksi lambat, sementara halaman dan panel admin tetap selalu diambil
// dari jaringan supaya kontennya tidak pernah basi (stale).

const CACHE_NAME = 'nomad-law-firm-v1';
const STATIC_ASSETS = [
  '/css/style.css',
  '/js/main.js',
  '/images/logo.png',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Jangan campur tangani halaman admin atau permintaan API/form sama sekali —
  // biar selalu langsung ke jaringan, tidak pernah disajikan dari cache.
  if (url.pathname.startsWith('/admin')) return;

  const isStaticAsset =
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/apple-touch-icon.png';

  if (isStaticAsset) {
    // Cache-first untuk aset statis: cepat, dan tetap ada saat offline.
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Untuk halaman biasa: coba jaringan dulu (supaya konten terbaru), kalau
  // gagal (offline) baru pakai salinan dari cache jika pernah dibuka sebelumnya.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});
