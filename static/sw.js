/**
 * Ahmed Nadi Media Downloader — Service Worker v6.0.0
 * Cache Strategy: Cache-first for static, Network-first for API
 */

const CACHE_NAME = 'ahmed-nadi-dl-v6.0.0';
const STATIC_CACHE = 'ahmed-nadi-static-v6.0.0';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/static/index.html',
  '/static/app.js?v=6.0.0',
  '/static/bg3d.js?v=6.0.0',
  '/static/ahmed_nadi.jpg',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/manifest.json',
];

// External resources to cache on first use
const CACHE_ON_USE = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
];

// ── Install: Pre-cache essential assets ─────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(PRECACHE_URLS).catch((err) => {
          console.warn('[SW] Pre-cache partial fail (non-critical):', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: Clean old caches ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: Smart routing ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip download API (large file downloads shouldn't be cached)
  if (url.pathname.startsWith('/api/download')) return;

  // API calls: Network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // External CDN resources: Cache on first use
  if (CACHE_ON_USE.some((domain) => url.hostname.includes(domain))) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // Static assets: Cache-first
  if (url.pathname.startsWith('/static/') || url.pathname === '/') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
});

// ── Cache-first strategy ────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/') || new Response(
        offlinePage(),
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
    throw err;
  }
}

// ── Network-first strategy ──────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ status: 'error', detail: 'أنت غير متصل بالإنترنت. تحقق من الاتصال وحاول مرة أخرى.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Offline fallback page ───────────────────────────────────────────────────
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>غير متصل - Ahmed Nadi Downloader</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #05070A; color: #F3F4F6;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .container {
      text-align: center; padding: 2rem; max-width: 400px;
    }
    .icon { font-size: 4rem; margin-bottom: 1.5rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.75rem; }
    p { color: #9CA3AF; font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem; }
    button {
      padding: 0.85rem 2rem; border-radius: 0.75rem; border: none;
      background: linear-gradient(135deg, #00F2FE, #4FACFE, #FE2C55);
      color: #fff; font-weight: 700; font-size: 1rem; cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:active { transform: scale(0.96); }
    button:hover { box-shadow: 0 0 30px rgba(0, 242, 254, 0.4); }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📡</div>
    <h1>غير متصل بالإنترنت</h1>
    <p>تحقق من اتصالك بالإنترنت وحاول مرة أخرى. التطبيق يحتاج اتصال نشط لتحميل الفيديوهات.</p>
    <button onclick="location.reload()">إعادة المحاولة</button>
  </div>
</body>
</html>`;
}
