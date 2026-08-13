"use strict";

const { createHash, randomUUID } = require("node:crypto");
const {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { dirname, relative, resolve, sep } = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  stableJson,
} = require("./native-math-profile.cjs");

const RECEIPT_SCHEMA = "sagejs.native-dependency-receipt-v1";
const OUTPUT_SCHEMA = "sagejs.native-dependency-output-tree-v1";

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value) {
  return JSON.stringify(stableJson(value));
}

function commandIdentity(command, arguments_ = ["--version"], environment = process.env) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    return {
      command,
      error: result.error.code || result.error.message,
      status: null,
    };
  }
  return {
    command,
    output: [result.stdout, result.stderr]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join("\n"),
    status: result.status,
  };
}

function portablePath(path) {
  return path.split(sep).join("/");
}

function validateMathProfile(profile, target = undefined) {
  if (
    profile === null ||
    typeof profile !== "object" ||
    Array.isArray(profile) ||
    profile.schema !== "sagejs.native-math-profile-v1" ||
    !["portable", "cpu-native"].includes(profile.requestedProfile) ||
    !["portable", "cpu-native"].includes(profile.effectiveProfile) ||
    !/^[0-9a-f]{64}$/.test(profile.fingerprint ?? "")
  ) {
    throw new Error("native mathematics profile is invalid");
  }
  const identity = { ...profile };
  delete identity.fingerprint;
  if (sha256Bytes(canonicalJson(identity)) !== profile.fingerprint) {
    throw new Error("native mathematics profile fingerprint is invalid");
  }
  if (
    target !== undefined &&
    (profile.abi?.platform !== target.platform ||
      profile.abi?.arch !== target.arch ||
      profile.abi?.endianness !== target.endianness ||
      profile.abi?.wordBits !== target.wordBits)
  ) {
    throw new Error("native mathematics profile does not match its target");
  }
  return profile;
}

function safeRelativePath(root, filename) {
  const path = portablePath(relative(root, filename));
  if (
    path === "" ||
    path === "." ||
    path === ".." ||
    path.startsWith("../") ||
    path.startsWith("/")
  ) {
    throw new Error(`native dependency output escaped its prefix: ${filename}`);
  }
  return path;
}

function validateSymlink(root, filename, target) {
  if (target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target)) {
    throw new Error(`native dependency output contains an absolute symlink: ${filename}`);
  }
  const destination = resolve(dirname(filename), target);
  if (destination !== root && !destination.startsWith(`${root}${sep}`)) {
    throw new Error(`native dependency output symlink escapes its prefix: ${filename}`);
  }
}

function outputTree(prefix, options = {}) {
  const root = resolve(prefix);
  const excluded = new Set(
    (options.exclude || []).map((filename) => resolve(filename)),
  );
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const filename = resolve(directory, name);
      if (excluded.has(filename)) continue;
      const stat = lstatSync(filename);
      const path = safeRelativePath(root, filename);
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(filename);
        validateSymlink(root, filename, target);
        files.push({ path, target, type: "symlink" });
      } else if (stat.isDirectory()) {
        visit(filename);
      } else if (stat.isFile()) {
        const contents = readFileSync(filename);
        files.push({
          path,
          sha256: sha256Bytes(contents),
          size: contents.length,
          type: "file",
        });
      } else {
        throw new Error(`unsupported native dependency output: ${filename}`);
      }
    }
  };
  if (existsSync(root)) visit(root);
  return {
    files,
    identitySha256: sha256Bytes(canonicalJson(files)),
    schema: OUTPUT_SCHEMA,
  };
}

function nativeDependencyExpectation(options) {
  const mathProfile = validateMathProfile(options.mathProfile);
  const target = stableJson({
    ...mathProfile.abi,
    deployment: options.deployment || null,
  });
  const expectation = stableJson({
    build: options.build,
    capability: options.capability !== false,
    dependency: options.dependency,
    interface: options.interface || null,
    mathProfile,
    package: options.package,
    schema: RECEIPT_SCHEMA,
    target,
    toolchain: options.toolchain,
  });
  if (!/^[a-z0-9][a-z0-9-]*$/.test(expectation.package ?? "")) {
    throw new Error("native dependency package id is invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(expectation.dependency?.sha256 ?? "")) {
    throw new Error("native dependency source SHA-256 is invalid");
  }
  if (
    expectation.toolchain === null ||
    typeof expectation.toolchain !== "object" ||
    Array.isArray(expectation.toolchain)
  ) {
    throw new Error("native dependency toolchain identity is invalid");
  }
  return expectation;
}

function createNativeDependencyReceipt(expectation, prefix, stampPath) {
  const declaration = nativeDependencyExpectation(expectation);
  const outputs = outputTree(prefix, { exclude: [stampPath] });
  const identity = stableJson({ ...declaration, outputs });
  return {
    ...identity,
    identitySha256: sha256Bytes(canonicalJson(identity)),
  };
}

function validateNativeDependencyReceipt(receipt, options = {}) {
  if (
    receipt === null ||
    typeof receipt !== "object" ||
    Array.isArray(receipt) ||
    receipt.schema !== RECEIPT_SCHEMA ||
    !/^[0-9a-f]{64}$/.test(receipt.identitySha256 ?? "") ||
    receipt.outputs?.schema !== OUTPUT_SCHEMA ||
    !Array.isArray(receipt.outputs?.files) ||
    !/^[0-9a-f]{64}$/.test(receipt.outputs?.identitySha256 ?? "")
  ) {
    throw new Error("native dependency receipt is invalid");
  }
  validateMathProfile(receipt.mathProfile, receipt.target);
  const outputIdentity = sha256Bytes(canonicalJson(receipt.outputs.files));
  if (outputIdentity !== receipt.outputs.identitySha256) {
    throw new Error("native dependency output receipt identity is invalid");
  }
  const identity = { ...receipt };
  delete identity.identitySha256;
  if (sha256Bytes(canonicalJson(identity)) !== receipt.identitySha256) {
    throw new Error("native dependency receipt identity is invalid");
  }
  if (options.expectation !== undefined) {
    const actualDeclaration = { ...identity };
    delete actualDeclaration.outputs;
    const expectedDeclaration = nativeDependencyExpectation(options.expectation);
    if (canonicalJson(actualDeclaration) !== canonicalJson(expectedDeclaration)) {
      throw new Error("native dependency receipt does not match the selected build");
    }
  }
  if (options.prefix !== undefined) {
    const observed = outputTree(options.prefix, {
      exclude: options.stampPath ? [options.stampPath] : [],
    });
    if (canonicalJson(observed) !== canonicalJson(receipt.outputs)) {
      throw new Error("native dependency installed output does not match its receipt");
    }
  }
  return receipt;
}

function readNativeDependencyReceipt(stampPath, options = {}) {
  if (!existsSync(stampPath)) return null;
  try {
    const receipt = JSON.parse(readFileSync(stampPath, "utf8"));
    return validateNativeDependencyReceipt(receipt, {
      ...options,
      stampPath,
    });
  } catch {
    return null;
  }
}

function writeNativeDependencyReceipt(stampPath, expectation, prefix) {
  const receipt = createNativeDependencyReceipt(expectation, prefix, stampPath);
  mkdirSync(dirname(stampPath), { recursive: true });
  const temporary = `${stampPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {
      flag: "wx",
    });
    renameSync(temporary, stampPath);
  } finally {
    rmSync(temporary, { force: true });
  }
  return receipt;
}

module.exports = {
  OUTPUT_SCHEMA,
  RECEIPT_SCHEMA,
  canonicalJson,
  commandIdentity,
  createNativeDependencyReceipt,
  nativeDependencyExpectation,
  outputTree,
  readNativeDependencyReceipt,
  validateNativeDependencyReceipt,
  writeNativeDependencyReceipt,
};
