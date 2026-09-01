// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const test = require("node:test");

const {
  inspectNumericalProduct,
  installNumericalProduct,
  productFiles,
  publishNumericalProduct,
} = require("../scripts/numerical-product.cjs");
const {
  productionToolchainIdentity,
} = require(
  "../packages/flint-wasm/numerical/scripts/production-toolchain-identity.cjs"
);
const {
  loadCatalog,
  loadLock,
  toolchainDigest,
} = require("../packages/wasm-toolchain/scripts/toolchain.cjs");

const candidate = "1234567890abcdef1234567890abcdef12345678";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function write(filename, value) {
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, value);
}

function fixture(context) {
  const root = mkdtempSync(join(tmpdir(), "sagejs-numerical-product-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const cminpack = Buffer.from("cminpack-production-wasm");
  const nlopt = Buffer.from("nlopt-production-wasm");
  for (const [, installedPath] of productFiles) {
    const bytes = installedPath.endsWith("cminpack.wasm")
      ? cminpack
      : installedPath.endsWith("nlopt-methods.wasm")
        ? nlopt
        : Buffer.from(`bundle:${installedPath}`);
    write(join(root, installedPath), bytes);
  }
  write(
    join(root, "packages/flint-wasm/numerical/release/production-manifest.json"),
    JSON.stringify({ artifact: { bytes: cminpack.length, sha256: sha256(cminpack) } }),
  );
  write(
    join(root, "src/lib/sagejs/numerics/optimization/backends/nlopt/release/production-manifest.json"),
    JSON.stringify({ artifact: { bytes: nlopt.length, sha256: sha256(nlopt) } }),
  );
  return root;
}

test("the numerical product handoff is exact, source-bound, and installable", (context) => {
  const root = fixture(context);
  const output = join(root, "build/product");
  const manifest = publishNumericalProduct({
    root,
    outputDirectory: output,
    sourceCommit: candidate,
  });
  assert.match(manifest.identity, /^sha256:[0-9a-f]{64}$/);
  assert.equal(inspectNumericalProduct({
    root,
    inputDirectory: output,
    expectedCommit: candidate,
  }).valid, true);
  assert.match(inspectNumericalProduct({
    root,
    inputDirectory: output,
    expectedCommit: "abcdef1234567890abcdef1234567890abcdef12",
  }).reason, /source commit/);

  for (const [, installedPath] of productFiles) rmSync(join(root, installedPath));
  installNumericalProduct({ root, inputDirectory: output, expectedCommit: candidate });
  assert.equal(readFileSync(join(root, "dist/numerical/cminpack.wasm"), "utf8"),
    "cminpack-production-wasm");

  write(join(output, "unrecorded"), "no");
  assert.match(inspectNumericalProduct({
    root,
    inputDirectory: output,
    expectedCommit: candidate,
  }).reason, /unrecorded files/);
});

test("production identity stays canonical while retaining the host builder", () => {
  const lock = loadLock();
  const catalog = loadCatalog(lock);
  const canonical = toolchainDigest(lock, catalog, lock.canonicalBuilder);
  const mac = toolchainDigest(lock, catalog, "darwin-arm64");
  assert.notEqual(mac, canonical);
  assert.deepEqual(productionToolchainIdentity({
    lock,
    lockDigest: mac,
    platform: "darwin-arm64",
  }), {
    identity: canonical,
    builder: { identity: mac, platform: "darwin-arm64" },
  });
});
