/* Asset cache service worker
 * Caches images, audio, 3D models (.glb/.gltf), fonts, etc.
 * Strategy: cache-first, with background revalidation for HTML/JS.
 * The first time the user opens the game, assets download from the network
 * and are stored in CacheStorage (persistent on device). Every subsequent
 * load (even offline) is served from cache, so nothing re-downloads.
 */
const CACHE_NAME = 'race-assets-v1';

const ASSET_HOSTS = [
  'i.supaimg.com',
  'files.catbox.moe',
  'cdn.pixabay.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'raw.githubusercontent.com',
];

const ASSET_EXT = /\.(glb|gltf|bin|png|jpe?g|webp|gif|svg|mp3|wav|ogg|m4a|woff2?|ttf|otf)(\?|$)/i;

function isAsset(url) {
  try {
    const u = new URL(url);
    if (ASSET_HOSTS.includes(u.hostname)) return true;
    if (ASSET_EXT.test(u.pathname)) return true;
  } catch (_) {}
  return false;
}

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!isAsset(req.url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreVary: true });
    if (cached) return cached;
    try {
      // Use no-cors for cross-origin so opaque responses still cache.
      const fetchReq = new Request(req.url, {
        mode: req.mode === 'navigate' ? 'cors' : 'no-cors',
        credentials: 'omit',
        cache: 'reload',
      });
      const resp = await fetch(fetchReq);
      try { await cache.put(req, resp.clone()); } catch (_) {}
      return resp;
    } catch (err) {
      const fallback = await cache.match(req, { ignoreVary: true });
      if (fallback) return fallback;
      throw err;
    }
  })());
});
