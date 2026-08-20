import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const repositoryRoot = path.resolve(packageRoot, "..", "..");

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

export const securityHeaders = Object.freeze({
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'none'",
    "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
});

const HARNESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Sage.js Wasm parity</title></head>
<body><output id="status">loading</output><script type="module" src="/browser-wasm-harness.mjs"></script></body></html>`;

const HARNESS_JAVASCRIPT = `
import { createSage } from "/kernel.mjs";
const state = { session: null, error: null };
window.__sagejsTest = {
  protocol: 1,
  async evaluate(source, timeout) {
    const started = performance.now();
    const result = await state.session.evaluate(source, { timeout });
    return {
      repr: result.repr,
      stdout: result.stdout,
      display: result.display ?? null,
      duration_ms: performance.now() - started
    };
  },
  async interrupt(source) {
    const evaluation = state.session.evaluate(source);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const started = performance.now();
    await state.session.interrupt();
    let rejected = false;
    try { await evaluation; } catch { rejected = true; }
    return { rejected, latency_ms: performance.now() - started };
  },
  async reset() { await state.session.reset(); },
  async close() { await state.session.close(); },
  diagnostics() {
    return {
      cross_origin_isolated: globalThis.crossOriginIsolated,
      hardware_concurrency: navigator.hardwareConcurrency,
      user_agent: navigator.userAgent,
      memory: performance.memory ? {
        used_js_heap_size: performance.memory.usedJSHeapSize,
        total_js_heap_size: performance.memory.totalJSHeapSize,
        js_heap_size_limit: performance.memory.jsHeapSizeLimit
      } : null
    };
  }
};
window.__sagejsReady = (async () => {
  try {
    state.session = await createSage();
    document.querySelector("#status").textContent = "ready";
    return true;
  } catch (error) {
    state.error = error;
    document.querySelector("#status").textContent = String(error?.stack ?? error);
    throw error;
  }
})();
`;

function collectReleaseAssets(root) {
  const productionManifest = path.join(root, "dist", "production-manifest.json");
  if (fs.existsSync(productionManifest)) {
    const manifest = JSON.parse(fs.readFileSync(productionManifest, "utf8"));
    if (manifest.schema !== "sagejs.wasm-production-artifact/v1") {
      throw new Error(`unsupported production artifact schema ${manifest.schema}`);
    }
    const mappings = new Map();
    for (const asset of manifest.assets) {
      if (
        typeof asset.path !== "string" ||
        typeof asset.servePath !== "string" ||
        path.isAbsolute(asset.path) ||
        path.isAbsolute(asset.servePath) ||
        asset.path.split(/[\\/]/).includes("..") ||
        asset.servePath.split(/[\\/]/).includes("..")
      ) {
        throw new Error("production manifest contains an unsafe asset path");
      }
      const url = `/${asset.servePath}`;
      if (mappings.has(url)) throw new Error(`duplicate production serve path ${url}`);
      mappings.set(url, path.join(root, "dist", asset.path));
    }
    return { assets: [...mappings.keys()].map((item) => item.slice(1)), mappings };
  }
  const relativeFiles = [
    "kernel.mjs",
    "kernel-worker.mjs",
    "compiler-worker.mjs",
    "evaluator.mjs",
    "index.mjs",
    "m4ri.mjs",
  ];
  const dist = path.join(root, "dist");
  if (fs.existsSync(dist)) {
    for (const entry of fs.readdirSync(dist, { withFileTypes: true })) {
      if (entry.isFile()) relativeFiles.push(`dist/${entry.name}`);
    }
  }
  const assets = relativeFiles.filter((filename) =>
    fs.existsSync(path.join(root, filename)),
  );
  return {
    assets,
    mappings: new Map(assets.map((filename) => [`/${filename}`, path.join(root, filename)])),
  };
}

function serviceWorkerSource(release, assets) {
  const urls = [
    "/browser-wasm-harness.html",
    `/browser-wasm-harness.html?release=${encodeURIComponent(release)}`,
    "/browser-wasm-harness.mjs",
    ...assets.map((x) => `/${x}`),
  ];
  return `const CACHE = ${JSON.stringify(`sagejs-${release}`)};
const ASSETS = ${JSON.stringify(urls)};
self.addEventListener("install", (event) => event.waitUntil(
  caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});\n`;
}

export async function createBrowserWasmServer({
  root = packageRoot,
  release = "test-release",
} = {}) {
  const requests = [];
  const { assets, mappings } = collectReleaseAssets(root);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    requests.push({ method: request.method, pathname: url.pathname });
    const headers = { ...securityHeaders };
    if (url.pathname === "/browser-wasm-harness.html") {
      response.writeHead(200, {
        ...headers,
        "Content-Type": MIME_TYPES.get(".html"),
        "Cache-Control": "no-cache",
      });
      response.end(HARNESS_HTML);
      return;
    }
    if (url.pathname === "/browser-wasm-harness.mjs") {
      response.writeHead(200, {
        ...headers,
        "Content-Type": MIME_TYPES.get(".mjs"),
        "Cache-Control": "no-cache",
      });
      response.end(HARNESS_JAVASCRIPT);
      return;
    }
    if (url.pathname === "/browser-wasm-test-sw.js") {
      response.writeHead(200, {
        ...headers,
        "Content-Type": MIME_TYPES.get(".js"),
        "Cache-Control": "no-cache",
        "Service-Worker-Allowed": "/",
      });
      response.end(serviceWorkerSource(url.searchParams.get("release") ?? release, assets));
      return;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400, headers).end("invalid path");
      return;
    }
    const mapped = mappings.get(decoded);
    const filename = mapped ?? path.resolve(root, `.${decoded}`);
    if (!filename.startsWith(`${root}${path.sep}`) || !fs.existsSync(filename)) {
      response.writeHead(404, headers).end("not found");
      return;
    }
    const stat = fs.statSync(filename);
    if (!stat.isFile()) {
      response.writeHead(404, headers).end("not found");
      return;
    }
    response.writeHead(200, {
      ...headers,
      "Content-Type":
        MIME_TYPES.get(path.extname(filename)) ?? "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    fs.createReadStream(filename).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    assets,
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    ),
  };
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function parseEngineList(value = "chromium") {
  const engines = [...new Set(value.split(",").map((x) => x.trim()).filter(Boolean))];
  for (const engine of engines) {
    if (!["chromium", "firefox", "webkit"].includes(engine)) {
      throw new Error(`unsupported browser engine ${JSON.stringify(engine)}`);
    }
  }
  if (engines.length === 0) throw new Error("at least one browser engine is required");
  return engines;
}

export function executablePathFor(engine, browserType) {
  const explicit = process.env[`SAGEJS_${engine.toUpperCase()}_EXECUTABLE`];
  if (explicit) return explicit;
  const bundled = browserType.executablePath();
  if (fs.existsSync(bundled)) return bundled;
  const candidates = engine === "chromium"
    ? ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]
    : engine === "firefox"
      ? ["/usr/bin/firefox"]
      : [];
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  return undefined;
}

export async function loadParityCorpus() {
  const filename = path.join(repositoryRoot, "test", "browser-wasm-parity-corpus.json");
  const corpus = JSON.parse(await fs.promises.readFile(filename, "utf8"));
  if (corpus.schema_version !== 1 || !Array.isArray(corpus.cases)) {
    throw new Error("unsupported browser Wasm parity corpus schema");
  }
  const ids = new Set();
  for (const item of corpus.cases) {
    if (!item.id || ids.has(item.id)) throw new Error(`invalid duplicate corpus id ${item.id}`);
    ids.add(item.id);
    if (!["routine", "release"].includes(item.tier)) {
      throw new Error(`invalid tier for ${item.id}`);
    }
    if (typeof item.workflow !== "string" || item.workflow === "") {
      throw new Error(`case ${item.id} has no workflow name`);
    }
    if (!Array.isArray(item.requires) || item.requires.length === 0) {
      throw new Error(`case ${item.id} has no exact required capability IDs`);
    }
  }
  return corpus;
}

export async function loadProductionCapabilityIds() {
  const filename = path.join(packageRoot, "dist", "production-manifest.json");
  const manifest = JSON.parse(await fs.promises.readFile(filename, "utf8"));
  if (
    manifest.schema !== "sagejs.wasm-production-artifact/v1" ||
    !Array.isArray(manifest.capabilities)
  ) {
    throw new Error("production manifest has no reviewed capability closure");
  }
  const result = new Set(manifest.capabilities.map((item) => item.id));
  const reportFilename = path.join(
    repositoryRoot,
    "architecture",
    "wasm-capabilities-report.json",
  );
  const report = JSON.parse(await fs.promises.readFile(reportFilename, "utf8"));
  if (report.schema !== "sagejs.wasm-capability-report/v1" ||
      !Array.isArray(report.capabilities)) {
    throw new Error("public capability report has no reviewed browser closure");
  }
  for (const capability of report.capabilities) {
    if (capability.status === "available" || capability.status === "fallback") {
      result.add(capability.id);
    }
  }
  return result;
}

export function assertParityExpectation(item, result) {
  const failures = [];
  const expected = item.expect;
  if (Object.hasOwn(expected, "stdout") && result.stdout !== expected.stdout) {
    failures.push(`stdout: expected ${JSON.stringify(expected.stdout)}, got ${JSON.stringify(result.stdout)}`);
  }
  if (Object.hasOwn(expected, "repr") && result.repr !== expected.repr) {
    failures.push(`repr: expected ${JSON.stringify(expected.repr)}, got ${JSON.stringify(result.repr)}`);
  }
  if (expected.numeric_tokens) {
    const source = result[expected.numeric_tokens.stream];
    const found = String(source).match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
    const wanted = expected.numeric_tokens.values;
    if (found.length !== wanted.length) {
      failures.push(`numeric tokens: expected ${wanted.length}, got ${found.length} in ${JSON.stringify(source)}`);
    } else {
      for (let index = 0; index < wanted.length; index += 1) {
        const tolerance = expected.numeric_tokens.absolute_tolerance +
          expected.numeric_tokens.relative_tolerance * Math.abs(wanted[index]);
        if (!Number.isFinite(found[index]) || Math.abs(found[index] - wanted[index]) > tolerance) {
          failures.push(`numeric token ${index}: expected ${wanted[index]} ± ${tolerance}, got ${found[index]}`);
        }
      }
    }
  }
  if (expected.display) {
    if (result.display?.mime !== expected.display.mime) {
      failures.push(`display MIME: expected ${expected.display.mime}, got ${result.display?.mime}`);
    }
    const traces = result.display?.data?.data;
    if (!Array.isArray(traces) || traces.length < expected.display.minimum_traces) {
      failures.push(`display traces: expected at least ${expected.display.minimum_traces}`);
    } else if (expected.display.trace_types) {
      const types = traces.map((trace) => trace.type);
      for (const type of expected.display.trace_types) {
        if (!types.includes(type)) failures.push(`display lacks trace type ${type}`);
      }
    }
  }
  return failures;
}
