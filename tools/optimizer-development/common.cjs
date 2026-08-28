"use strict";

const { createHash } = require("node:crypto");

const CONTENT_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const STABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/;

class OptimizerEvidenceError extends Error {
  constructor(label, message) {
    super(`optimizer evidence ${label}: ${message}`);
    this.name = "OptimizerEvidenceError";
  }
}

function fail(label, message) {
  throw new OptimizerEvidenceError(label, message);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(label, value) {
  if (!isPlainObject(value)) fail(label, "must be a plain object");
  return value;
}

function exactKeys(label, value, keys) {
  record(label, value);
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label, `fields must be exactly ${expected.join(", ")}; got ${actual.join(", ")}`);
  }
  return value;
}

function knownKeys(label, value, required, optional = []) {
  record(label, value);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(label, `has unknown field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(label, `is missing field ${key}`);
  }
  return value;
}

function nonemptyString(label, value) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    fail(label, "must be a nonempty string without surrounding whitespace");
  }
  return value;
}

function optionalString(label, value) {
  if (value === null) return null;
  return nonemptyString(label, value);
}

function identifier(label, value) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    fail(label, "must be a kebab-case identifier");
  }
  return value;
}

function stableName(label, value) {
  if (typeof value !== "string" || !STABLE_NAME_PATTERN.test(value)) {
    fail(label, "must be a stable dot, dash, or underscore separated name");
  }
  return value;
}

function enumeration(label, value, allowed) {
  if (!allowed.includes(value)) {
    fail(label, `must be one of ${allowed.join(", ")}`);
  }
  return value;
}

function boolean(label, value) {
  if (typeof value !== "boolean") fail(label, "must be a boolean");
  return value;
}

function safeInteger(label, value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(label, `must be a safe integer at least ${minimum}`);
  }
  return value;
}

function finiteNumber(label, value, minimum = -Infinity, maximum = Infinity) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(label, `must be a finite number in [${minimum}, ${maximum}]`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function digest(label, value) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    fail(label, "must be a lowercase SHA-256 digest");
  }
  return value;
}

function contentId(label, value) {
  if (typeof value !== "string" || !CONTENT_ID_PATTERN.test(value)) {
    fail(label, "must be a sha256: content identity");
  }
  return value;
}

function repositoryPath(label, value) {
  nonemptyString(label, value);
  if (value !== value.normalize("NFC")) fail(label, "must use NFC Unicode normalization");
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value) || value.includes("\\")) {
    fail(label, "must be a repository-relative POSIX path");
  }
  const segments = value.split("/");
  if (segments.some((part) => part === "" || part === "." || part === "..")) {
    fail(label, "must not contain empty, dot, or parent segments");
  }
  return value;
}

function array(label, value, validate, options = {}) {
  if (!Array.isArray(value)) fail(label, "must be an array");
  if (options.minimum !== undefined && value.length < options.minimum) {
    fail(label, `must contain at least ${options.minimum} entries`);
  }
  const result = value.map((item, index) => validate(`${label}[${index}]`, item));
  if (options.uniqueBy) {
    const seen = new Set();
    for (const item of result) {
      const key = options.uniqueBy(item);
      if (seen.has(key)) fail(label, `contains duplicate ${key}`);
      seen.add(key);
    }
  }
  if (options.sortedBy) {
    const keys = result.map(options.sortedBy);
    const sorted = [...keys].sort(compareText);
    if (JSON.stringify(keys) !== JSON.stringify(sorted)) {
      fail(label, "must be in deterministic sorted order");
    }
  }
  return result;
}

function stringArray(label, value, options = {}) {
  return array(label, value, (itemLabel, item) => {
    const text = nonemptyString(itemLabel, item);
    return options.identifiers ? identifier(itemLabel, text) : text;
  }, {
    minimum: options.minimum,
    uniqueBy: options.unique === false ? undefined : (item) => item,
    sortedBy: options.sorted === false ? undefined : (item) => item,
  });
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateJsonValue(label, value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return finiteNumber(label, value);
  if (Array.isArray(value)) {
    return value.map((item, index) => validateJsonValue(`${label}[${index}]`, item));
  }
  record(label, value);
  const result = Object.create(null);
  for (const key of Object.keys(value).sort(compareText)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      fail(label, `contains prohibited key ${key}`);
    }
    result[key] = validateJsonValue(`${label}.${key}`, value[key]);
  }
  return result;
}

function canonicalize(value) {
  const checked = validateJsonValue("canonical JSON", value);
  if (checked === null || typeof checked !== "object") return checked;
  if (Array.isArray(checked)) return checked.map(canonicalize);
  const result = Object.create(null);
  for (const key of Object.keys(checked).sort(compareText)) {
    result[key] = canonicalize(checked[key]);
  }
  return result;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return createHash("sha256").update(bytes).digest("hex");
}

function contentIdentity(schema, payload) {
  nonemptyString("content identity schema", schema);
  return `sha256:${sha256(canonicalJson({ schema, payload }))}`;
}

function documentIdentity(document) {
  record("document identity", document);
  const { schema, id: _ignored, ...payload } = document;
  return contentIdentity(nonemptyString("document schema", schema), payload);
}

function attachIdentity(schema, payload) {
  record("content-addressed payload", payload);
  if (Object.hasOwn(payload, "schema") || Object.hasOwn(payload, "id")) {
    fail("content-addressed payload", "must not contain schema or id");
  }
  const normalized = canonicalize(payload);
  return deepFreeze({
    schema,
    id: contentIdentity(schema, normalized),
    ...normalized,
  });
}

function verifyDocumentIdentity(label, document) {
  contentId(`${label}.id`, document.id);
  const expected = documentIdentity(document);
  if (document.id !== expected) fail(`${label}.id`, `is stale; expected ${expected}`);
  return document.id;
}

function detached(value) {
  return canonicalize(value);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

module.exports = {
  CONTENT_ID_PATTERN,
  DIGEST_PATTERN,
  IDENTIFIER_PATTERN,
  STABLE_NAME_PATTERN,
  OptimizerEvidenceError,
  array,
  attachIdentity,
  boolean,
  canonicalJson,
  canonicalize,
  compareText,
  contentId,
  contentIdentity,
  deepFreeze,
  detached,
  digest,
  documentIdentity,
  enumeration,
  exactKeys,
  fail,
  finiteNumber,
  identifier,
  isPlainObject,
  knownKeys,
  nonemptyString,
  optionalString,
  record,
  repositoryPath,
  safeInteger,
  sha256,
  stringArray,
  stableName,
  validateJsonValue,
  verifyDocumentIdentity,
};
