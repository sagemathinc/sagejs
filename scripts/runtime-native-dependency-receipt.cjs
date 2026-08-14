"use strict";

const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");

const RECEIPT_SCHEMA = "sagejs.runtime-native-dependency-receipt-v1";
const BINDINGS_SCHEMA = "sagejs.sea-runtime-native-dependency-bindings-v1";
const ZEROMQ_SOURCE = Object.freeze({
  archiveSha256:
    "330abac242c3a7b867773ec20056f8e5902ca390b405ceb3d600da1b82fdb81c",
  name: "zeromq",
  projectOptionsSha256:
    "79c068fa5c7746aae9353bf5548223ac9c44970f4f80ad0dc6bc593fb68063c9",
  url: "https://registry.npmjs.org/zeromq/-/zeromq-6.5.0.tgz",
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
      "name",
      "projectOptionsSha256",
      "url",
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
    receipt.build === null ||
    typeof receipt.build !== "object" ||
    Array.isArray(receipt.build) ||
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
  ZEROMQ_RECEIPT_ASSET,
  ZEROMQ_SOURCE,
  canonicalJson,
  compareNumericVersions,
  createRuntimeNativeDependencyReceipt,
  createSeaRuntimeNativeDependencyBindings,
  readRuntimeNativeDependencyReceipt,
  sha256Bytes,
  validateRuntimeNativeDependencyReceipt,
  validateSeaRuntimeNativeDependencyBindings,
};
