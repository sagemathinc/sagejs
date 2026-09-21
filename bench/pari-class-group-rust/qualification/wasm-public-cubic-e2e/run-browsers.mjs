import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium, firefox, webkit } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
} from "../../../../packages/flint-wasm/test/browser-wasm-support.mjs";
import {
  assertSameClosureContent,
  sha256,
  sourceClosure,
  toolchainIdentity,
} from "./receipt-identity.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(directory, "../../../..");
const artifactPath = path.join(directory, "build/public-cubic-e2e.wasm");
const vectorPath = path.join(directory, "row6.vector.json");
const outputPath = path.join(directory, "browser-receipt.json");
const nodeReceiptPath = path.join(directory, "node-receipt.json");
const engines = { chromium, firefox, webkit };

function repositoryUrl(filename) {
  return `/${path.relative(repositoryRoot, filename).split(path.sep)
    .map(encodeURIComponent).join("/")}`;
}

function stableProjection(value) {
  const {
    schema,
    outcome,
    publicComplete,
    requestedProof,
    usesPariInput,
    usesPreparedFixture,
    usesFieldAnswersAsInput,
    preparation,
    relations,
    candidate,
    completion,
    firstUnavailableBoundary = null,
  } = value;
  return {
    schema,
    outcome,
    publicComplete,
    requestedProof,
    usesPariInput,
    usesPreparedFixture,
    usesFieldAnswersAsInput,
    preparation,
    relations,
    candidate,
    completion,
    firstUnavailableBoundary,
  };
}

const [artifact, vectorSource, nodeReceiptSource] = await Promise.all([
  readFile(artifactPath),
  readFile(vectorPath, "utf8"),
  readFile(nodeReceiptPath, "utf8"),
]);
const vector = JSON.parse(vectorSource);
const nodeReceipt = JSON.parse(nodeReceiptSource);
const compressedArtifact = gzipSync(artifact, { level: 9, mtime: 0 });
const currentSourceClosure = await sourceClosure(repositoryRoot);
const currentToolchain = await toolchainIdentity(repositoryRoot);
assert.equal(nodeReceipt.artifact.bytes, artifact.byteLength);
assert.equal(nodeReceipt.artifact.sha256, sha256(artifact));
assert.equal(nodeReceipt.artifact.gzipBytes, compressedArtifact.byteLength);
assert.equal(nodeReceipt.artifact.gzipSha256, sha256(compressedArtifact));
assert.equal(nodeReceipt.vectorSha256, sha256(Buffer.from(vectorSource)));
assert.deepEqual(nodeReceipt.toolchain, currentToolchain);
assertSameClosureContent(currentSourceClosure, nodeReceipt.sourceClosure);
const receipt = {
  schema: "sagejs.rust-class-group/wasm-public-cubic-browser-smoke-v1",
  outcome: "fail",
  artifact: {
    path: path.relative(repositoryRoot, artifactPath),
    bytes: artifact.byteLength,
    sha256: sha256(artifact),
    gzipBytes: compressedArtifact.byteLength,
    gzipSha256: sha256(compressedArtifact),
  },
  vector: {
    path: path.relative(repositoryRoot, vectorPath),
    sha256: sha256(Buffer.from(vectorSource)),
  },
  toolchain: currentToolchain,
  sourceClosure: currentSourceClosure,
  stableProjection: vector.expectedStableProjection,
  stableProjectionSha256: sha256(Buffer.from(JSON.stringify(vector.expectedStableProjection))),
  engines: [],
};
const server = await createBrowserWasmServer({
  root: repositoryRoot,
  crossOriginIsolation: false,
});
try {
  for (const [name, browserType] of Object.entries(engines)) {
    const executablePath = executablePathFor(name, browserType);
    assert.ok(executablePath, `${name} executable is unavailable`);
    const browser = await browserType.launch({
      executablePath,
      headless: true,
      args: name === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
    });
    try {
      const page = await browser.newPage();
      const routeUrl = repositoryUrl(path.join(
        repositoryRoot,
        "bench/pari-class-group-rust/qualification/browser/class-group-route.html",
      ));
      await page.goto(
        `${server.origin}${routeUrl}?artifact=${encodeURIComponent(repositoryUrl(artifactPath))}`,
        { waitUntil: "load" },
      );
      await page.waitForFunction(() => window.__sagejsClassGroupReady !== undefined);
      await page.evaluate(() => window.__sagejsClassGroupReady);
      const diagnostics = await page.evaluate(() =>
        window.__sagejsClassGroupQualification.diagnostics()
      );
      const result = await page.evaluate(
        (request) => window.__sagejsClassGroupQualification.run(request),
        vector.request,
      );
      const projection = stableProjection(result.result);
      assert.deepEqual(projection, vector.expectedStableProjection);
      assert.equal(result.route, "rust-class-group-wasm-artifact");
      assert.equal(diagnostics.cross_origin_isolated, false);
      assert.equal(diagnostics.shared_array_buffer, false);
      receipt.engines.push({
        engine: name,
        browserVersion: browser.version(),
        userAgent: diagnostics.user_agent,
        timingsMs: result.timings_ms,
        memoryPages: result.memory_pages,
        stableProjectionSha256: sha256(Buffer.from(JSON.stringify(projection))),
      });
      await page.evaluate(() => window.__sagejsClassGroupQualification.close());
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
