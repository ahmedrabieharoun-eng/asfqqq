/* Asset cache service worker
 * Strategy: cache-first for 3D bike models only (.glb/.gltf/.bin).
 * All other assets (images, audio, fonts) are always fetched from the network.
 */
const CACHE_NAME = 'race-assets-v2';

const MODEL_EXT = /\.(glb|gltf|bin)(\?|$)/i;

function is3DModel(url) {
  try {
    return MODEL_EXT.test(new URL(url).pathname);
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
  if (!is3DModel(req.url)) return;   // ← only intercept 3D models

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreVary: true });
    if (cached) return cached;
    try {
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
