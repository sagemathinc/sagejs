const CACHE_PREFIX = "sagejs-live-";
let activeCache;

async function releaseManifest() {
  const response = await fetch("./asset-manifest.json", { cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new Error(`asset manifest returned ${response.status}`);
  const manifest = await response.json();
  if (manifest.schema !== "org.sagejs.web/assets-v1" || !Array.isArray(manifest.assets)) {
    throw new Error("unsupported Sage.js asset manifest");
  }
  return manifest;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const manifest = await releaseManifest();
    activeCache = `${CACHE_PREFIX}${manifest.release}`;
    const cache = await caches.open(activeCache);
    await cache.addAll(manifest.assets.map((asset) => new Request(asset, { credentials: "omit" })));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const manifest = await releaseManifest();
    activeCache = `${CACHE_PREFIX}${manifest.release}`;
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== activeCache) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request, { credentials: "omit" });
  if (response.ok) {
    const cache = await caches.open(activeCache ?? CACHE_PREFIX + "fallback");
    await cache.put(request, response.clone());
  }
  return response;
}

async function navigation(request) {
  try {
    const response = await fetch(request, { cache: "no-cache", credentials: "omit" });
    if (response.ok) {
      const cache = await caches.open(activeCache ?? CACHE_PREFIX + "fallback");
      await cache.put("./index.html", response.clone());
    }
    return response;
  } catch {
    return (await caches.match("./index.html")) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(event.request.mode === "navigate" ? navigation(event.request) : cacheFirst(event.request));
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
