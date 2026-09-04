"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalJson,
  contentId,
  parseJsonText,
  sha256,
} = require("../common.cjs");

const SCHEMA = "sagejs.numerical-browser-executable-binding/v1";

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) {
    throw new Error(`${label} has unexpected fields`);
  }
}

function executableIdentity(filename, version) {
  if (typeof filename !== "string" || !path.isAbsolute(filename)) {
    throw new Error("browser executable path must be absolute");
  }
  const real = fs.realpathSync(filename);
  const status = fs.lstatSync(real);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error("browser executable must be a real regular file");
  }
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("browser executable version must be nonempty");
  }
  const bytes = fs.readFileSync(real);
  return {
    path: real,
    sha256: sha256(bytes),
    bytes: bytes.length,
    version,
  };
}

function createBinding(subject, executable) {
  const core = { schema: SCHEMA, subject, executable };
  return { ...core, id: contentId(core) };
}

function validateBinding(value, expectedSubject = null, { authenticate = true } = {}) {
  exactKeys(value, ["schema", "id", "subject", "executable"], "browser executable binding");
  if (value.schema !== SCHEMA) throw new Error("browser executable binding has wrong schema");
  const { id, ...core } = value;
  if (id !== contentId(core)) throw new Error("browser executable binding content ID mismatch");
  exactKeys(value.subject, ["kind", "name", "version", "engine"], "browser subject");
  if (!["browser", "worker"].includes(value.subject.kind) ||
      !["chromium", "firefox", "webkit"].includes(value.subject.engine) ||
      (value.subject.kind === "worker" && value.subject.engine !== "chromium") ||
      typeof value.subject.name !== "string" || value.subject.name.length === 0 ||
      typeof value.subject.version !== "string" || value.subject.version.length === 0) {
    throw new Error("browser executable binding has unsupported subject identity");
  }
  if (expectedSubject !== null &&
      canonicalJson(value.subject) !== canonicalJson(expectedSubject)) {
    throw new Error("browser executable binding subject differs from capability subject");
  }
  exactKeys(
    value.executable,
    ["path", "sha256", "bytes", "version"],
    "browser executable identity",
  );
  const executable = value.executable;
  const portableAbsolute = path.isAbsolute(executable.path) ||
    /^[A-Za-z]:[\\/]/.test(executable.path) || executable.path.startsWith("\\\\");
  if (!portableAbsolute || !/^[0-9a-f]{64}$/.test(executable.sha256) ||
      !Number.isSafeInteger(executable.bytes) || executable.bytes <= 0 ||
      executable.version !== value.subject.version) {
    throw new Error("browser executable binding has invalid executable identity");
  }
  if (authenticate) {
    if (!path.isAbsolute(executable.path)) {
      throw new Error("browser executable path is foreign to this authentication host");
    }
    const actual = executableIdentity(executable.path, executable.version);
    if (canonicalJson(actual) !== canonicalJson(executable)) {
      throw new Error("browser executable bytes differ from their binding");
    }
  }
  return value;
}

function readBinding(filename, expectedSubject = null, options = {}) {
  const status = fs.lstatSync(filename);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error("browser executable binding must be a regular non-symbolic-link file");
  }
  return validateBinding(
    parseJsonText(fs.readFileSync(filename, "utf8"), "browser executable binding"),
    expectedSubject,
    options,
  );
}

module.exports = {
  SCHEMA,
  createBinding,
  executableIdentity,
  readBinding,
  validateBinding,
};
