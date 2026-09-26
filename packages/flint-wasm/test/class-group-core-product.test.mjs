import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createClassGroupCore } from "../class-group-core.mjs";
import { instantiateClassGroupCore } from "../class-group-core-loader.mjs";
import { installNodeWorkerHost } from "../node-worker.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(packageRoot, "../..");
const layout = JSON.parse(readFileSync(path.join(packageRoot, "release/production-layout.json")));
const capabilities = JSON.parse(
  readFileSync(path.join(packageRoot, "release/production-capabilities.json")),
);

function productionArtifact() {
  const candidates = [
    process.env.SAGEJS_CLASS_GROUP_WASM_ARTIFACT,
    path.join(repositoryRoot, "packages/class-groups/dist/class-group-core.wasm"),
    path.join(
      repositoryRoot,
      "packages/class-groups/target/wasm32-wasip1/release/sagejs_class_groups.wasm",
    ),
  ].filter(Boolean).map((filename) => path.resolve(filename));
  return candidates.find((filename) => existsSync(filename));
}

test("the development class-group reactor is excluded from the production layout", () => {
  assert.equal(layout.modules.find(({ id }) => id === "class-group"), undefined);
  assert.equal(layout.artifactTopology.groups.find(({ id }) => id === "class-group"), undefined);
  assert.equal(capabilities.modules["class-group"], undefined);
  assert.ok(layout.artifactTopology.groups.every(({ assets }) =>
    assets.every((asset) => !asset.includes("class-group-core.wasm") &&
      !asset.includes("class-group-core-receipt.json"))));
});

const artifact = productionArtifact();
test(
  "the development reactor completes cubic and exact imaginary-quadratic groups in Wasm",
  { skip: artifact ? false : "requires the class-group-rust-core lane to build packages/class-groups/dist/class-group-core.wasm" },
  async () => {
    const bytes = new Uint8Array(await readFile(artifact));
    const direct = await instantiateClassGroupCore(bytes);
    try {
      const diagnostics = direct.diagnostics();
      assert.equal(diagnostics.initialMemoryPages, 256);
      assert.equal(diagnostics.maximumMemoryPages, 4096);
      assert.equal(diagnostics.maximumMemoryBytes, 256 * 1024 * 1024);
    } finally {
      direct.close();
    }

    const vector = JSON.parse(
      await readFile(
        path.join(
          repositoryRoot,
          "bench/pari-class-group-rust/qualification/wasm-public-cubic-e2e/row6.vector.json",
        ),
        "utf8",
      ),
    );
    const request = structuredClone(vector.request);
    request.polynomialAscending = ["-34", "-30", "-8", "1"];
    installNodeWorkerHost();
    const service = await createClassGroupCore({
      artifact: pathToFileURL(artifact),
      receipt: {
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    });
    try {
      const session = await service.open(request);
      const result = session.openReceipt.completion;
      assert.equal(result.outcome, "complete-conditional-grh");
      assert.equal(result.completion.classNumber, "6");
      assert.deepEqual(result.completion.invariantFactors, ["6"]);
      assert.equal((await service.diagnostics()).maximumMemoryPages, 4096);
      await session.close();

      const scalar = await service.imaginaryClassNumber([6, -1, 1]);
      assert.equal(scalar.classNumber, 3);
      assert.equal(scalar.proofStatus, "unconditional-complete");
      const group = await service.imaginaryClassGroup([6, -1, 1]);
      assert.deepEqual(group.invariantFactors, [3]);
      assert.equal(group.completeClassMap.length, 3);
      assert.equal(group.proofStatus, "unconditional-complete");

      const noncyclic = await service.imaginaryClassGroup([21, 0, 1]);
      assert.equal(noncyclic.discriminant, -84);
      assert.equal(noncyclic.classNumber, 4);
      assert.deepEqual(noncyclic.invariantFactors, [2, 2]);
      assert.equal(noncyclic.completeClassMap.length, 4);
      assert.deepEqual(
        new Set(noncyclic.completeClassMap.map(({ coordinates }) => coordinates.join(","))),
        new Set(["0,0", "0,1", "1,0", "1,1"]),
      );
      assert.deepEqual(
        new Set(noncyclic.generators.map(({ coordinates }) => coordinates.join(","))),
        new Set(["0,1", "1,0"]),
      );

      for (const [polynomial, classNumber, invariants] of [
        [[2043354, -1, 1], 4378, [4378]],
        [[25000000001, -1, 1], 31057, [31057]],
        [[3750000079, -1, 1], 33768, [2, 16884]],
      ]) {
        const complete = await service.imaginaryClassGroup(polynomial);
        assert.equal(complete.classNumber, classNumber);
        assert.deepEqual(complete.invariantFactors, invariants);
        assert.equal(complete.proofStatus, "unconditional-complete");
        assert.equal(complete.completeClassMap.length, classNumber);
        assert.equal(
          new Set(complete.completeClassMap.map(({ coordinates }) =>
            coordinates.join(","))).size,
          classNumber,
        );
        assert.deepEqual(
          complete.generators.map(({ coordinates }) => coordinates),
          invariants.map((_, index) =>
            invariants.map((__, coordinate) => Number(index === coordinate))),
        );
      }
      await assert.rejects(
        service.imaginaryClassNumber([9, 0, 1]),
        (error) => error.category === "invalid-request",
      );
    } finally {
      await service.close();
    }
  },
);
