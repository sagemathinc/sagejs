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
const SEA_BINDINGS_SCHEMA = "sagejs.sea-native-dependency-bindings-v1";
const SEA_NATIVE_DEPENDENCIES = Object.freeze({
  igraph: Object.freeze({
    assets: Object.freeze([
      "native/sagejs_graph.node",
      "native/sagejs_igraph_ffi.node",
      "native/sagejs_igraph_ffi_manifest.json",
    ]),
    package: "igraph",
    receiptAsset: "native/dependencies/igraph-receipt.json",
  }),
  m4ri: Object.freeze({
    assets: Object.freeze([
      "native/sagejs_m4ri_ffi.node",
      "native/sagejs_m4ri_ffi_manifest.json",
    ]),
    package: "m4ri",
    receiptAsset: "native/dependencies/m4ri-receipt.json",
  }),
});

function exactKeys(value, keys) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value) {
  return JSON.stringify(stableJson(value));
}

function seaNativeDependencyDefinitions(platform) {
  return Object.entries(SEA_NATIVE_DEPENDENCIES)
    .filter(([id]) => !(id === "m4ri" && platform === "win32"))
    .map(([id, definition]) => ({ id, ...definition }));
}

function commandIdentity(command, arguments_ = ["--version"], environment = process.env) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    return {
      arguments: arguments_,
      command,
      error: result.error.code || result.error.message,
      status: null,
    };
  }
  return {
    arguments: arguments_,
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
    !exactKeys(receipt, [
      "build",
      "capability",
      "dependency",
      "identitySha256",
      "interface",
      "mathProfile",
      "outputs",
      "package",
      "schema",
      "target",
      "toolchain",
    ]) ||
    receipt.schema !== RECEIPT_SCHEMA ||
    !/^[0-9a-f]{64}$/.test(receipt.identitySha256 ?? "") ||
    typeof receipt.capability !== "boolean" ||
    !exactKeys(receipt.dependency, ["name", "sha256", "version"]) ||
    typeof receipt.dependency.name !== "string" ||
    receipt.dependency.name.length === 0 ||
    typeof receipt.dependency.version !== "string" ||
    receipt.dependency.version.length === 0 ||
    !/^[0-9a-f]{64}$/.test(receipt.dependency.sha256 ?? "") ||
    !/^[a-z0-9][a-z0-9-]*$/.test(receipt.package ?? "") ||
    !exactKeys(receipt.target, [
      "arch",
      "deployment",
      "endianness",
      "platform",
      "wordBits",
    ]) ||
    receipt.outputs?.schema !== OUTPUT_SCHEMA ||
    !exactKeys(receipt.outputs, ["files", "identitySha256", "schema"]) ||
    !Array.isArray(receipt.outputs?.files) ||
    !/^[0-9a-f]{64}$/.test(receipt.outputs?.identitySha256 ?? "")
  ) {
    throw new Error("native dependency receipt is invalid");
  }
  const outputPaths = new Set();
  for (const file of receipt.outputs.files) {
    const ordinary = file?.type === "file" &&
      exactKeys(file, ["path", "sha256", "size", "type"]) &&
      /^[0-9a-f]{64}$/.test(file.sha256 ?? "") &&
      Number.isSafeInteger(file.size) &&
      file.size >= 0;
    const symlink = file?.type === "symlink" &&
      exactKeys(file, ["path", "target", "type"]) &&
      typeof file.target === "string" &&
      file.target.length > 0 &&
      !file.target.startsWith("/") &&
      !/^[A-Za-z]:[\\/]/.test(file.target);
    const pathValid = typeof file?.path === "string" &&
      file.path.length > 0 &&
      !file.path.startsWith("/") &&
      !file.path.includes("\\") &&
      !file.path.split("/").some((part) =>
        part === "" || part === "." || part === "..");
    if (
      !pathValid ||
      (!ordinary && !symlink) ||
      outputPaths.has(file.path)
    ) {
      throw new Error("native dependency output receipt is invalid");
    }
    outputPaths.add(file.path);
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

function validateSeaNativeDependencyReceipt(receipt, definition, options) {
  validateNativeDependencyReceipt(receipt);
  if (
    receipt.capability !== true ||
    receipt.package !== definition.package ||
    canonicalJson(receipt.mathProfile) !== canonicalJson(options.mathProfile) ||
    receipt.target.platform !== options.target.platform ||
    receipt.target.arch !== options.target.arch ||
    receipt.target.endianness !== options.target.endianness ||
    receipt.target.wordBits !== options.target.wordBits
  ) {
    throw new Error(
      `${definition.id} native dependency receipt does not match the SEA target`,
    );
  }
  return receipt;
}

function createSeaNativeDependencyBindings(options) {
  const bindings = {};
  for (const definition of seaNativeDependencyDefinitions(options.target.platform)) {
    const filename = options.assets[definition.receiptAsset];
    if (typeof filename !== "string" || !existsSync(filename)) {
      throw new Error(
        `mathematics SEA omitted ${definition.receiptAsset}`,
      );
    }
    for (const asset of definition.assets) {
      if (typeof options.assets[asset] !== "string") {
        throw new Error(
          `${definition.id} dependency receipt does not cover missing SEA asset ${asset}`,
        );
      }
    }
    let receipt;
    try {
      receipt = JSON.parse(readFileSync(filename, "utf8"));
      validateSeaNativeDependencyReceipt(receipt, definition, options);
    } catch (error) {
      throw new Error(
        `${definition.id} SEA dependency receipt is invalid: ${error.message}`,
        { cause: error },
      );
    }
    bindings[definition.id] = {
      assets: [...definition.assets],
      package: definition.package,
      receiptAsset: definition.receiptAsset,
      receiptIdentitySha256: receipt.identitySha256,
    };
  }
  return {
    bindings,
    schema: SEA_BINDINGS_SCHEMA,
  };
}

function validateSeaNativeDependencyBindings(declaration, options) {
  const definitions = seaNativeDependencyDefinitions(options.target.platform);
  if (
    !exactKeys(declaration, ["bindings", "schema"]) ||
    declaration.schema !== SEA_BINDINGS_SCHEMA ||
    !exactKeys(
      declaration.bindings,
      definitions.map(({ id }) => id),
    )
  ) {
    throw new Error("SEA native dependency binding declaration is invalid");
  }
  const binaryLabels = options.binaryLabels === undefined
    ? null
    : new Set(options.binaryLabels);
  for (const definition of definitions) {
    const binding = declaration.bindings[definition.id];
    if (
      !exactKeys(binding, [
        "assets",
        "package",
        "receiptAsset",
        "receiptIdentitySha256",
      ]) ||
      canonicalJson(binding.assets) !== canonicalJson(definition.assets) ||
      binding.package !== definition.package ||
      binding.receiptAsset !== definition.receiptAsset ||
      !/^[0-9a-f]{64}$/.test(binding.receiptIdentitySha256 ?? "")
    ) {
      throw new Error(`${definition.id} SEA dependency binding is invalid`);
    }
    for (const asset of [...definition.assets, definition.receiptAsset]) {
      if (!options.assets.has(asset)) {
        throw new Error(`${definition.id} SEA dependency asset is missing: ${asset}`);
      }
    }
    if (
      binaryLabels !== null &&
      definition.assets.some((asset) =>
        asset.endsWith(".node") && !binaryLabels.has(asset))
    ) {
      throw new Error(
        `${definition.id} SEA dependency addon is absent from the binary receipt`,
      );
    }
    const bytes = options.bytes(definition.receiptAsset);
    if (bytes === null) {
      throw new Error(`${definition.id} SEA dependency receipt bytes are missing`);
    }
    let receipt;
    try {
      receipt = JSON.parse(Buffer.from(bytes).toString("utf8"));
      validateSeaNativeDependencyReceipt(receipt, definition, options);
    } catch (error) {
      throw new Error(
        `${definition.id} embedded dependency receipt is invalid: ${error.message}`,
        { cause: error },
      );
    }
    if (receipt.identitySha256 !== binding.receiptIdentitySha256) {
      throw new Error(
        `${definition.id} embedded dependency receipt identity does not match its binding`,
      );
    }
  }
  return declaration;
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
  SEA_BINDINGS_SCHEMA,
  SEA_NATIVE_DEPENDENCIES,
  canonicalJson,
  commandIdentity,
  createSeaNativeDependencyBindings,
  createNativeDependencyReceipt,
  nativeDependencyExpectation,
  outputTree,
  readNativeDependencyReceipt,
  seaNativeDependencyDefinitions,
  validateNativeDependencyReceipt,
  validateSeaNativeDependencyBindings,
  writeNativeDependencyReceipt,
};
