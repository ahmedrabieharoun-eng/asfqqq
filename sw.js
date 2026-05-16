/* Asset cache service worker
 * Strategy: cache-first for 3D bike models only (.glb/.gltf/.bin).
 * All other assets (images, audio, fonts) are always fetched from the network.
 *
 * FIX: Telegram webview may send GLB requests with spaces encoded as %20 or
 * as literal spaces depending on how the GLTFLoader resolves relative URLs.
 * We always normalise to the DECODED form (spaces, not %20) as the cache key,
 * and also try the encoded form as a fallback lookup so no request ever misses.
 */
const CACHE_NAME = 'race-assets-v3';

const MODEL_EXT = /\.(glb|gltf|bin)(\?|$)/i;

function is3DModel(url) {
  try {
    return MODEL_EXT.test(new URL(url).pathname);
  } catch (_) {}
  return false;
}

/* Normalize a GLB URL so spaces and %20 always map to the same cache key.
 * Always stores/looks up with DECODED pathname (spaces, not %20). */
function normalizeCacheKey(url) {
  try {
    const u = new URL(url);
    u.pathname = decodeURIComponent(u.pathname);
    return u.toString();
  } catch (_) {
    return url;
  }
}

/* Also return the encoded variant so we can try both on lookup */
function encodedCacheKey(url) {
  try {
    const u = new URL(url);
    // encode spaces only (encodeURIComponent encodes too much)
    u.pathname = u.pathname.replace(/ /g, '%20');
    return u.toString();
  } catch (_) {
    return url;
  }
}

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // Delete ALL old caches (including the old race-assets-v2)
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

    // Primary key: decoded (spaces). Fallback key: encoded (%20).
    const keyDecoded = normalizeCacheKey(req.url);
    const keyEncoded = encodedCacheKey(req.url);

    // Try decoded key first, then encoded (covers any previously cached entries)
    let cached = await cache.match(keyDecoded, { ignoreVary: true });
    if (!cached && keyEncoded !== keyDecoded) {
      cached = await cache.match(keyEncoded, { ignoreVary: true });
    }
    if (cached) return cached;

    try {
      // Fetch using the decoded URL — most reliable across environments
      const fetchUrl = keyDecoded;
      const fetchReq = new Request(fetchUrl, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'reload',
      });
      const resp = await fetch(fetchReq);
      // Always store under decoded key for consistency
      try { await cache.put(keyDecoded, resp.clone()); } catch (_) {}
      return resp;
    } catch (err) {
      // Last resort: return whatever is in cache
      const fallback = await cache.match(keyDecoded, { ignoreVary: true })
                    || await cache.match(keyEncoded, { ignoreVary: true });
      if (fallback) return fallback;
      throw err;
    }
  })());
});
