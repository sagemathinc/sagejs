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
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Skip to the Sage editor/);
  assert.match(html, /class="brand" href="https:\/\/sagejs\.org\/"/);
  assert.match(html, /href="\.\/codemirror-license\.txt"/);
  assert.match(html, /<div id="source" class="source-editor"><\/div>/);
  assert.doesNotMatch(html, /<textarea[^>]+id="source"/);
  assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:js|css|woff2?)/i, "runtime UI must not load a CDN");
  const app = await read("app.mjs");
  assert.match(app, /wasm-capabilities-report\.json/);
  assert.match(app, /record\.resource_limits/);
  assert.match(app, /Fallback:/);
  assert.match(app, /cellController\.addEventListener\("error"/);
  const controller = await read("cell-controller.mjs");
  assert.match(controller, /this\.session\.on\("error"/);
  assert.match(app, /Ready — recovered session/);
  assert.match(app, /result-input/);
  assert.match(app, /Copy input/);
  assert.match(app, /navigator\.clipboard\.writeText\(input\)/);
  assert.match(app, /createSourceEditor\(elements\.source/);
  const editor = await read("codemirror-editor.mjs");
  assert.match(editor, /python\(\)/);
  assert.match(editor, /indentUnit\.of\(FOUR_SPACES\)/);
  assert.match(editor, /close|basicSetup/);
  assert.match(editor, /Shift-Enter/);
  assert.match(editor, /Mod-Enter/);
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
  assert.match(headers, /Access-Control-Allow-Origin: \*/);
  assert.match(headers, /Cross-Origin-Resource-Policy: cross-origin/);
  assert.match(headers, /\/embed\/v1\/frame\.html[\s\S]*frame-ancestors \*/);
  assert.match(headers, /! X-Frame-Options/);
  const privacy = await read("privacy.html");
  assert.match(privacy, /dedicated origin with no authentication cookies/);
  assert.match(privacy, /deliberately permits dynamic evaluation and WebAssembly/);
});

test("offline worker is same-origin, versioned and credentialless by default", async () => {
  const worker = await read("sw.js");
  assert.match(worker, /CACHE_PREFIX/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /cocalc-preview/);
  assert.match(worker, /\? "same-origin"\s*:\s*"omit"/);
  assert.match(worker, /caches\.delete/);
  assert.match(worker, /__SAGEJS_ASSET_MANIFEST_SHA256__/);
  assert.match(worker, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(worker, /failed its authenticated byte contract/);
  assert.match(worker, /cache: "no-store"/);
  const app = await read("app.mjs");
  assert.match(app, /new URL\("\.\/sw\.js"/);
  assert.match(app, /searchParams\.set\("release"/);
});

test("embeddable cell has a transport-neutral, instance-scoped contract", async () => {
  const component = await read("embed/v1/sagejs-cell.mjs");
  assert.match(component, /class SageJsCell extends HTMLElement/);
  assert.match(component, /attachShadow\(\{ mode: "open" \}\)/);
  assert.match(component, /acquireSageCellSession/);
  assert.match(component, /"session"/);
  assert.match(component, /export async function createSageCell/);
  for (const operation of ["ready", "run", "interrupt", "reset", "snapshot", "dispose"]) {
    assert.match(component, new RegExp(`async ${operation}\\(|${operation}\\(\\) \\{`));
  }
  assert.doesNotMatch(component, /https?:\/\//);
  const pool = await read("cell-session-pool.mjs");
  assert.match(pool, /createSageCellController/);
  assert.match(pool, /liveSessions: 16/);
  assert.match(pool, /sharedSessions: 8/);
  assert.match(pool, /record\.tail/);
  const runtime = await read("runtime-api.mjs");
  assert.match(runtime, /workerBootstrap/);
  assert.match(runtime, /pendingMessages/);
  assert.match(runtime, /assetBase\.origin !== globalThis\.location\.origin/);
  const declarative = await read("embed/v1/index.html");
  assert.match(declarative, /<sagejs-cell/);
  assert.match(declarative, /type="text\/x-sage"/);
  const factory = await read("embed/v1/factory-example.mjs");
  assert.match(factory, /createSageCell/);
  assert.match(factory, /@interact/);
  const frame = await read("embed/v1/frame.mjs");
  assert.match(frame, /org\.sagejs\.cell-frame\/v1/);
  assert.match(frame, /event\.source !== window\.parent/);
  assert.match(frame, /event\.origin !== parentOrigin/);
  assert.match(frame, /value === "\*"/);
  assert.match(frame, /MAX_MESSAGE_BYTES = 256 \* 1024/);
  assert.match(frame, /REQUEST_ID\.test/);
  assert.doesNotMatch(frame, /postMessage\([^,]+,\s*["']\*["']/);
});
