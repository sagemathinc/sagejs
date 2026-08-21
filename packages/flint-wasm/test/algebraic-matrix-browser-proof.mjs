import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium as playwrightChromium } from "playwright-core";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromium = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean).find((candidate) => fs.existsSync(candidate));
assert.ok(chromium, "Chromium not found; set SAGEJS_CHROMIUM");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
  if (pathname === "/proof.html") {
    response.writeHead(200, { "Content-Type": contentTypes.get(".html") });
    response.end("<!doctype html><title>Algebraic matrix Wasm proof</title>");
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
      fetch("/dist/flint-algebraic.wasm"),
    );
    const wasi = createWasiHost();
    const instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: wasi.imports,
    });
    wasi.initialize(instance);
    const routes = [];
    const algebraic = createAlgebraicBackend(instance, {
      recordCapability(id, route, details) {
        routes.push({ id, route, details });
      },
    });
    const values = [];
    const matrices = [];
    const own = (value) => (values.push(value), value);
    const ownMatrix = (value) => (matrices.push(value), value);
    const two = own(algebraic.qqbarFromRational(2n, 1n));
    const root = own(algebraic.qqbarSqrt(two));
    const zero = own(algebraic.qqbarFromRational(0n, 1n));
    const one = own(algebraic.qqbarFromRational(1n, 1n));
    const matrix = ownMatrix(algebraic.qqbarMatrix(
      2, 2, [root, one, zero, root], true,
    ));
    const product = ownMatrix(algebraic.matrixMul(matrix, matrix));
    const product00 = own(algebraic.matrixEntry(product, 0, 0));
    const determinant = own(algebraic.matrixDet(matrix));
    const characteristic = algebraic.matrixCharpoly(matrix).map(own);
    const result = {
      product00: algebraic.qqbarToString(product00, 30),
      determinant: algebraic.qqbarToString(determinant, 30),
      characteristic: characteristic.map((value) =>
        algebraic.qqbarToString(value, 30)
      ),
      enclosure: algebraic.qqbarEnclosure(determinant, 128),
      operations: routes.map(({ details }) => details.operation),
      routesValid: routes.every(({ id, route, details }) =>
        id === "algebraic:qqbar-resource-core" &&
        route === "receipt-backed-wasm-artifact" &&
        details.executionTarget === "wasm-artifact"),
    };
    for (const value of matrices.reverse()) {
      algebraic.__sagejs_algebraic_matrix_close__(value);
    }
    for (const value of values.reverse()) algebraic.qqbarClose(value);
    result.liveValues = algebraic.__sagejs_algebraic_live_count__();
    result.liveMatrices = algebraic.__sagejs_algebraic_matrix_live_count__();
    return result;
  });

  assert.equal(proof.product00, "2");
  assert.equal(proof.determinant, "2");
  assert.deepEqual(proof.characteristic, [
    "2",
    "-2.82842712474619009760337744842",
    "1",
  ]);
  assert.equal(proof.enclosure.rigorous, true);
  assert.equal(proof.enclosure.real.lower, 1n);
  assert.equal(proof.enclosure.real.upper, 1n);
  assert.equal(proof.enclosure.real.exponent, 1n);
  assert.equal(proof.routesValid, true);
  for (const operation of [
    "qqbar-matrix-construct",
    "qqbar-matrix-mul",
    "qqbar-matrix-entry",
    "qqbar-matrix-determinant",
    "qqbar-matrix-charpoly",
  ]) assert.ok(proof.operations.includes(operation), operation);
  assert.equal(proof.liveValues, 0);
  assert.equal(proof.liveMatrices, 0);
} finally {
  await browser.close();
  await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())
  );
}
