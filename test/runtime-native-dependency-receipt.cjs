"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  ZEROMQ_ADDON_ASSET,
  ZEROMQ_BUILD_FEATURES,
  ZEROMQ_LINKED_PACKAGES,
  ZEROMQ_RECEIPT_ASSET,
  ZEROMQ_SOURCE,
  ZEROMQ_VCPKG_BASELINE,
  ZEROMQ_VCPKG_URL,
  createRuntimeNativeDependencyReceipt,
  createSeaRuntimeNativeDependencyBindings,
  validateRuntimeNativeDependencyReceipt,
  validateSeaRuntimeNativeDependencyBindings,
} = require("../scripts/runtime-native-dependency-receipt.cjs");

function receipt(addon = Buffer.from("fixture addon")) {
  return createRuntimeNativeDependencyReceipt({
    build: {
      cmakePolicyVersionMinimum: "3.5",
      features: { ...ZEROMQ_BUILD_FEATURES },
      linkedPackages: ZEROMQ_LINKED_PACKAGES.map((entry) => ({
        ...entry,
        features: [...entry.features],
      })),
      projectOptionsSha256: ZEROMQ_SOURCE.projectOptionsSha256,
      tripletSha256: "a".repeat(64),
      vcpkgBaseline: ZEROMQ_VCPKG_BASELINE,
      vcpkgUrl: ZEROMQ_VCPKG_URL,
    },
    output: {
      sha256: require("node:crypto").createHash("sha256").update(addon).digest("hex"),
      size: addon.length,
    },
    source: { ...ZEROMQ_SOURCE },
    target: {
      arch: "arm64",
      deployment: { macos: "13.5" },
      nodeNapi: "10",
      nodeVersion: "26.7.0",
      platform: "darwin",
    },
    toolchain: { compiler: "fixture" },
  });
}

test("runtime dependency receipts bind exact addon bytes and deployment", () => {
  const addon = Buffer.from("fixture addon");
  const value = receipt(addon);
  assert.equal(
    validateRuntimeNativeDependencyReceipt(value, {
      addonBytes: addon,
      maximumMinimumMacos: "13.5",
      target: { arch: "arm64", nodeNapi: "10", platform: "darwin" },
    }),
    value,
  );
  assert.throws(
    () => validateRuntimeNativeDependencyReceipt(value, {
      addonBytes: Buffer.from("substituted addon"),
    }),
    /does not match/,
  );
  assert.throws(
    () => validateRuntimeNativeDependencyReceipt(value, {
      maximumMinimumMacos: "13.4",
    }),
    /exceeds/,
  );
});

test("embedded bindings verify source receipt and addon together", () => {
  const addon = Buffer.from("fixture addon");
  const value = receipt(addon);
  const directory = mkdtempSync(join(tmpdir(), "sagejs-zeromq-receipt-"));
  try {
    const addonFilename = join(directory, "zeromq.node");
    const receiptFilename = join(directory, "receipt.json");
    writeFileSync(addonFilename, addon);
    writeFileSync(receiptFilename, `${JSON.stringify(value)}\n`);
    const assets = {
      [ZEROMQ_ADDON_ASSET]: addonFilename,
      [ZEROMQ_RECEIPT_ASSET]: receiptFilename,
    };
    const target = { arch: "arm64", nodeNapi: "10", platform: "darwin" };
    const declaration = createSeaRuntimeNativeDependencyBindings({
      assets,
      maximumMinimumMacos: "13.5",
      target,
    });
    assert.equal(declaration.bindings.zeromq.receiptIdentitySha256, value.identitySha256);
    assert.equal(
      validateSeaRuntimeNativeDependencyBindings(declaration, {
        assets: new Set(Object.keys(assets)),
        binaryLabels: [ZEROMQ_ADDON_ASSET],
        bytes: (name) => name === ZEROMQ_ADDON_ASSET
          ? addon
          : name === ZEROMQ_RECEIPT_ASSET
            ? Buffer.from(JSON.stringify(value))
            : null,
        maximumMinimumMacos: "13.5",
        target,
      }),
      declaration,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("non-macOS targets declare no source-owned runtime dependency", () => {
  assert.equal(
    createSeaRuntimeNativeDependencyBindings({
      assets: {},
      maximumMinimumMacos: null,
      target: { arch: "x64", nodeNapi: "10", platform: "linux" },
    }),
    null,
  );
  assert.equal(
    validateSeaRuntimeNativeDependencyBindings(null, {
      assets: new Set(),
      bytes: () => null,
      target: { arch: "x64", nodeNapi: "10", platform: "linux" },
    }),
    null,
  );
});
