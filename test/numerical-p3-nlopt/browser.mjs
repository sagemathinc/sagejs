// sagejs-test-tier: specialized

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const packageRoot = resolve(
  root,
  "src/lib/sagejs/numerics/optimization/backends/nlopt",
);
const productionManifest = JSON.parse(await readFile(
  resolve(packageRoot, "release/production-manifest.json"),
  "utf8",
));
const routes = new Map([
  ["/index.mjs", resolve(packageRoot, "index.mjs")],
  ["/artifact.wasm", resolve(packageRoot, "build/nlopt-methods.wasm")],
  ["/corpus.json", resolve(root, "bench/numerical-p3-nlopt/corpus.json")],
  ["/problems.mjs", resolve(root, "bench/numerical-p3-nlopt/problems.mjs")],
  ["/worker.mjs", resolve(here, "browser-worker.mjs")],
]);

const html = `<!doctype html><script type="module">
import { createNloptBackend } from "/index.mjs";
import { optionsFromCase, validateCase } from "/problems.mjs";
try {
  globalThis.__stage = "load";
  const bytes = new Uint8Array(await (await fetch("/artifact.wasm")).arrayBuffer());
  const corpus = await (await fetch("/corpus.json")).json();
  const solver = await createNloptBackend(bytes);
  const results = [];
  globalThis.__stage = "corpus";
  for (const record of corpus.cases.filter(
    ({ method }) => method === "nlopt-nelder-mead",
  )) {
    const result = solver.solve(optionsFromCase(record));
    const validation = validateCase(record, result);
    if (!validation.accepted) throw new Error(record.id + ": " + JSON.stringify(validation));
    results.push({
      id: record.id,
      method: result.method,
      value: result.value,
      objective: validation.objective,
      maximumViolation: validation.maximumViolation,
      backendConverged: result.backendConverged,
    });
  }
  const shared = new SharedArrayBuffer(4);
  globalThis.__stage = "cooperative";
  const cooperativeWorker = new Worker("/worker.mjs", { type: "module" });
  const cooperative = new Promise((resolve, reject) => {
    cooperativeWorker.onmessage = ({ data }) => {
      if (data.kind === "ready") {
        Atomics.store(new Int32Array(shared), 0, 1);
        cooperativeWorker.postMessage({ mode: "cooperative", shared });
      }
      if (data.kind === "result") resolve(data);
    };
    cooperativeWorker.onerror = reject;
  });
  const cooperativeResult = await cooperative;
  cooperativeWorker.terminate();

  globalThis.__stage = "stuck";
  const stuckWorker = new Worker("/worker.mjs", { type: "module" });
  const ready = new Promise((resolve, reject) => {
    stuckWorker.onmessage = ({ data }) => data.kind === "ready" && resolve();
    stuckWorker.onerror = reject;
  });
  await ready;
  stuckWorker.postMessage({ mode: "stuck" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  stuckWorker.terminate();

  globalThis.__stage = "replacement";
  const replacementWorker = new Worker("/worker.mjs", { type: "module" });
  const replacement = new Promise((resolve, reject) => {
    replacementWorker.onmessage = ({ data }) => {
      if (data.kind === "ready") replacementWorker.postMessage({ mode: "smoke" });
      if (data.kind === "result") resolve(data);
    };
    replacementWorker.onerror = reject;
  });
  const replacementResult = await replacement;
  replacementWorker.terminate();
  globalThis.__result = {
    results,
    inspect: solver.inspect(),
    cooperativeResult,
    replacementResult,
  };
  globalThis.__stage = "done";
} catch (error) {
  globalThis.__error = error.stack || String(error);
} finally {
  globalThis.__done = true;
}
</script>`;

const server = createServer(async (request, response) => {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  if (request.url === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end(html);
    return;
  }
  const path = routes.get(request.url);
  if (path == null) {
    response.statusCode = 404;
    response.end("not found");
    return;
  }
  response.setHeader(
    "Content-Type",
    request.url.endsWith(".wasm") ? "application/wasm" :
      request.url.endsWith(".json") ? "application/json" : "text/javascript",
  );
  response.end(await readFile(path));
});
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();
const executablePath = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].find((path) => path && existsSync(path));
if (executablePath == null) throw new Error("Chromium executable not found");

let browser;
try {
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => globalThis.__done === true, null, {
    timeout: 120_000,
  });
  const error = await page.evaluate(() => globalThis.__error);
  assert.equal(error, undefined, error);
  const result = await page.evaluate(() => globalThis.__result);
  assert.equal(result.results.length, 5);
  assert.equal(result.inspect.liveAllocations, 0);
  assert.equal(result.inspect.liveBytes, 0);
  assert.equal(result.cooperativeResult.result.status, "cancelled");
  assert.equal(result.cooperativeResult.inspect.liveAllocations, 0);
  assert.ok(Math.abs(result.replacementResult.result.value[0] - 0.25) < 1e-6);
  assert.equal(result.replacementResult.inspect.liveAllocations, 0);
  const digest = createHash("sha256")
    .update(JSON.stringify(result.results))
    .digest("hex");
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.numerical-nlopt-browser/v1",
    chromium: await browser.version(),
    cases: result.results.length,
    results_sha256: digest,
    public_semantics_bundle_sha256:
      productionManifest.public_semantics_bundle.sha256,
    pre_set_shared_atomic_force_stop: "pass",
    hard_worker_replacement: "pass",
    lifecycle_after: result.inspect,
  }, null, 2)}\n`);
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
