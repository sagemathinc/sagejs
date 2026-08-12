"use strict";

const { createHash } = require("node:crypto");

const IDENTIFIER = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;

function fail(filename, message) {
  throw new Error(`math dispatch ${filename}: ${message}`);
}

function exactKeys(filename, value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(filename, `${label} must be an object`);
  }
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      filename,
      `${label} fields must be exactly ${expected.join(", ")}; got ${actual.join(", ")}`,
    );
  }
}

function knownKeys(filename, value, required, optional, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(filename, `${label} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(filename, `${label} has unknown field ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) fail(filename, `${label} is missing field ${key}`);
  }
}

function identifier(filename, value, label) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    fail(filename, `${label} must be a kebab-case identifier`);
  }
  return value;
}

function nonemptyString(filename, value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(filename, `${label} must be a nonempty string`);
  }
  return value;
}

function safeInteger(filename, value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(filename, `${label} must be a safe integer at least ${minimum}`);
  }
  return value;
}

function uniqueStrings(filename, value, label, options = {}) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(filename, `${label} must be a list of strings`);
  }
  const result = options.preserveOrder ? [...value] : [...value].sort();
  if (new Set(result).size !== result.length) {
    fail(filename, `${label} contains duplicates`);
  }
  if (options.identifiers) {
    for (const item of result) identifier(filename, item, `${label} entry`);
  }
  return Object.freeze(result);
}

function canonicalize(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON accepts only finite numbers");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object") {
    throw new Error(`canonical JSON cannot encode ${typeof value}`);
  }
  const result = Object.create(null);
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) {
      Object.defineProperty(result, key, {
        value: canonicalize(value[key]),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return result;
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function fingerprint(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function compareVectors(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

module.exports = {
  FINGERPRINT,
  canonicalJson,
  canonicalize,
  compareVectors,
  deepFreeze,
  exactKeys,
  fail,
  fingerprint,
  identifier,
  knownKeys,
  nonemptyString,
  safeInteger,
  uniqueStrings,
};
