import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, firefox, webkit } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
} from "../../../../packages/flint-wasm/test/browser-wasm-support.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, "../../../..");
const artifactPath = path.join(directory, "build/public-cubic-e2e.wasm");
const vectorPath = path.join(directory, "row6.vector.json");
const outputPath = path.join(directory, "build/product-worker-browsers.json");
const requested = process.argv.slice(2).length ? process.argv.slice(2) : ["chromium"];
const engines = { chromium, firefox, webkit };

function repositoryUrl(filename) {
  return `/${path.relative(repositoryRoot, filename).split(path.sep)
    .map(encodeURIComponent).join("/")}`;
}

const [artifact, vectorSource] = await Promise.all([
  readFile(artifactPath),
  readFile(vectorPath, "utf8"),
]);
const vector = JSON.parse(vectorSource);
const sha256 = createHash("sha256").update(artifact).digest("hex");
const receipt = {
  schema: "sagejs.rust-class-group/product-worker-browsers-v1",
  outcome: "fail",
  artifact: { bytes: artifact.byteLength, sha256 },
  engines: [],
};
const server = await createBrowserWasmServer({ root: repositoryRoot, crossOriginIsolation: false });
try {
  for (const name of requested) {
    const browserType = engines[name];
    if (browserType === undefined) throw new Error(`unknown browser engine ${name}`);
    const browser = await browserType.launch({
      executablePath: executablePathFor(name, browserType),
      headless: true,
      args: name === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
    });
    try {
      const page = await browser.newPage();
      const route = repositoryUrl(path.join(directory, "product-worker-route.html"));
      const artifactUrl = repositoryUrl(artifactPath);
      await page.goto(
        `${server.origin}${route}?artifact=${encodeURIComponent(artifactUrl)}` +
          `&bytes=${artifact.byteLength}&sha256=${sha256}`,
        { waitUntil: "load" },
      );
      await page.waitForFunction(() => window.__sagejsRustClassGroupWorkerReady !== undefined);
      await page.evaluate(() => window.__sagejsRustClassGroupWorkerReady);
      const observed = await page.evaluate(
        (request) => window.__sagejsRustClassGroupWorker.run(request),
        vector.request,
      );
      const stableProjection = Object.fromEntries(
        Object.keys(vector.expectedStableProjection)
          .map((key) => [key, observed.result[key] ?? null]),
      );
      assert.deepEqual(stableProjection, vector.expectedStableProjection);
      assert.equal(observed.after.cancellation, "worker-termination");
      assert.equal(await page.evaluate(() => crossOriginIsolated), false);
      const cancellation = await page.evaluate(
        (request) => window.__sagejsRustClassGroupWorker.cancellationProbe(request),
        vector.request,
      );
      assert.equal(cancellation.errorName, "AbortError");
      assert.equal(cancellation.diagnostics.generation, 2);
      await page.evaluate(() => window.__sagejsRustClassGroupWorker.close());
      receipt.engines.push({
        engine: name,
        browserVersion: browser.version(),
        elapsedMilliseconds: observed.elapsedMilliseconds,
        memoryPagesBefore: observed.before.memoryPages,
        memoryPagesAfter: observed.after.memoryPages,
        cancellation,
        stableProjection,
      });
    } finally {
      await browser.close();
    }
  }
  receipt.outcome = "pass";
} catch (error) {
  receipt.failure = String(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  await server.close();
}
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
