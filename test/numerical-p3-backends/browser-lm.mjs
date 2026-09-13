// sagejs-test-tier: specialized

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const packageRoot = resolve(root, "packages/flint-wasm/numerical");
const lock = JSON.parse(await readFile(
  resolve(packageRoot, "sources/cminpack-lock.json"), "utf8",
));
const sourceRoot = resolve(
  packageRoot,
  "build/source",
  `cminpack-${lock.cminpack.revision}`,
);
const routes = new Map([
  ["/backend.mjs", resolve(packageRoot, "index.mjs")],
  ["/index.mjs", resolve(packageRoot, "index.mjs")],
  ["/backend.wasm", resolve(packageRoot, "build/cminpack.wasm")],
  ["/oracle.wasm", resolve(packageRoot, "build/mgh-oracle.wasm")],
  ["/qualify.mjs", resolve(packageRoot, "qualification/qualify.mjs")],
  ["/mgh.mjs", resolve(packageRoot, "qualification/mgh.mjs")],
  ["/worker.mjs", resolve(here, "browser-worker-fixture.mjs")],
  ["/cases.txt", resolve(sourceRoot, lock.cminpack.qualification.cases)],
  ["/lmdif-reference.txt", resolve(
    sourceRoot, lock.cminpack.qualification.lmdif_reference,
  )],
  ["/lmder-reference.txt", resolve(
    sourceRoot, lock.cminpack.qualification.lmder_reference,
  )],
]);

const html = `<!doctype html><script type="module">
import { qualifyMgh } from "/qualify.mjs";

const artifact = await (await fetch("/backend.wasm")).arrayBuffer();
const oracle = await (await fetch("/oracle.wasm")).arrayBuffer();
const qualification = await qualifyMgh({
  artifactBytes: artifact,
  oracleBytes: oracle,
  casesText: await (await fetch("/cases.txt")).text(),
  lmdifReferenceText: await (await fetch("/lmdif-reference.txt")).text(),
  lmderReferenceText: await (await fetch("/lmder-reference.txt")).text(),
});
const digest = Array.from(new Uint8Array(await crypto.subtle.digest(
  "SHA-256", new TextEncoder().encode(JSON.stringify(qualification.results)),
))).map((value) => value.toString(16).padStart(2, "0")).join("");

const next = (worker, kind) => new Promise((resolve, reject) => {
  const listener = ({ data }) => {
    if (data.kind === "error") {
      worker.removeEventListener("message", listener);
      reject(new Error(data.error));
    } else if (data.kind === kind) {
      worker.removeEventListener("message", listener);
      resolve(data);
    }
  };
  worker.addEventListener("message", listener);
});
const initialize = async () => {
  const worker = new Worker("/worker.mjs", { type: "module" });
  worker.postMessage({ kind: "initialize", artifact });
  await next(worker, "ready");
  return worker;
};

const worker = await initialize();
const cancellation = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
worker.postMessage({ kind: "cancel", cancellation });
await next(worker, "evaluating");
Atomics.store(new Int32Array(cancellation), 0, 1);
const cancelled = await next(worker, "result");
worker.postMessage({ kind: "rosenbrock" });
const reused = await next(worker, "result");
worker.terminate();

const stuck = await initialize();
stuck.postMessage({ kind: "hang" });
await next(stuck, "hanging");
stuck.terminate();
const replacement = await initialize();
replacement.postMessage({ kind: "rosenbrock" });
const recovered = await next(replacement, "result");
replacement.terminate();

globalThis.__p3Result = {
  mghCases: qualification.results.length,
  mghResultsSha256: digest,
  lifecycle: qualification.lifecycle,
  crossOriginIsolated,
  cancelled,
  reused,
  recovered,
};
</script>`;

const server = createServer(async (request, response) => {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  try {
    const filename = routes.get(request.url);
    if (filename != null) {
      if (filename.endsWith(".wasm")) {
        response.setHeader("content-type", "application/wasm");
      } else if (filename.endsWith(".mjs")) {
        response.setHeader("content-type", "text/javascript");
      } else {
        response.setHeader("content-type", "text/plain");
      }
      response.end(await readFile(filename));
    } else {
      response.setHeader("content-type", "text/html");
      response.end(html);
    }
  } catch (error) {
    response.statusCode = 500;
    response.end(String(error));
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
const chromiumPath =
  process.env.SAGEJS_CHROMIUM_PATH ??
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  execFileSync("which", ["chromium"], { encoding: "utf8" }).trim();
const browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => process.stderr.write(`browser error: ${error.stack}\n`));
  page.on("console", (message) => {
    if (message.type() === "error") process.stderr.write(`browser console: ${message.text()}\n`);
  });
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.waitForFunction(() => globalThis.__p3Result != null, null, {
    timeout: 60_000,
  });
  const receipt = await page.evaluate(() => globalThis.__p3Result);
  assert.equal(receipt.mghCases, 106);
  assert.equal(receipt.crossOriginIsolated, true);
  assert.equal(receipt.lifecycle.liveAllocations, 0);
  assert.equal(receipt.lifecycle.liveBytes, 0);
  assert.equal(receipt.cancelled.result.status, "cancelled");
  for (const record of [receipt.reused, receipt.recovered]) {
    assert.equal(record.result.backendConverged, true);
    assert.deepEqual(record.result.value, [1, 1]);
    assert.equal(record.inspect.liveAllocations, 0);
    assert.equal(record.inspect.liveBytes, 0);
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  await browser.close();
  await new Promise((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
}
