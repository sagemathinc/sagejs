"use strict";

const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");

const RECEIPT_SCHEMA = "sagejs.runtime-native-dependency-receipt-v1";
const BINDINGS_SCHEMA = "sagejs.sea-runtime-native-dependency-bindings-v1";
const ZEROMQ_VCPKG_BASELINE =
  "608d1dbcd6969679f82b1ca6b89d58939c9b228e";
const ZEROMQ_VCPKG_URL = "https://github.com/microsoft/vcpkg.git";
const ZEROMQ_BUILD_FEATURES = Object.freeze({
  curve: true,
  draft: true,
  noSyncResolve: false,
  sodium: true,
  websockets: false,
  websocketsSecure: false,
});
const ZEROMQ_LINKED_PACKAGES = Object.freeze([
  Object.freeze({
    features: Object.freeze(["curve", "draft", "sodium"]),
    name: "zeromq",
    portVersion: 2,
    version: "4.3.5",
  }),
  Object.freeze({
    features: Object.freeze([]),
    name: "libsodium",
    portVersion: 3,
    version: "1.0.20",
  }),
]);
const ZEROMQ_LINKED_SOURCES = Object.freeze([
  Object.freeze({
    archiveSha256:
      "6c972d1e6a91a0ecd79c3236f04cf0126f2f4dfbbad407d72b4606a7ba93f9c6",
    archiveSha512:
      "108d9c5fa761c111585c30f9c651ed92942dda0ac661155bca52cc7b6dbeb3d27b0dd994abde206eacfc3bc88d19ed24e45b291050c38469e34dca5f8c9a037d",
    license: Object.freeze({
      sha256:
        "1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5",
      spdx: "MPL-2.0",
    }),
    name: "libzmq",
    port: Object.freeze({
      manifestSha256:
        "7f4a690dc969072846cb7573a453b44597672351307cdd1c81216cac7aa8395f",
      name: "zeromq",
      portFileSha256:
        "f6df781bc3958f71bdbc99bbca3427ff939b934c7272fd66f859f6f6255e2e88",
      portVersion: 2,
    }),
    url: "https://github.com/zeromq/libzmq/archive/refs/tags/v4.3.5.tar.gz",
    version: "4.3.5",
  }),
  Object.freeze({
    archiveSha256:
      "8e5aeca07a723a27bbecc3beef14b0068d37e7fc0e97f51b3f1c82d2a58005c1",
    archiveSha512:
      "477b9dc10d87ae3c83db3fc207b50b9fe39593684a59f164986cce32bdaba95db0df7dee32149bf9a23c5794354fce8241d88a9a4bd4bbf2630483cbbc378c2f",
    license: Object.freeze({
      sha256:
        "43964d976a6db3fb986af689d05f8ca0e9971878bccae709750dac8fdc4a99cf",
      spdx: "ISC",
    }),
    name: "libsodium",
    port: Object.freeze({
      manifestSha256:
        "26cb2c94e958d3f9294f09d15f54757660c88add1eb9ce3147877abe42a73fb8",
      name: "libsodium",
      portFileSha256:
        "513d4d04cd34e0c362d239c8d42394f3a3c3c9999898cc8d16bb965d595c8bc8",
      portVersion: 3,
    }),
    url: "https://github.com/jedisct1/libsodium/archive/refs/tags/1.0.20-RELEASE.tar.gz",
    version: "1.0.20",
  }),
]);
const ZEROMQ_SOURCE = Object.freeze({
  archiveSha256:
    "330abac242c3a7b867773ec20056f8e5902ca390b405ceb3d600da1b82fdb81c",
  name: "zeromq",
  linkedSources: ZEROMQ_LINKED_SOURCES,
  projectOptionsSha256:
    "79c068fa5c7746aae9353bf5548223ac9c44970f4f80ad0dc6bc593fb68063c9",
  url: "https://registry.npmjs.org/zeromq/-/zeromq-6.5.0.tgz",
  vcpkgManifestSha256:
    "03990d8c60264e4b2080623210eb4ea3a0a6d0ea2459fa9783fd0e4b375cb5af",
  version: "6.5.0",
});
const ZEROMQ_RECEIPT_ASSET = "native/dependencies/zeromq-receipt.json";
const ZEROMQ_ADDON_ASSET = "native/zeromq.node";

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableJson(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(stableJson(value));
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, keys) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function numericVersion(value) {
  return typeof value === "string" && /^\d+(?:\.\d+){1,2}$/.test(value);
}

function compareNumericVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function validateRuntimeNativeDependencyReceipt(receipt, options = {}) {
  if (
    !exactKeys(receipt, [
      "build",
      "identitySha256",
      "output",
      "schema",
      "source",
      "target",
      "toolchain",
    ]) ||
    receipt.schema !== RECEIPT_SCHEMA ||
    !/^[0-9a-f]{64}$/.test(receipt.identitySha256 ?? "") ||
    !exactKeys(receipt.source, [
      "archiveSha256",
      "linkedSources",
      "name",
      "projectOptionsSha256",
      "url",
      "vcpkgManifestSha256",
      "version",
    ]) ||
    canonicalJson(receipt.source) !== canonicalJson(ZEROMQ_SOURCE) ||
    !exactKeys(receipt.target, [
      "arch",
      "deployment",
      "nodeNapi",
      "nodeVersion",
      "platform",
    ]) ||
    receipt.target.platform !== "darwin" ||
    !["arm64", "x64"].includes(receipt.target.arch) ||
    !exactKeys(receipt.target.deployment, ["macos"]) ||
    !numericVersion(receipt.target.deployment.macos) ||
    typeof receipt.target.nodeNapi !== "string" ||
    typeof receipt.target.nodeVersion !== "string" ||
    !exactKeys(receipt.output, ["sha256", "size"]) ||
    !/^[0-9a-f]{64}$/.test(receipt.output.sha256 ?? "") ||
    !Number.isSafeInteger(receipt.output.size) ||
    receipt.output.size <= 0 ||
    !exactKeys(receipt.build, [
      "cmakePolicyVersionMinimum",
      "features",
      "linkedPackages",
      "projectOptionsSha256",
      "tripletSha256",
      "vcpkgBaseline",
      "vcpkgUrl",
    ]) ||
    receipt.build.cmakePolicyVersionMinimum !== "3.5" ||
    canonicalJson(receipt.build.features) !==
      canonicalJson(ZEROMQ_BUILD_FEATURES) ||
    canonicalJson(receipt.build.linkedPackages) !==
      canonicalJson(ZEROMQ_LINKED_PACKAGES) ||
    receipt.build.projectOptionsSha256 !==
      ZEROMQ_SOURCE.projectOptionsSha256 ||
    !/^[0-9a-f]{64}$/.test(receipt.build.tripletSha256 ?? "") ||
    receipt.build.vcpkgBaseline !== ZEROMQ_VCPKG_BASELINE ||
    receipt.build.vcpkgUrl !== ZEROMQ_VCPKG_URL ||
    receipt.toolchain === null ||
    typeof receipt.toolchain !== "object" ||
    Array.isArray(receipt.toolchain)
  ) {
    throw new Error("runtime native dependency receipt is invalid");
  }
  const identity = { ...receipt };
  delete identity.identitySha256;
  if (sha256Bytes(canonicalJson(identity)) !== receipt.identitySha256) {
    throw new Error("runtime native dependency receipt identity is invalid");
  }
  if (options.addonBytes !== undefined) {
    const bytes = Buffer.from(options.addonBytes);
    if (
      bytes.length !== receipt.output.size ||
      sha256Bytes(bytes) !== receipt.output.sha256
    ) {
      throw new Error("runtime native dependency addon does not match its receipt");
    }
  }
  if (options.target !== undefined) {
    const target = options.target;
    if (
      receipt.target.platform !== target.platform ||
      receipt.target.arch !== target.arch ||
      receipt.target.nodeNapi !== target.nodeNapi
    ) {
      throw new Error("runtime native dependency receipt does not match the target");
    }
  }
  if (
    options.maximumMinimumMacos !== undefined &&
    compareNumericVersions(
      receipt.target.deployment.macos,
      options.maximumMinimumMacos,
    ) > 0
  ) {
    throw new Error("runtime native dependency exceeds the macOS release floor");
  }
  return receipt;
}

function createRuntimeNativeDependencyReceipt(value) {
  const identity = stableJson({ ...value, schema: RECEIPT_SCHEMA });
  const receipt = {
    ...identity,
    identitySha256: sha256Bytes(canonicalJson(identity)),
  };
  return validateRuntimeNativeDependencyReceipt(receipt);
}

function readRuntimeNativeDependencyReceipt(filename, options = {}) {
  if (!existsSync(filename)) return null;
  try {
    return validateRuntimeNativeDependencyReceipt(
      JSON.parse(readFileSync(filename, "utf8")),
      options,
    );
  } catch {
    return null;
  }
}

function createSeaRuntimeNativeDependencyBindings(options) {
  if (options.target.platform !== "darwin") return null;
  const receiptFilename = options.assets[ZEROMQ_RECEIPT_ASSET];
  const addonFilename = options.assets[ZEROMQ_ADDON_ASSET];
  if (typeof receiptFilename !== "string" || typeof addonFilename !== "string") {
    throw new Error("macOS SEA omitted its ZeroMQ runtime dependency receipt");
  }
  const receipt = validateRuntimeNativeDependencyReceipt(
    JSON.parse(readFileSync(receiptFilename, "utf8")),
    {
      addonBytes: readFileSync(addonFilename),
      maximumMinimumMacos: options.maximumMinimumMacos,
      target: options.target,
    },
  );
  return {
    bindings: {
      zeromq: {
        assets: [ZEROMQ_ADDON_ASSET],
        receiptAsset: ZEROMQ_RECEIPT_ASSET,
        receiptIdentitySha256: receipt.identitySha256,
        source: { ...ZEROMQ_SOURCE },
      },
    },
    schema: BINDINGS_SCHEMA,
  };
}

function validateSeaRuntimeNativeDependencyBindings(declaration, options) {
  if (options.target.platform !== "darwin") {
    if (declaration !== null) {
      throw new Error("runtime native dependency bindings are unexpected");
    }
    return declaration;
  }
  const binding = declaration?.bindings?.zeromq;
  if (
    !exactKeys(declaration, ["bindings", "schema"]) ||
    declaration.schema !== BINDINGS_SCHEMA ||
    !exactKeys(declaration.bindings, ["zeromq"]) ||
    !exactKeys(binding, [
      "assets",
      "receiptAsset",
      "receiptIdentitySha256",
      "source",
    ]) ||
    canonicalJson(binding.assets) !== canonicalJson([ZEROMQ_ADDON_ASSET]) ||
    binding.receiptAsset !== ZEROMQ_RECEIPT_ASSET ||
    !/^[0-9a-f]{64}$/.test(binding.receiptIdentitySha256 ?? "") ||
    canonicalJson(binding.source) !== canonicalJson(ZEROMQ_SOURCE)
  ) {
    throw new Error("runtime native dependency binding declaration is invalid");
  }
  for (const asset of [ZEROMQ_ADDON_ASSET, ZEROMQ_RECEIPT_ASSET]) {
    if (!options.assets.has(asset)) {
      throw new Error(`runtime native dependency asset is missing: ${asset}`);
    }
  }
  if (
    options.binaryLabels !== undefined &&
    !new Set(options.binaryLabels).has(ZEROMQ_ADDON_ASSET)
  ) {
    throw new Error("ZeroMQ addon is absent from the native binary receipt");
  }
  const receiptBytes = options.bytes(ZEROMQ_RECEIPT_ASSET);
  const addonBytes = options.bytes(ZEROMQ_ADDON_ASSET);
  if (receiptBytes === null || addonBytes === null) {
    throw new Error("embedded ZeroMQ dependency bytes are missing");
  }
  const receipt = validateRuntimeNativeDependencyReceipt(
    JSON.parse(Buffer.from(receiptBytes).toString("utf8")),
    {
      addonBytes,
      maximumMinimumMacos: options.maximumMinimumMacos,
      target: options.target,
    },
  );
  if (receipt.identitySha256 !== binding.receiptIdentitySha256) {
    throw new Error("embedded ZeroMQ receipt identity does not match its binding");
  }
  return declaration;
}

module.exports = {
  BINDINGS_SCHEMA,
  RECEIPT_SCHEMA,
  ZEROMQ_ADDON_ASSET,
  ZEROMQ_BUILD_FEATURES,
  ZEROMQ_RECEIPT_ASSET,
  ZEROMQ_LINKED_PACKAGES,
  ZEROMQ_LINKED_SOURCES,
  ZEROMQ_SOURCE,
  ZEROMQ_VCPKG_BASELINE,
  ZEROMQ_VCPKG_URL,
  canonicalJson,
  compareNumericVersions,
  createRuntimeNativeDependencyReceipt,
  createSeaRuntimeNativeDependencyBindings,
  readRuntimeNativeDependencyReceipt,
  sha256Bytes,
  validateRuntimeNativeDependencyReceipt,
  validateSeaRuntimeNativeDependencyBindings,
};
