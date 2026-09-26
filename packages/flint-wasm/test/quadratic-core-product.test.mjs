import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createClassGroupCore } from "../class-group-core.mjs";
import { instantiateClassGroupCore } from "../class-group-core-loader.mjs";
import { installNodeWorkerHost } from "../node-worker.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const artifact = path.resolve(process.env.SAGEJS_QUADRATIC_WASM_ARTIFACT ||
  path.join(root, "packages/imaginary-quadratic-core/target/wasm32-wasip1/release/" +
    "sagejs_imaginary_quadratic_core.wasm"));

test("the isolated quadratic reactor retains complete ideal maps in Wasm", {
  skip: !existsSync(artifact) && "build the standalone quadratic development reactor first",
}, async () => {
  const bytes = new Uint8Array(await readFile(artifact));
  const direct = await instantiateClassGroupCore(bytes);
  try {
    const capability = direct.invoke({
      schema: "sagejs.class-groups/service-request-v1",
      abi: 1,
      id: "quadratic-capability",
      operation: "capability",
    });
    assert.equal(capability.ok, true);
    assert.deepEqual(capability.result.operations,
      ["capability", "imaginary-class-number", "imaginary-class-group"]);
  } finally {
    direct.close();
  }

  installNodeWorkerHost();
  const service = await createClassGroupCore({
    artifact: pathToFileURL(artifact),
    receipt: {
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  });
  try {
    for (const [polynomial, classNumber, invariants] of [
      [[6, -1, 1], 3, [3]],
      [[21, 0, 1], 4, [2, 2]],
      [[3750000079, -1, 1], 33768, [2, 16884]],
    ]) {
      const scalar = await service.imaginaryClassNumber(polynomial);
      const group = await service.imaginaryClassGroup(polynomial);
      assert.equal(scalar.classNumber, classNumber);
      assert.equal(group.classNumber, classNumber);
      assert.deepEqual(group.invariantFactors, invariants);
      assert.equal(group.proofStatus, "unconditional-complete");
      assert.equal(group.completeClassMap.length, classNumber);
      assert.equal(group.certificate.reducedForms.length, classNumber);
      assert.equal(new Set(group.completeClassMap.map(({ form }) =>
        `${form.a},${form.b},${form.c}`)).size, classNumber);
      assert.equal(new Set(group.completeClassMap.map(({ coordinates }) =>
        coordinates.join(","))).size, classNumber);
      for (const entry of group.completeClassMap) {
        assert.equal(entry.representativeIdeal.norm, entry.form.a);
        assert.deepEqual(entry.representativeIdeal.basisColumns[0], [entry.form.a, 0]);
      }
    }
    await assert.rejects(service.call("open", { request: {} }),
      (error) => error.category === "capability-declined");
  } finally {
    await service.close();
  }
});
