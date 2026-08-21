const CACHE_PREFIX = "sagejs-live-";
const TRUSTED_MANIFEST_SHA256 = "__SAGEJS_ASSET_MANIFEST_SHA256__";
const MANIFEST_PATH = "./asset-manifest.json";
const FETCH_CREDENTIALS = new URL(self.location.href).searchParams.get("cocalc-preview") === "1"
  ? "same-origin"
  : "omit";
let activeCache;
let trustedManifestPromise;

function hexadecimal(bytes) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(bytes) {
  return hexadecimal(await crypto.subtle.digest("SHA-256", bytes));
}

function safeAssetPath(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith("./") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    value.split("/").includes("..")
  ) {
    throw new Error(`unsafe asset-manifest path ${JSON.stringify(value)}`);
  }
  return value;
}

async function verifiedResponse(response, record, label = record.path) {
  if (!response?.ok) {
    throw new Error(`${label} returned HTTP ${response?.status ?? "unavailable"}`);
  }
  const bytes = await response.clone().arrayBuffer();
  if (bytes.byteLength !== record.bytes || await sha256(bytes) !== record.sha256) {
    throw new Error(`${label} failed its authenticated byte contract`);
  }
  return response;
}

async function parseTrustedManifest(response) {
  if (!response?.ok) {
    throw new Error(`asset manifest returned HTTP ${response?.status ?? "unavailable"}`);
  }
  const bytes = await response.clone().arrayBuffer();
  if (await sha256(bytes) !== TRUSTED_MANIFEST_SHA256) {
    throw new Error("asset manifest does not match the service-worker trust anchor");
  }
  const manifest = JSON.parse(new TextDecoder().decode(bytes));
  if (
    manifest.schema !== "org.sagejs.web/assets-v2" ||
    !/^[a-f0-9]{64}$/.test(manifest.release) ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length === 0
  ) {
    throw new Error("unsupported Sage.js asset manifest");
  }
  const byUrl = new Map();
  for (const record of manifest.assets) {
    if (
      record === null ||
      typeof record !== "object" ||
      !Number.isSafeInteger(record.bytes) ||
      record.bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(record.sha256)
    ) {
      throw new Error("asset manifest contains an invalid byte contract");
    }
    const path = safeAssetPath(record.path);
    const url = new URL(path, self.registration.scope).href;
    if (byUrl.has(url)) throw new Error(`duplicate asset-manifest URL ${url}`);
    byUrl.set(url, Object.freeze({ path, bytes: record.bytes, sha256: record.sha256 }));
  }
  return Object.freeze({ manifest, byUrl, response });
}

async function trustedManifest() {
  trustedManifestPromise ??= (async () => {
    const trustedUrl = new URL(MANIFEST_PATH, self.registration.scope);
    trustedUrl.searchParams.set("integrity", TRUSTED_MANIFEST_SHA256);
    let response;
    try {
      response = await fetch(trustedUrl, {
        cache: "no-store",
        credentials: FETCH_CREDENTIALS,
      });
      return await parseTrustedManifest(response);
    } catch (networkError) {
      response = await caches.match(new URL(MANIFEST_PATH, self.registration.scope));
      if (response === undefined) throw networkError;
      return parseTrustedManifest(response);
    }
  })();
  try {
    return await trustedManifestPromise;
  } catch (error) {
    trustedManifestPromise = undefined;
    throw error;
  }
}

async function fetchAndVerify(request, record) {
  const response = await fetch(request, {
    credentials: FETCH_CREDENTIALS,
  });
  return verifiedResponse(response, record);
}

async function cacheVerified(cache, request, response) {
  await cache.put(request, response.clone());
  return response;
}

async function authenticatedAsset(request, record) {
  const cache = await caches.open(activeCache);
  const cached = await cache.match(request);
  if (cached !== undefined) {
    try {
      return await verifiedResponse(cached, record);
    } catch {
      await cache.delete(request);
    }
  }
  return cacheVerified(cache, request, await fetchAndVerify(request, record));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const trusted = await trustedManifest();
    activeCache = `${CACHE_PREFIX}${trusted.manifest.release}`;
    const cache = await caches.open(activeCache);
    const manifestRequest = new Request(
      new URL(MANIFEST_PATH, self.registration.scope),
      { credentials: FETCH_CREDENTIALS },
    );
    await cache.put(manifestRequest, trusted.response.clone());
    for (const [url, record] of trusted.byUrl) {
      const request = new Request(url, { credentials: FETCH_CREDENTIALS });
      await cacheVerified(cache, request, await fetchAndVerify(request, record));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const trusted = await trustedManifest();
    activeCache = `${CACHE_PREFIX}${trusted.manifest.release}`;
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== activeCache) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

async function trustedManifestResponse() {
  const trusted = await trustedManifest();
  return trusted.response.clone();
}

async function authenticatedRequest(request) {
  const trusted = await trustedManifest();
  activeCache ??= `${CACHE_PREFIX}${trusted.manifest.release}`;
  const requestUrl = new URL(request.url);
  const scope = new URL(self.registration.scope);
  const manifestUrl = new URL(MANIFEST_PATH, scope);
  if (requestUrl.origin === manifestUrl.origin && requestUrl.pathname === manifestUrl.pathname) {
    return trustedManifestResponse();
  }
  const lookupUrl = request.mode === "navigate"
    ? scope.href
    : new URL(requestUrl.pathname, scope).href;
  const record = trusted.byUrl.get(lookupUrl);
  if (record === undefined) {
    return fetch(request, { cache: "no-store", credentials: FETCH_CREDENTIALS });
  }
  return authenticatedAsset(
    new Request(lookupUrl, { credentials: FETCH_CREDENTIALS }),
    record,
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(authenticatedRequest(event.request).catch(() => Response.error()));
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
