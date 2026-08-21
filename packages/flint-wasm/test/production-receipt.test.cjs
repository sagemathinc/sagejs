"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const test = require("node:test");

const { canonicalJson } = require("../scripts/wasm-toolchain.cjs");
const {
  artifactFiles,
  createArtifactManifest,
  receiptSchema,
  validateProductionReceipt,
  verifyWasmMemoryContract,
  wasmMemories,
} = require("../scripts/production-receipt.cjs");
const {
  enforceTopologyBudgets,
} = require("../scripts/browser-wasm-release-artifact.cjs");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sagejs-wasm-receipt-test-"));
  const packageRoot = join(root, "flint-wasm");
  const outputDirectory = join(packageRoot, "dist");
  mkdirSync(join(packageRoot, "release"), { recursive: true });
  mkdirSync(outputDirectory, { recursive: true });
  cpSync(
    join(__dirname, "..", "release", "production-layout.json"),
    join(packageRoot, "release", "production-layout.json"),
  );
  cpSync(
    join(__dirname, "..", "release", "production-capabilities.json"),
    join(packageRoot, "release", "production-capabilities.json"),
  );
  mkdirSync(join(packageRoot, "toolchain"), { recursive: true });
  cpSync(
    join(__dirname, "..", "toolchain", "adapter-inputs.json"),
    join(packageRoot, "toolchain", "adapter-inputs.json"),
  );
  const layout = JSON.parse(readFileSync(join(packageRoot, "release", "production-layout.json"), "utf8"));
  for (const name of artifactFiles(layout)) {
    mkdirSync(dirname(join(outputDirectory, name)), { recursive: true });
    writeFileSync(join(outputDirectory, name), `asset:${name}\n`);
  }
  const capabilitySource = JSON.parse(readFileSync(
    join(packageRoot, "release", "production-capabilities.json"),
    "utf8",
  ));
  const libraries = new Map();
  for (const { capabilities } of Object.values(capabilitySource.modules)) {
    for (const capability of capabilities) {
      const match = /^(ffi-resource|ffi):([^:]+):(.+)$/.exec(capability);
      assert.ok(match, `unexpected fixture capability ${capability}`);
      const [, kind, library, id] = match;
      if (!libraries.has(library)) libraries.set(library, { library, resources: [], functions: [] });
      libraries.get(library)[kind === "ffi-resource" ? "resources" : "functions"].push(id);
    }
  }
  writeFileSync(
    join(outputDirectory, "ffi-production-closure.json"),
    `${JSON.stringify({
      schema: "sagejs.ffi/wasm-production-closure-v1",
      libraries: [...libraries.values()],
    })}\n`,
  );
  for (const group of layout.artifactTopology.groups) {
    for (const name of group.assets.filter((asset) => asset.startsWith("runtime/"))) {
      const basename = name.slice("runtime/".length);
      writeFileSync(join(packageRoot, basename), `runtime:${basename}\n`);
      mkdirSync(join(outputDirectory, "runtime"), { recursive: true });
      writeFileSync(join(outputDirectory, name), `runtime:${basename}\n`);
    }
  }
  return { root, packageRoot, outputDirectory };
}

test("the production artifact manifest is deterministic and uses dist-relative files", () => {
  const value = fixture();
  try {
    const first = createArtifactManifest(value);
    const second = createArtifactManifest(value);
    assert.deepEqual(first, second);
    assert.match(first.identity, /^sha256:[0-9a-f]{64}$/);
    assert.ok(first.assets.length > 10);
    assert.ok(first.assets.some(({ path }) => path === "runtime/kernel.mjs"));
    assert.ok(first.assets.some(({ path, servePath }) => path === "runtime/kernel.mjs" && servePath === "kernel.mjs"));
    assert.ok(first.assets.some(({ path, servePath }) => path === "compiler.js" && servePath === "dist/compiler.js"));
    assert.ok(first.capabilities.length > 60);
    assert.equal(first.topology.schema, "sagejs.wasm-artifact-topology/v1");
    assert.equal(first.topology.eagerGroup, "eager-core");
    assert.deepEqual(
      first.topology.groups.filter(({ kind }) => kind === "specialist").map(({ id }) => id),
      ["algebraic", "m4ri", "compiled-flint", "compiled-gmp", "plotly"],
    );
    assert.ok(first.topology.groups.every(({ identity }) => /^sha256:[0-9a-f]{64}$/.test(identity)));
    assert.ok(first.capabilities.every(({ artifactSha256 }) => /^[0-9a-f]{64}$/.test(artifactSha256)));
    assert.ok(first.assets.every((asset) => !asset.path.startsWith("/") && !asset.path.includes("..")));
    assert.deepEqual(first.assets.map(({ path }) => path), [...first.assets.map(({ path }) => path)].sort());
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test("receipt validation detects changed production assets", () => {
  const value = fixture();
  try {
    const artifact = createArtifactManifest(value);
    const manifest = `${JSON.stringify(artifact, null, 2)}\n`;
    writeFileSync(join(value.outputDirectory, "production-manifest.json"), manifest);
    writeFileSync(
      join(value.outputDirectory, "build-receipt.json"),
      `${JSON.stringify({
        schema: receiptSchema,
        artifact,
        productionManifestSha256: sha256(manifest),
      }, null, 2)}\n`,
    );
    const valid = validateProductionReceipt(value);
    assert.equal(valid.valid, true);
    assert.equal(valid.identity, artifact.identity);
    writeFileSync(join(value.outputDirectory, artifact.assets[0].path), "tampered\n");
    assert.match(validateProductionReceipt(value).reason, /asset (digest differs|is missing)/);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test("artifact identity binds both layout and file content", () => {
  const value = fixture();
  try {
    const artifact = createArtifactManifest(value);
    const recomputed = `sha256:${sha256(canonicalJson({
      layout: artifact.layout,
      assets: artifact.assets,
      capabilities: artifact.capabilities,
      topology: artifact.topology,
    }))}`;
    assert.equal(artifact.identity, recomputed);
    writeFileSync(join(value.outputDirectory, "flint-factor.wasm"), "different\n");
    assert.notEqual(createArtifactManifest(value).identity, artifact.identity);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test("every deployed asset must have an explicit reviewed topology owner", () => {
  const value = fixture();
  try {
    const layoutFilename = join(value.packageRoot, "release", "production-layout.json");
    const layout = JSON.parse(readFileSync(layoutFilename, "utf8"));
    layout.hostAssets.push("unreviewed-large-library.wasm");
    writeFileSync(layoutFilename, `${JSON.stringify(layout, null, 2)}\n`);
    writeFileSync(join(value.outputDirectory, "unreviewed-large-library.wasm"), "large library\n");
    assert.throws(
      () => createArtifactManifest(value),
      /production asset has no reviewed topology group: unreviewed-large-library\.wasm/,
    );
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test("eager and specialist compressed deltas have independent hard budgets", () => {
  const report = {
    payload_groups: [
      {
        id: "eager-core",
        compressed_delta: { gzip_bytes: 101, brotli_bytes: 90 },
        maximum_compressed_delta: { gzip_bytes: 100, brotli_bytes: 100 },
      },
      {
        id: "algebraic",
        compressed_delta: { gzip_bytes: 20, brotli_bytes: 21 },
        maximum_compressed_delta: { gzip_bytes: 25, brotli_bytes: 20 },
      },
    ],
  };
  assert.deepEqual(enforceTopologyBudgets(report), [
    "eager-core gzip_bytes delta 101 exceeds 100",
    "algebraic brotli_bytes delta 21 exceeds 20",
  ]);
  report.payload_groups[0].compressed_delta.gzip_bytes = 100;
  report.payload_groups[1].compressed_delta.brotli_bytes = 20;
  assert.deepEqual(enforceTopologyBudgets(report), []);
});

test("the Wasm memory parser enforces initial and maximum pages", () => {
  const root = mkdtempSync(join(tmpdir(), "sagejs-wasm-memory-test-"));
  const filename = join(root, "memory.wasm");
  try {
    // WebAssembly header, then memory section: one memory, min 256, max 8192.
    writeFileSync(filename, Buffer.from([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
      0x05, 0x06, 0x01, 0x01, 0x80, 0x02, 0x80, 0x40,
    ]));
    assert.deepEqual(wasmMemories(filename), [{
      imported: false,
      initialPages: 256,
      maximumPages: 8192,
      shared: false,
    }]);
    assert.deepEqual(
      verifyWasmMemoryContract(filename, { initialPages: 256, maximumPages: 8192 }),
      wasmMemories(filename)[0],
    );
    assert.throws(
      () => verifyWasmMemoryContract(filename, { initialPages: 256, maximumPages: 4096 }),
      /memory contract differs/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
