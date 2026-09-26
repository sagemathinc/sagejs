"use strict";

// Load an already-built native kernel without evaluating its generated
// JavaScript fallback. Large private native graphs can have a generated
// fallback much larger than the addon; parsing that fallback is unnecessary
// when a caller already owns buffers in the packed public ABI.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function sha256File(filename) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(filename, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function signatureSha256(signature) {
  const normalized = signature.map((parameter) => {
    assert(Array.isArray(parameter) && parameter.length === 2,
      "native signature entries must be [name, type]");
    const [name, type] = parameter;
    assert(typeof name === "string" && name.length > 0,
      "native parameter name must be nonempty");
    assert(typeof type === "string" && type.length > 0,
      "native parameter type must be nonempty");
    return [name, type];
  });
  return crypto.createHash("sha256")
    .update(JSON.stringify(normalized)).digest("hex");
}

function createIntegerBuffer(length, wordCapacity = 8, source = undefined) {
  if (!Number.isSafeInteger(length) || length < 0 ||
      !Number.isSafeInteger(wordCapacity) || wordCapacity <= 0 ||
      (length !== 0 && wordCapacity > Math.floor(Number.MAX_SAFE_INTEGER / length))) {
    throw new RangeError("invalid packed IntegerBuffer dimensions");
  }
  const packed = {
    sizes: new Int32Array(length),
    limbs: new BigUint64Array(length * wordCapacity),
    length,
    wordCapacity,
  };
  if (source !== undefined) {
    const values = Array.from(source, BigInt);
    if (values.length !== length) {
      throw new RangeError("IntegerBuffer source length differs");
    }
    for (let index = 0; index < length; index += 1) {
      let value = values[index];
      const negative = value < 0n;
      if (negative) value = -value;
      let words = 0;
      while (value !== 0n) {
        if (words >= wordCapacity) {
          throw new RangeError("IntegerBuffer value exceeds its word capacity");
        }
        packed.limbs[index * wordCapacity + words] = BigInt.asUintN(64, value);
        value >>= 64n;
        words += 1;
      }
      packed.sizes[index] = negative ? -words : words;
    }
  }
  packed.toArray = () => Array.from({ length }, (_, index) => {
    const signedWords = packed.sizes[index];
    const words = Math.abs(signedWords);
    let value = 0n;
    for (let word = words - 1; word >= 0; word -= 1) {
      value = (value << 64n) + packed.limbs[index * wordCapacity + word];
    }
    return signedWords < 0 ? -value : value;
  });
  return packed;
}

function createInt64Buffer(source) {
  if (Number.isSafeInteger(source) && source >= 0) return new BigInt64Array(source);
  return BigInt64Array.from(source, BigInt);
}

function createFloat64Buffer(source) {
  if (Number.isSafeInteger(source) && source >= 0) return new Float64Array(source);
  return Float64Array.from(source, Number);
}

function isIntegerBuffer(value) {
  return value !== null && typeof value === "object" &&
    value.sizes instanceof Int32Array && value.limbs instanceof BigUint64Array &&
    Number.isSafeInteger(value.length) && value.length >= 0 &&
    Number.isSafeInteger(value.wordCapacity) && value.wordCapacity > 0 &&
    value.sizes.length >= value.length &&
    value.limbs.length >= value.length * value.wordCapacity;
}

function validateArgument(value, type, name) {
  if (type === "IntegerBuffer") {
    if (!isIntegerBuffer(value)) throw new TypeError(`${name} must be a packed IntegerBuffer`);
    return;
  }
  if (type === "Int64Buffer") {
    if (!(value instanceof BigInt64Array)) throw new TypeError(`${name} must be an Int64Buffer`);
    return;
  }
  if (type === "Float64Buffer") {
    if (!(value instanceof Float64Array)) throw new TypeError(`${name} must be a Float64Buffer`);
    return;
  }
  if (type === "UInt64Buffer") {
    if (!(value instanceof BigUint64Array)) throw new TypeError(`${name} must be a UInt64Buffer`);
    return;
  }
  if (type === "float") {
    if (typeof value !== "number") throw new TypeError(`${name} must be a float`);
    return;
  }
  if (type === "bool") {
    if (typeof value !== "boolean") throw new TypeError(`${name} must be a bool`);
    return;
  }
  if (typeof value !== "bigint" && !Number.isSafeInteger(value)) {
    throw new TypeError(`${name} must be an exact integer`);
  }
}

function readManifestHeader(filename) {
  const descriptor = fs.openSync(filename, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    const count = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    const prefix = buffer.toString("utf8", 0, count);
    const field = (name) => {
      const match = prefix.match(new RegExp(`"${name}"\\s*:\\s*(?:"([^"]*)"|(\\d+))`));
      assert(match, `native manifest header lacks ${name}`);
      return match[1] === undefined ? Number(match[2]) : match[1];
    };
    return {
      cacheKey: field("cacheKey"), sourceHash: field("sourceHash"),
      nativeAbi: field("nativeAbi"),
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

function loadThinCachedKernel(options) {
  const {
    sourcePath, cacheRoot, entry, signature, expected,
  } = options;
  assert(path.isAbsolute(sourcePath), "native sourcePath must be absolute");
  assert(path.isAbsolute(cacheRoot), "native cacheRoot must be absolute");
  assert(typeof entry === "string" && entry.length > 0, "native entry must be nonempty");
  const actualSignatureHash = signatureSha256(signature);
  assert.equal(actualSignatureHash, expected.signatureHash,
    "native signature identity changed");

  const sourceHash = sha256File(sourcePath);
  assert.equal(sourceHash, expected.sourceHash, "native source identity changed");
  const indexPath = path.join(cacheRoot, "index.json");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  assert.equal(index.schema, "sagejs.native-cache/v3", "unsupported native cache index");
  const discovery = index.sources[sourcePath];
  assert(discovery, "native source absent from cache index");
  assert.equal(discovery.sourceHash, sourceHash, "native cache source is stale");
  assert.equal(discovery.cacheKey, expected.cacheKey, "native cache identity changed");
  assert.equal(discovery.nativeAbi, expected.nativeAbi, "native ABI identity changed");

  const outputPath = path.join(cacheRoot, discovery.cacheKey);
  const manifestPath = path.join(outputPath, "manifest.json");
  const addonPath = path.join(outputPath, "build/Release/sagejs_native_kernel.node");
  assert.equal(sha256File(manifestPath), expected.manifestHash,
    "native manifest identity changed");
  const header = readManifestHeader(manifestPath);
  assert.equal(header.cacheKey, discovery.cacheKey, "native manifest cache identity changed");
  assert.equal(header.sourceHash, sourceHash, "native manifest source identity changed");
  assert.equal(header.nativeAbi, discovery.nativeAbi, "native manifest ABI identity changed");
  assert.equal(sha256File(addonPath), expected.addonHash, "native addon identity changed");

  const addon = require(addonPath);
  const property = `${entry}$gmp`;
  assert(Object.prototype.hasOwnProperty.call(addon, property),
    `native addon lacks ${property}`);
  assert.equal(typeof addon[property], "function", `native addon ${property} is not callable`);
  const invoke = (...args) => {
    if (args.length !== signature.length) {
      throw new TypeError(`${entry} needs ${signature.length} arguments`);
    }
    for (let index = 0; index < signature.length; index += 1) {
      validateArgument(args[index], signature[index][1], signature[index][0]);
    }
    return addon[property](...args);
  };
  invoke.gmp = invoke;
  invoke.createIntegerBuffer = createIntegerBuffer;
  invoke.createInt64Buffer = createInt64Buffer;
  invoke.createFloat64Buffer = createFloat64Buffer;
  invoke.nativeAvailable = true;
  invoke.executionMode = "native-thin-cache";
  invoke.compatibility = Object.freeze({
    cacheKey: discovery.cacheKey, sourceHash, nativeAbi: discovery.nativeAbi,
    manifestHash: expected.manifestHash, addonHash: expected.addonHash,
    signatureHash: actualSignatureHash,
  });
  // The full generated module remains the source-identical dynamic fallback,
  // but is intentionally not parsed by the thin native path.
  invoke.loadDynamicFallback = () => require(path.join(outputPath, "index.cjs"))[entry];
  return invoke;
}

module.exports = {
  createFloat64Buffer,
  createInt64Buffer,
  createIntegerBuffer,
  loadThinCachedKernel,
  sha256File,
  signatureSha256,
};
