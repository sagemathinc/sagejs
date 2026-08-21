import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium as playwrightChromium } from "playwright-core";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const artifact = [
  process.env.SAGEJS_ALGEBRAIC_WASM,
  path.join(packageRoot, "dist", "flint-algebraic.wasm"),
  path.join(packageRoot, "dist", "flint-factor.wasm"),
].filter(Boolean).find((candidate) => fs.existsSync(candidate));
const chromium = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean).find((candidate) => fs.existsSync(candidate));

if (artifact === undefined) {
  process.stdout.write("SKIP: production FLINT Wasm artifact is not built\n");
  process.exit(0);
}
const module = await WebAssembly.compile(fs.readFileSync(artifact));
const exports = new Set(
  WebAssembly.Module.exports(module).map(({ name }) => name),
);
if (!exports.has("sagejs_wasm_algebraic_initialize")) {
  process.stdout.write("SKIP: integration has not linked algebraic resources\n");
  process.exit(0);
}
assert.ok(chromium, "Chromium not found; set SAGEJS_CHROMIUM");

const contentTypes = new Map([
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
  if (pathname === "/proof.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Algebraic resource proof</title>");
    return;
  }
  if (pathname === "/algebraic-test.wasm") {
    response.writeHead(200, { "Content-Type": "application/wasm" });
    fs.createReadStream(artifact).pipe(response);
    return;
  }
  const filename = path.resolve(packageRoot, pathname.slice(1));
  if (!filename.startsWith(`${packageRoot}${path.sep}`) ||
      !fs.existsSync(filename) || fs.statSync(filename).isDirectory()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type":
      contentTypes.get(path.extname(filename)) ?? "application/octet-stream",
  });
  fs.createReadStream(filename).pipe(response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await playwrightChromium.launch({
  executablePath: chromium,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/proof.html`);
  const proof = await page.evaluate(async () => {
    const [{ createAlgebraicBackend }, { createWasiHost }] = await Promise.all([
      import("/algebraic.mjs"),
      import("/dist/wasi-runtime.mjs"),
    ]);
    const module = await WebAssembly.compileStreaming(
      fetch("/algebraic-test.wasm"),
    );
    const wasi = createWasiHost();
    const instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: wasi.imports,
    });
    wasi.initialize(instance);
    const algebraic = createAlgebraicBackend(instance);
    const two = algebraic.qqbarFromRational(2n, 1n);
    // Force detachment of all pre-growth views; the backend must recreate
    // views from `memory.buffer` at every transfer boundary.
    instance.exports.memory.grow(1);
    const root = algebraic.qqbarPowRational(two, 1n, 2n);
    const fourthRoot = algebraic.qqbarRootOfUnity(1n, 4n);
    const roots = algebraic.polyExactRoots([-2n, 0n, 1n]);
    const serialized = algebraic.qqbarSerialize(root);
    const restored = algebraic.qqbarDeserialize(serialized);
    const result = {
      minpoly: algebraic.qqbarMinpolyCoefficients(root).map(String),
      roots: roots.map(([value, multiplicity]) => ({
        text: algebraic.qqbarToString(value, 18),
        multiplicity,
      })),
      restoredEqual: algebraic.qqbarEqual(root, restored),
      rigorous: algebraic.qqbarEnclosure(root, 96).rigorous,
      fourthRoot: algebraic.qqbarToString(fourthRoot, 30),
    };
    for (const value of [
      two, root, fourthRoot, restored, ...roots.map(([value]) => value),
    ]) {
      algebraic.qqbarClose(value);
    }
    result.live = algebraic.__sagejs_algebraic_live_count__();
    return result;
  });
  assert.deepEqual(proof.minpoly, ["-2", "0", "1"]);
  assert.equal(proof.roots.length, 2);
  assert.deepEqual(proof.roots.map(({ multiplicity }) => multiplicity), [1, 1]);
  assert.equal(proof.restoredEqual, true);
  assert.equal(proof.rigorous, true);
  assert.equal(proof.fourthRoot, "I");
  assert.equal(proof.live, 0);
  process.stdout.write(
    "FLINT QQbar resources passed real Chromium exactness/lifecycle proof\n",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
