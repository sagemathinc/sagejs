// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const {
  mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const {
  currentBuildIdentity, inspectBuildReceipt, inspectSourceBuildReceipt,
  outputBindings, refreshBuildReceiptAfterNative, validateBuildReceipt,
  writeBuildReceipt,
} = require("../scripts/build-receipt.cjs");

function fixture(context) {
  const root = mkdtempSync(join(tmpdir(), "sagejs-output-integrity-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "package.json"), "{}\n");
  for (const name of ["compiler", "tools", "vendor", "module-cache", "runtime-cache"]) {
    mkdirSync(join(root, "dist", name), { recursive: true });
    writeFileSync(join(root, "dist", name, "payload"), `original ${name}\n`);
  }
  for (const name of ["compiler/compiler.js", "tools/kernel.js", "runtime-cache/manifest.json", "sagejs-version.json"]) {
    writeFileSync(join(root, "dist", name), "built\n");
  }
  // The synthetic fixture deliberately has no optional numerical provider.
  const identity = { ...currentBuildIdentity(root), numericalRuntimeProvider: undefined };
  const receipt = writeBuildReceipt({ root, identity, durationMilliseconds: 10 });
  return { root, identity, receipt };
}

test("complete output trees detect changed, added, and removed cache entries", (context) => {
  const { root, identity, receipt } = fixture(context);
  assert.equal(validateBuildReceipt(receipt, identity, root).current, true);
  const filename = join(root, "dist/module-cache/payload");
  const original = readFileSync(filename);
  writeFileSync(filename, Buffer.alloc(original.length, 120));
  assert.match(validateBuildReceipt(receipt, identity, root).reason, /digest or inventory/);
  writeFileSync(filename, original);
  const extra = join(root, "dist/module-cache/unrecorded");
  writeFileSync(extra, "injected");
  assert.match(validateBuildReceipt(receipt, identity, root).reason, /digest or inventory/);
  rmSync(extra);
  assert.equal(validateBuildReceipt(receipt, identity, root).current, true);
  rmSync(filename);
  assert.equal(validateBuildReceipt(receipt, identity, root).current, false);
});

test("old, missing, and malformed output bindings cannot qualify a build", (context) => {
  const { root, identity, receipt } = fixture(context);
  for (const changed of [
    { schema: "sagejs.build-receipt/v1" },
    { schema: "sagejs.build-receipt/v2" },
    { identity: { ...identity, artifactInputsSha256: undefined } },
    { outputBindings: undefined },
    { outputBindings: [] },
    { outputBindings: {} },
    { outputs: [] },
    { outputs: {} },
    { outputs: ["../outside"] },
  ]) {
    assert.equal(validateBuildReceipt({ ...receipt, ...changed }, identity, root).current, false);
  }
});

test("output snapshots reject symlinks including dangling links", (context) => {
  const { root, identity, receipt } = fixture(context);
  const link = join(root, "dist/vendor/linked");
  // Directory junctions do not require Windows Developer Mode/admin rights.
  symlinkSync(join(root, "dist/tools"), link, process.platform === "win32" ? "junction" : "dir");
  assert.match(validateBuildReceipt(receipt, identity, root).reason, /not a regular/);
  rmSync(link);
  if (process.platform !== "win32") {
    symlinkSync(join(root, "absent"), link);
    assert.match(validateBuildReceipt(receipt, identity, root).reason, /not a regular/);
  }
  assert.throws(() => outputBindings(root, ["../outside"]), /invalid build output path/);
});

test("output snapshots reject symlinked ancestor directories", (context) => {
  const { root, identity, receipt } = fixture(context);
  renameSync(join(root, "dist"), join(root, "relocated-dist"));
  symlinkSync(join(root, "relocated-dist"), join(root, "dist"),
    process.platform === "win32" ? "junction" : "dir");
  assert.match(validateBuildReceipt(receipt, identity, root).reason, /ancestor/);
});

test("a self-consistent reduced witness inventory cannot omit required products", (context) => {
  const { root, identity, receipt } = fixture(context);
  const changed = { ...receipt, outputs: ["package.json"],
    outputBindings: outputBindings(root, ["package.json"]) };
  rmSync(join(root, "dist/compiler"), { recursive: true });
  assert.match(validateBuildReceipt(changed, identity, root).reason, /witness contract/);
});

test("native refresh cannot launder changed compiler or runtime outputs", (context) => {
  const { root } = fixture(context);
  assert.equal(inspectSourceBuildReceipt(root).current, true);
  const before = readFileSync(join(root, "dist/build-receipt.json"));
  writeFileSync(join(root, "dist/compiler/payload"), "truncated");
  assert.throws(() => refreshBuildReceiptAfterNative(root), /digest or inventory/);
  assert.deepEqual(readFileSync(join(root, "dist/build-receipt.json")), before);
});

test("native refresh binds replacement packs while preserving source products", (context) => {
  const { root } = fixture(context);
  const nativeDirectory = join(root, "packages/flint/build/generated-ffi");
  mkdirSync(nativeDirectory, { recursive: true });
  writeFileSync(join(nativeDirectory, "sagejs_flint_ffi.node"), "native input");
  mkdirSync(join(root, "dist/native-kernels"));
  writeFileSync(join(root, "dist/native-kernels/index.json"), "{}\n");
  const pack = join(root, "dist/native-kernels/pack.node");
  writeFileSync(pack, "first native product");
  refreshBuildReceiptAfterNative(root);
  assert.equal(inspectBuildReceipt(root).current, true);
  writeFileSync(pack, "replacement native product");
  assert.equal(inspectBuildReceipt(root).current, false);
  assert.equal(inspectSourceBuildReceipt(root).current, true);
  refreshBuildReceiptAfterNative(root);
  assert.equal(inspectBuildReceipt(root).current, true);
  writeFileSync(join(root, "dist/runtime-cache/payload"), "bad runtime");
  assert.throws(() => refreshBuildReceiptAfterNative(root), /digest or inventory/);
});

test("native refresh refuses an empty or incomplete replacement pack", (context) => {
  const { root } = fixture(context);
  const nativeDirectory = join(root, "packages/flint/build/generated-ffi");
  mkdirSync(nativeDirectory, { recursive: true });
  writeFileSync(join(nativeDirectory, "sagejs_flint_ffi.node"), "native input");
  mkdirSync(join(root, "dist/native-kernels"));
  assert.throws(() => refreshBuildReceiptAfterNative(root), /output is missing/);
});
