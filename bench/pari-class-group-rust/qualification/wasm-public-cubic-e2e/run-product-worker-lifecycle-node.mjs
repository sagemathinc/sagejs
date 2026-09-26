import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { createClassGroupCore } from "../../../../packages/flint-wasm/class-group-core.mjs";
import { installNodeWorkerHost } from "../../../../packages/flint-wasm/node-worker.mjs";

const repetitions = 1_000;
const artifactUrl = new URL("./build/public-cubic-e2e.wasm", import.meta.url);
const vectorUrl = new URL("./row6.vector.json", import.meta.url);
const outputUrl = new URL("./build/product-worker-lifecycle-node.json", import.meta.url);
const [artifact, vectorSource] = await Promise.all([
  readFile(artifactUrl),
  readFile(vectorUrl, "utf8"),
]);
const request = structuredClone(JSON.parse(vectorSource).request);
request.polynomialAscending = ["-34", "-30", "-8", "1"];
const sha256 = createHash("sha256").update(artifact).digest("hex");

installNodeWorkerHost();
const service = await createClassGroupCore({
  artifact: artifactUrl,
  receipt: { bytes: artifact.byteLength, sha256 },
});
const checkpoints = [];
let totalMilliseconds = 0;
try {
  for (let index = 1; index <= repetitions; index += 1) {
    const started = performance.now();
    const result = await service.invoke(request);
    totalMilliseconds += performance.now() - started;
    assert.equal(result.outcome, "complete-conditional-grh");
    assert.equal(result.publicComplete, true);
    assert.equal(result.completion?.classNumber, "6");
    assert.deepEqual(result.completion?.invariantFactors, ["6"]);
    assert.equal(result.completion?.sealedEvidenceVerified, true);
    if (index % 100 === 0) {
      const diagnostics = await service.diagnostics();
      checkpoints.push({
        completedCalls: index,
        memoryPages: diagnostics.memoryPages,
        cumulativeMeanMilliseconds: totalMilliseconds / index,
      });
    }
  }
  assert.ok(checkpoints.every(({ memoryPages }) => memoryPages === 256));
  const receipt = {
    schema: "sagejs.rust-class-group/product-worker-lifecycle-node-v1",
    outcome: "pass",
    artifact: { bytes: artifact.byteLength, sha256 },
    workload: {
      repetitions,
      polynomialAscending: request.polynomialAscending,
      expectedClassNumber: "6",
      expectedInvariantFactors: ["6"],
    },
    totalMilliseconds,
    meanMilliseconds: totalMilliseconds / repetitions,
    checkpoints,
  };
  await writeFile(outputUrl, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await service.close();
}
