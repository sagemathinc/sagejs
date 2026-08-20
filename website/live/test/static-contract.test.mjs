import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

test("public shell exposes accessible execution and file controls", async () => {
  const html = await read("index.html");
  for (const id of ["source", "sessions", "examples", "interrupt", "reset", "import", "export-source", "export-sagepack", "share", "live-status", "capability-family", "capability-search", "capability-records"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  }
  for (const mode of ["selection", "cell", "all"]) assert.match(html, new RegExp(`data-run=["']${mode}["']`));
  assert.match(html, /aria-live="assertive"/);
  assert.match(html, /Skip to the Sage editor/);
  assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:js|css|woff2?)/i, "runtime UI must not load a CDN");
  const app = await read("app.mjs");
  assert.match(app, /wasm-capabilities-report\.json/);
  assert.match(app, /record\.resource_limits/);
  assert.match(app, /Fallback:/);
});

test("Cloudflare policy isolates a deliberately dynamic, credential-free origin", async () => {
  const headers = await read("_headers");
  for (const policy of [
    "Cross-Origin-Opener-Policy: same-origin",
    "Cross-Origin-Embedder-Policy: require-corp",
    "Cross-Origin-Resource-Policy: same-origin",
    "Referrer-Policy: no-referrer",
    "X-Content-Type-Options: nosniff",
  ]) assert.match(headers, new RegExp(policy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(headers, /Content-Security-Policy:.*default-src 'none'/);
  assert.match(headers, /script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'/);
  assert.match(headers, /connect-src 'self'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /\/assets\//);
  const privacy = await read("privacy.html");
  assert.match(privacy, /dedicated origin with no authentication cookies/);
  assert.match(privacy, /deliberately permits dynamic evaluation and WebAssembly/);
});

test("offline worker is same-origin, versioned and credentialless", async () => {
  const worker = await read("sw.js");
  assert.match(worker, /CACHE_PREFIX/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /credentials: "omit"/);
  assert.match(worker, /caches\.delete/);
  assert.match(worker, /caches\.match\("\.\/index\.html"\)/);
  const app = await read("app.mjs");
  assert.match(app, /sw\.js\?release=/);
});
