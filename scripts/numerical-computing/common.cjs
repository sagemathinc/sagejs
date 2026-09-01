"use strict";

const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CONTENT_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GIT_OBJECT_PATTERN = /^[0-9a-f]{40,64}$/;

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(label, value, required, optional = []) {
  if (!isObject(value)) fail(label, "must be an object");
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(value);
  for (const name of required) {
    if (!Object.hasOwn(value, name)) fail(label, `missing ${name}`);
  }
  for (const name of actual) {
    if (!allowed.has(name)) fail(label, `unknown field ${name}`);
  }
  return value;
}

function nonemptyString(label, value) {
  if (typeof value !== "string" || value.length === 0) {
    fail(label, "must be a nonempty string");
  }
  return value;
}

function enumeration(label, value, choices) {
  if (!choices.includes(value)) fail(label, `must be one of ${choices.join(", ")}`);
  return value;
}

function boolean(label, value) {
  if (typeof value !== "boolean") fail(label, "must be a boolean");
  return value;
}

function finiteNumber(label, value, minimum = -Infinity) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    fail(label, `must be a finite number >= ${minimum}`);
  }
  return value;
}

function safeInteger(label, value, minimum = Number.MIN_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(label, `must be a safe integer >= ${minimum}`);
  }
  return value;
}

function array(label, value, validate, { minimum = 0, uniqueBy = null } = {}) {
  if (!Array.isArray(value) || value.length < minimum) {
    fail(label, `must be an array with at least ${minimum} item(s)`);
  }
  const result = value.map((item, index) => validate(`${label}[${index}]`, item));
  if (uniqueBy !== null) {
    const seen = new Set();
    for (const item of result) {
      const key = uniqueBy(item);
      if (seen.has(key)) fail(label, `contains duplicate ${key}`);
      seen.add(key);
    }
  }
  return result;
}

function validateJsonValue(label, value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(label, "contains a non-finite number");
    return value;
  }
  if (typeof value !== "object") fail(label, "contains a non-JSON value");
  if (seen.has(value)) fail(label, "contains a cycle");
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJsonValue(`${label}[${index}]`, item, seen));
  } else {
    for (const key of Object.keys(value)) {
      validateJsonValue(`${label}.${key}`, value[key], seen);
    }
  }
  seen.delete(value);
  return value;
}

function canonicalJson(value) {
  validateJsonValue("canonical JSON", value);
  function encode(item) {
    if (item === null || typeof item !== "object") {
      if (typeof item === "number" && Object.is(item, -0)) return "0";
      return JSON.stringify(item);
    }
    if (Array.isArray(item)) return `[${item.map(encode).join(",")}]`;
    return `{${Object.keys(item).sort().map((key) =>
      `${JSON.stringify(key)}:${encode(item[key])}`).join(",")}}`;
  }
  return encode(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function contentId(value) {
  return `sha256:${sha256(canonicalJson(value))}`;
}

// JSON.parse silently accepts duplicate object keys. Evidence documents do not:
// a validator and a reviewer must see the same value.
function parseJsonText(text, label = "JSON") {
  let index = 0;
  function error(message) {
    fail(label, `${message} at byte ${Buffer.byteLength(text.slice(0, index))}`);
  }
  function whitespace() {
    while (index < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[index])) index += 1;
  }
  function string() {
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index++];
      if (character === '"') {
        try {
          return JSON.parse(text.slice(start, index));
        } catch {
          error("invalid string");
        }
      }
      if (character === "\\") {
        if (index >= text.length) error("unterminated escape");
        const escaped = text[index++];
        if (escaped === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index, index + 4))) error("invalid Unicode escape");
          index += 4;
        } else if (!'"\\/bfnrt'.includes(escaped)) {
          error("invalid escape");
        }
      } else if (character.charCodeAt(0) < 0x20) {
        error("unescaped control character");
      }
    }
    error("unterminated string");
  }
  function number() {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(index));
    if (match === null) error("invalid number");
    index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) error("non-finite number");
    return value;
  }
  function value() {
    whitespace();
    const character = text[index];
    if (character === '"') return string();
    if (character === "[") {
      index += 1;
      whitespace();
      const result = [];
      if (text[index] === "]") {
        index += 1;
        return result;
      }
      for (;;) {
        result.push(value());
        whitespace();
        if (text[index] === "]") {
          index += 1;
          return result;
        }
        if (text[index++] !== ",") error("expected ',' or ']'");
      }
    }
    if (character === "{") {
      index += 1;
      whitespace();
      const result = Object.create(null);
      const keys = new Set();
      if (text[index] === "}") {
        index += 1;
        return result;
      }
      for (;;) {
        whitespace();
        if (text[index] !== '"') error("expected an object key");
        const key = string();
        if (keys.has(key)) error(`duplicate object key ${JSON.stringify(key)}`);
        keys.add(key);
        whitespace();
        if (text[index++] !== ":") error("expected ':'");
        result[key] = value();
        whitespace();
        if (text[index] === "}") {
          index += 1;
          return result;
        }
        if (text[index++] !== ",") error("expected ',' or '}'");
      }
    }
    for (const [token, result] of [["true", true], ["false", false], ["null", null]]) {
      if (text.startsWith(token, index)) {
        index += token.length;
        return result;
      }
    }
    if (character === "-" || /[0-9]/.test(character ?? "")) return number();
    error("expected a JSON value");
  }
  const result = value();
  whitespace();
  if (index !== text.length) error("trailing content");
  return result;
}

function readJson(filename) {
  return parseJsonText(fs.readFileSync(filename, "utf8"), filename);
}

function pretty(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function repositoryPath(root, candidate, label = "path") {
  nonemptyString(label, candidate);
  if (candidate.includes("\0") || path.isAbsolute(candidate)) {
    fail(label, "must be a repository-relative path");
  }
  const resolvedRoot = path.resolve(root);
  let rootStatus;
  try {
    rootStatus = fs.lstatSync(resolvedRoot);
  } catch {
    fail(label, "repository root does not exist");
  }
  if (!rootStatus.isDirectory()) fail(label, "repository root must be a directory");
  const realRoot = fs.realpathSync(resolvedRoot);
  const resolved = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(label, "escapes the repository root");
  }
  let current = resolvedRoot;
  for (const component of relative.split(path.sep).filter((item) => item.length !== 0)) {
    current = path.join(current, component);
    let status;
    try {
      status = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
    if (status.isSymbolicLink()) {
      fail(label, `refuses symbolic-link path component ${path.relative(resolvedRoot, current)}`);
    }
    const real = fs.realpathSync(current);
    const realRelative = path.relative(realRoot, real);
    if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(realRelative)) {
      fail(label, `resolved path component escapes the repository root: ${component}`);
    }
  }
  return {
    absolute: resolved,
    relative: relative.split(path.sep).join("/") || ".",
  };
}

function digestPath(root, candidate, label = "path") {
  const top = repositoryPath(root, candidate, label);
  if (!fs.existsSync(top.absolute)) fail(label, `does not exist: ${top.relative}`);
  const hash = createHash("sha256");
  let bytes = 0;
  let files = 0;
  function visit(filename, relativeName) {
    const status = fs.lstatSync(filename);
    if (status.isSymbolicLink()) fail(label, `symbolic links are not evidence inputs: ${relativeName}`);
    if (status.isDirectory()) {
      hash.update(`directory\0${relativeName}\0`);
      for (const name of fs.readdirSync(filename).sort()) {
        visit(path.join(filename, name), `${relativeName}/${name}`);
      }
      return;
    }
    if (!status.isFile()) fail(label, `unsupported filesystem object: ${relativeName}`);
    const content = fs.readFileSync(filename);
    hash.update(`file\0${relativeName}\0${content.length}\0`);
    hash.update(content);
    hash.update("\0");
    bytes += content.length;
    files += 1;
  }
  visit(top.absolute, top.relative);
  return { path: top.relative, sha256: hash.digest("hex"), bytes, files };
}

// Unlike digestPath, this digest intentionally excludes the repository-relative
// top-level location. It identifies the bytes and internal directory layout so
// independently staged copies of one release artifact can be cross-bound.
// Regular files use their ordinary raw SHA-256 digest.
function contentDigestPath(root, candidate, label = "path") {
  const top = repositoryPath(root, candidate, label);
  if (!fs.existsSync(top.absolute)) fail(label, `does not exist: ${top.relative}`);
  const status = fs.lstatSync(top.absolute);
  if (status.isSymbolicLink()) fail(label, "symbolic links are not evidence inputs");
  if (status.isFile()) return sha256(fs.readFileSync(top.absolute));
  if (!status.isDirectory()) fail(label, "unsupported filesystem object");
  const hash = createHash("sha256");
  function visit(filename, relativeName) {
    const itemStatus = fs.lstatSync(filename);
    if (itemStatus.isSymbolicLink()) {
      fail(label, `symbolic links are not evidence inputs: ${relativeName}`);
    }
    if (itemStatus.isDirectory()) {
      hash.update(`directory\0${relativeName}\0`);
      for (const name of fs.readdirSync(filename).sort()) {
        visit(path.join(filename, name), relativeName === "." ? name : `${relativeName}/${name}`);
      }
      return;
    }
    if (!itemStatus.isFile()) fail(label, `unsupported filesystem object: ${relativeName}`);
    const content = fs.readFileSync(filename);
    hash.update(`file\0${relativeName}\0${content.length}\0`);
    hash.update(content);
    hash.update("\0");
  }
  visit(top.absolute, ".");
  return hash.digest("hex");
}

function digestBundle(root, paths, label = "source paths") {
  const normalized = array(label, paths, (itemLabel, item) =>
    repositoryPath(root, nonemptyString(itemLabel, item), itemLabel).relative,
  { minimum: 1, uniqueBy: (item) => item }).sort();
  const entries = normalized.map((name) => digestPath(root, name, `${label}.${name}`));
  return { paths: normalized, entries, sha256: sha256(canonicalJson(entries)) };
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function repositoryIdentity(root) {
  const commit = git(root, ["rev-parse", "HEAD"]);
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  if (!GIT_OBJECT_PATTERN.test(commit) || !GIT_OBJECT_PATTERN.test(tree)) {
    fail("repository", "Git returned an invalid object identity");
  }
  const status = execFileSync(
    "git", ["-C", root, "status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { encoding: "buffer", stdio: ["ignore", "pipe", "pipe"] },
  );
  return {
    commit,
    tree,
    clean: status.length === 0,
    status_sha256: sha256(status),
  };
}

const PLATFORM_IDS = Object.freeze({
  "linux-x64": "linux-x64",
  "linux-arm64": "linux-arm64",
  "darwin-arm64": "macos-arm64",
  "win32-x64": "windows-x64",
});

function platformIdentity() {
  const hostKey = `${process.platform}-${process.arch}`;
  const id = PLATFORM_IDS[hostKey];
  if (id === undefined) fail("platform", `unsupported qualification host ${hostKey}`);
  const cpu = os.cpus()[0]?.model ?? "unknown";
  const facts = {
    id,
    os_platform: process.platform,
    architecture: process.arch,
    os_type: os.type(),
    os_release: os.release(),
    endianness: os.endianness(),
    cpu,
    logical_cpus: os.cpus().length,
    total_memory_bytes: os.totalmem(),
  };
  return { ...facts, machine_id: contentId(facts) };
}

function collectorIdentity() {
  return {
    kind: "node",
    name: process.release.name,
    version: process.version,
    node: process.versions.node,
    v8: process.versions.v8,
    modules_abi: process.versions.modules ?? null,
  };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function summary(values) {
  if (!Array.isArray(values) || values.length === 0) fail("metric samples", "must not be empty");
  values.forEach((value, index) => finiteNumber(`metric samples[${index}]`, value, 0));
  return {
    samples: values,
    minimum: Math.min(...values),
    median: median(values),
    maximum: Math.max(...values),
  };
}

function validateSha256(label, value) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(label, "must be a lowercase SHA-256 digest");
  }
  return value;
}

function validateContentId(label, value) {
  if (typeof value !== "string" || !CONTENT_ID_PATTERN.test(value)) {
    fail(label, "must be a sha256: content identity");
  }
  return value;
}

module.exports = {
  CONTENT_ID_PATTERN,
  GIT_OBJECT_PATTERN,
  PLATFORM_IDS,
  SHA256_PATTERN,
  array,
  boolean,
  canonicalJson,
  collectorIdentity,
  contentId,
  contentDigestPath,
  digestBundle,
  digestPath,
  enumeration,
  exactKeys,
  fail,
  finiteNumber,
  isObject,
  median,
  nonemptyString,
  parseJsonText,
  platformIdentity,
  pretty,
  readJson,
  repositoryIdentity,
  repositoryPath,
  safeInteger,
  sha256,
  summary,
  validateContentId,
  validateJsonValue,
  validateSha256,
};
