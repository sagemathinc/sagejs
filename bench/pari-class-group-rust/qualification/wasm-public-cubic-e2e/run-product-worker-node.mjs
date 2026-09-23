import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { createClassGroupCore } from "../../../../packages/flint-wasm/class-group-core.mjs";
import { installNodeWorkerHost } from "../../../../packages/flint-wasm/node-worker.mjs";

const artifactUrl = new URL("./build/public-cubic-e2e.wasm", import.meta.url);
const vectorUrl = new URL("./row6.vector.json", import.meta.url);
const outputUrl = new URL("./build/product-worker-node.json", import.meta.url);
const [artifact, vectorSource] = await Promise.all([
  readFile(artifactUrl),
  readFile(vectorUrl, "utf8"),
]);
const vector = JSON.parse(vectorSource);
const sha256 = createHash("sha256").update(artifact).digest("hex");

installNodeWorkerHost();
const started = performance.now();
const service = await createClassGroupCore({
  artifact: artifactUrl,
  receipt: { bytes: artifact.byteLength, sha256 },
});
const ready = performance.now();
try {
  const result = await service.invoke(vector.request);
  const finished = performance.now();
  const diagnostics = await service.diagnostics();
  assert.equal(result.outcome, "complete-conditional-grh");
  assert.equal(result.publicComplete, true);
  const stableProjection = Object.fromEntries(
    Object.keys(vector.expectedStableProjection).map((key) => [key, result[key] ?? null]),
  );
  assert.deepEqual(stableProjection, vector.expectedStableProjection);
  const controller = new AbortController();
  const interrupted = service.invoke(vector.request, { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 25));
  const cancellationStarted = performance.now();
  controller.abort();
  await assert.rejects(interrupted, (error) => error.name === "AbortError");
  const cancellationMilliseconds = performance.now() - cancellationStarted;
  await service.ready();
  const replacementDiagnostics = await service.diagnostics();
  assert.equal(replacementDiagnostics.generation, 2);
  const receipt = {
    schema: "sagejs.rust-class-group/product-worker-node-v1",
    outcome: "pass",
    artifact: { bytes: artifact.byteLength, sha256 },
    timingsMilliseconds: {
      ready: ready - started,
      completeCall: finished - ready,
      cancellation: cancellationMilliseconds,
    },
    diagnostics,
    replacementDiagnostics,
    stableProjection,
  };
  await writeFile(outputUrl, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await service.close();
}
