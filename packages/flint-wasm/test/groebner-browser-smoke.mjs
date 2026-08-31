import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const artifact = path.join(packageRoot, "dist", "flint-factor.wasm");
const executablePath = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean).find((candidate) => fs.existsSync(candidate));

assert.ok(fs.existsSync(artifact), "production FLINT Wasm artifact is not built");
assert.ok(executablePath, "Chromium not found; set SAGEJS_CHROMIUM");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
  if (pathname === "/proof.html") {
    response.writeHead(200, { "Content-Type": contentTypes.get(".html") });
    response.end("<!doctype html><title>Groebner browser proof</title>");
    return;
  }
  if (pathname === "/groebner.wasm") {
    response.writeHead(200, { "Content-Type": contentTypes.get(".wasm") });
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
    "Content-Type": contentTypes.get(path.extname(filename)) ??
      "application/octet-stream",
  });
  fs.createReadStream(filename).pipe(response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/proof.html`);
  const result = await page.evaluate(async () => {
    const [{ createMultivariateBackend }, { createWasiHost }] =
      await Promise.all([
        import("/multivariate-backend.mjs"),
        import("/dist/wasi-runtime.mjs"),
      ]);
    const module = await WebAssembly.compileStreaming(fetch("/groebner.wasm"));
    const wasi = createWasiHost();
    const instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: wasi.imports,
    });
    wasi.initialize(instance);
    const routes = [];
    const backend = createMultivariateBackend(instance, {
      recordCapability(id, route, metadata) {
        routes.push({ id, route, crossings: metadata.boundaryCrossings });
      },
    });
    function run(kind, modulus = 0n) {
      const context = backend.mpolyContext(
        kind, 2, "degrevlex", modulus,
      );
      const x = backend.mpolyGen(context, 0);
      const y = backend.mpolyGen(context, 1);
      const one = backend.mpolyConstant(context, 1n, 1n);
      const seven = backend.mpolyConstant(context, 7n, 1n);
      const generators = [
        backend.mpolySub(backend.mpolyMul(x, y), one),
        backend.mpolyAdd(
          backend.mpolyPow(x, 3),
          backend.mpolyMul(seven, backend.mpolyPow(y, 2)),
        ),
      ];
      const basis = backend.mpolyGroebnerMsolve(generators);
      return {
        basis: basis.map((value) =>
          backend.mpolyToString(value, ["x", "y"])),
        reductions: generators.map((value) =>
          backend.mpolyToString(
            backend.mpolyReduce(value, basis), ["x", "y"])),
      };
    }
    return {
      finite: run("nmod", 65537n),
      rational: run("qq"),
      routes,
    };
  });
  assert.deepEqual(result.finite, {
    basis: ["x*y+65536", "y^3+18725*x^2", "x^3+7*y^2"],
    reductions: ["0", "0"],
  });
  assert.deepEqual(result.rational, {
    basis: ["x*y-1", "y^3+1/7*x^2", "x^3+7*y^2"],
    reductions: ["0", "0"],
  });
  assert.deepEqual(result.routes, [
    {
      id: "wasm-library:msolve:f4-prime-field-packed-v1",
      route: "receipt-backed-wasm-artifact",
      crossings: 1,
    },
    {
      id: "wasm-library:msolve:modular-qq-packed-v1",
      route: "receipt-backed-wasm-artifact",
      crossings: 1,
    },
  ]);
  process.stdout.write(
    "msolve finite and QQ Groebner bases passed a real Chromium proof\n",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
