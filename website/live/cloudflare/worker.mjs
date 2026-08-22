const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; manifest-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; media-src 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Origin-Agent-Cluster": "?1",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Permitted-Cross-Domain-Policies": "none",
});

const RELEASE_PATTERN = /^[a-f0-9]{64}$/;
const IMMUTABLE_ASSET_PATTERN = /^assets\/sha256-[a-f0-9]{64}\//;

function secureHeaders(headers = new Headers()) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return headers;
}

function errorResponse(status, message) {
  const headers = secureHeaders(new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  }));
  return new Response(`${message}\n`, { status, headers });
}

export function logicalAssetPath(request) {
  const url = new URL(request.url);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    throw new TypeError("invalid URL encoding");
  }
  if (pathname.includes("\\") || pathname.includes("\0")) {
    throw new TypeError("unsafe asset path");
  }
  const parts = pathname.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    throw new TypeError("unsafe asset path");
  }
  return parts.length === 0 ? "index.html" : parts.join("/");
}

export function storageKey(logicalPath, release, encoding = "identity") {
  if (!RELEASE_PATTERN.test(release)) throw new TypeError("invalid release identity");
  if (encoding !== "identity" && encoding !== "br") {
    throw new TypeError("unsupported content encoding");
  }
  if (IMMUTABLE_ASSET_PATTERN.test(logicalPath)) {
    return `public/${encoding}/${logicalPath}`;
  }
  return `releases/${release}/${encoding}/${logicalPath}`;
}

function acceptsBrotli(request) {
  return (request.headers.get("Accept-Encoding") ?? "")
    .split(",")
    .some((entry) => entry.trim().split(";", 1)[0].toLowerCase() === "br");
}

function cacheRequest(request, logicalPath, release, encoding) {
  const url = new URL(request.url);
  url.search = "";
  url.searchParams.set("__sagejs_release", release);
  url.searchParams.set("__sagejs_encoding", encoding);
  url.pathname = `/${logicalPath}`;
  return new Request(url, { method: "GET" });
}

function responseHeaders(object, logicalPath, release, encoding) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Vary", "Accept-Encoding");
  headers.set("X-SageJS-Release", release);
  headers.set(
    "Cache-Control",
    IMMUTABLE_ASSET_PATTERN.test(logicalPath)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  );
  if (encoding === "br") headers.set("Content-Encoding", "br");
  else headers.delete("Content-Encoding");
  return secureHeaders(headers);
}

async function retrieveObject(bucket, logicalPath, release, preferredEncoding) {
  let encoding = preferredEncoding;
  let object = await bucket.get(storageKey(logicalPath, release, encoding));
  if (object === null && encoding !== "identity") {
    encoding = "identity";
    object = await bucket.get(storageKey(logicalPath, release, encoding));
  }
  return { encoding, object };
}

export async function handleRequest(request, env, context = {}) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse(405, "Method Not Allowed");
  }
  if (!env?.ASSETS || !RELEASE_PATTERN.test(env.RELEASE_ID ?? "")) {
    return errorResponse(503, "Sage.js release is not configured");
  }

  let logicalPath;
  try {
    logicalPath = logicalAssetPath(request);
  } catch {
    return errorResponse(400, "Invalid asset path");
  }
  const preferredEncoding = acceptsBrotli(request) ? "br" : "identity";
  const immutable = IMMUTABLE_ASSET_PATTERN.test(logicalPath);
  const edgeCache = globalThis.caches?.default;
  const cacheKey = cacheRequest(request, logicalPath, env.RELEASE_ID, preferredEncoding);

  if (immutable && edgeCache) {
    const cached = await edgeCache.match(cacheKey);
    if (cached) {
      if (request.headers.get("If-None-Match") === cached.headers.get("ETag")) {
        return new Response(null, { status: 304, headers: cached.headers });
      }
      return request.method === "HEAD"
        ? new Response(null, { status: cached.status, headers: cached.headers })
        : cached;
    }
  }

  const { encoding, object } = await retrieveObject(
    env.ASSETS,
    logicalPath,
    env.RELEASE_ID,
    preferredEncoding,
  );
  if (object === null) return errorResponse(404, "Not Found");

  const headers = responseHeaders(object, logicalPath, env.RELEASE_ID, encoding);
  if (request.headers.get("If-None-Match") === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  const response = new Response(request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers,
  });
  if (immutable && edgeCache && request.method === "GET") {
    context.waitUntil?.(edgeCache.put(cacheKey, response.clone()));
  }
  return response;
}

export default {
  fetch: handleRequest,
};
