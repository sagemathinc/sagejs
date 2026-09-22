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

test("the class-group specialist has a lazy 256 MiB production contract", () => {
  const module = layout.modules.find(({ id }) => id === "class-group");
  assert.deepEqual(module, {
    id: "class-group",
    ownershipDomain: "rust-class-group-flint-gmp-mpfr-arb",
    artifact: "class-group-core.wasm",
    eager: false,
    memory: { pageBytes: 65536, initialPages: 256, maximumPages: 4096 },
  });
  const group = layout.artifactTopology.groups.find(({ id }) => id === "class-group");
  assert.equal(group.kind, "specialist");
  assert.deepEqual(group.dependencies, ["eager-core"]);
  assert.ok(group.assets.includes("class-group-core-receipt.json"));
  assert.ok(group.assets.includes("class-group-core.wasm"));
  assert.ok(group.assets.includes("runtime/class-group-core-worker.mjs"));
  assert.ok(group.maximumCompressedDelta.gzipBytes <= 5_000_000);
  // Capability promotion is integration-owned: architecture/wasm-capabilities.json
  // rejects new product IDs until their fallback and public consumer are reviewed.
  assert.deepEqual(capabilities.modules["class-group"].additionalCapabilities, []);
});

const artifact = productionArtifact();
test(
  "the extracted production reactor instantiates and completes a small cubic through the worker",
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
      const result = await service.invoke(request);
      assert.equal(result.outcome, "complete-conditional-grh");
      assert.equal(result.completion.classNumber, "6");
      assert.deepEqual(result.completion.invariantFactors, ["6"]);
      assert.equal((await service.diagnostics()).maximumMemoryPages, 4096);
    } finally {
      await service.close();
    }
  },
);
