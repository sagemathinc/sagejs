// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  mkdtempSync,
  linkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
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
  resolveNumericalRuntimeCapability,
} = require("../scripts/numerical-product.cjs");
const {
  numericalRuntimeProviderIdentity,
  numericalOutputBindings,
  validateBuildReceipt,
} = require("../scripts/build-receipt.cjs");
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
  }).reason, /git rev-parse HEAD/);
  assert.deepEqual(numericalRuntimeProviderIdentity(root, {
    SAGEJS_NUMERICAL_PRODUCT_ROOT: output,
  }), {
    available: false,
    source: "unavailable",
    reason: "invalid-product",
  });
  assert.match(inspectNumericalProduct({
    root,
    inputDirectory: output,
    expectedCommit: "abcdef1234567890abcdef1234567890abcdef12",
  }).reason, /source commit/);

  if (process.platform !== "win32") {
    const linkedInput = join(root, "product-through-symlink");
    symlinkSync(output, linkedInput);
    assert.match(inspectNumericalProduct({
      root,
      inputDirectory: linkedInput,
      expectedCommit: candidate,
    }).reason, /symlinked/);
  }

  const hardlink = join(root, "hardlinked-backend.cjs");
  linkSync(join(output, "node/backend.cjs"), hardlink);
  assert.match(inspectNumericalProduct({
    root,
    inputDirectory: output,
    expectedCommit: candidate,
  }).reason, /non-linked/);
  rmSync(hardlink);

  for (const [, installedPath] of productFiles) rmSync(join(root, installedPath));
  installNumericalProduct({ root, inputDirectory: output, expectedCommit: candidate });
  assert.equal(readFileSync(join(root, "dist/numerical/cminpack.wasm"), "utf8"),
    "cminpack-production-wasm");

  const identity = { numericalRuntimeProvider: { available: true } };
  const receipt = {
    schema: "sagejs.build-receipt/v1",
    identity,
    outputs: ["dist/numerical/cminpack.wasm"],
    numericalOutputs: numericalOutputBindings(root, identity),
  };
  assert.equal(validateBuildReceipt(receipt, identity, root).current, true);
  write(join(root, "dist/numerical/cminpack.wasm"), "tampered");
  assert.match(validateBuildReceipt(receipt, identity, root).reason,
    /numerical output digest/);
  write(join(root, "dist/numerical/cminpack.wasm"), "cminpack-production-wasm");

  assert.equal(resolveNumericalRuntimeCapability({ root, environment: {} }).available, true);
  assert.throws(() => resolveNumericalRuntimeCapability({
    root,
    environment: {},
    providerAvailable: false,
    scope: "sea",
  }), /without an authenticated provider/);
  for (const [productPath, installedPath] of productFiles) {
    if (productPath.startsWith("node/") && productPath.endsWith(".wasm")) {
      rmSync(join(root, installedPath));
    }
  }
  assert.deepEqual(resolveNumericalRuntimeCapability({
    root,
    environment: {},
    scope: "sea",
  }), {
    available: false,
    status: "absent",
    scope: "sea",
    required: false,
  });
  assert.throws(() => resolveNumericalRuntimeCapability({
    root,
    environment: { SAGEJS_NUMERICAL_RUNTIME_REQUIRED: "1" },
    scope: "sea",
  }), /sea numerical runtime is absent/);
  write(join(root, "dist/numerical/cminpack.wasm"), "partial");
  assert.throws(() => resolveNumericalRuntimeCapability({
    root,
    environment: {},
    scope: "sea",
  }), /sea numerical runtime is partial/);

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

test("release and SEA builders preserve the required numerical handoff", () => {
  const workflow = readFileSync(join(__dirname, "../.github/workflows/ci.yml"), "utf8");
  assert.match(workflow,
    /numerical-browser-qualification:[\s\S]*needs: \[linux-x64, numerical-product\]/);
  assert.match(workflow,
    /name: Require source-current qualified NLopt[\s\S]*--require-qualified/);
  assert.match(workflow,
    /numerical-browser-qualification:[\s\S]*name: sagejs-numerical-product[\s\S]*numerical-product\.cjs install/);
  const sea = readFileSync(join(__dirname, "../scripts/build-sea.cjs"), "utf8");
  assert.doesNotMatch(sea, /numerical["', ]+scripts["', ]+build-all\.cjs/);
  assert.match(sea, /if \(numericalRuntime\.available\)/);
  assert.match(sea, /inspectBuildReceipt\(root\)/);
});
