#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  createReadStream,
  lstatSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { execFileSync } = require("node:child_process");
const { arch, endianness, platform } = require("node:os");
const {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} = require("node:path");

const {
  nativeMathBuildProfile,
} = require("./native-math-profile.cjs");

const SCHEMA = "sagejs.release-artifact-manifest-v1";
const GENERATOR = "scripts/release-manifest.cjs";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const KIND_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

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

function serializeManifest(manifest) {
  return `${JSON.stringify(stableJson(manifest), null, 2)}\n`;
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filename) {
  return new Promise((accept, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filename);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => accept(hash.digest("hex")));
  });
}

function assertPlainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a JSON object`);
  }
}

function assertKeys(value, required, optional, label) {
  assertPlainObject(value, label);
  const keys = Object.keys(value).sort();
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !(key in value));
  const unexpected = keys.filter((key) => !allowed.has(key));
  if (missing.length > 0) {
    throw new Error(`${label} is missing ${missing.join(", ")}`);
  }
  if (unexpected.length > 0) {
    throw new Error(`${label} has unexpected ${unexpected.join(", ")}`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a nonempty string`);
  }
}

function assertJsonValue(value, label) {
  const visit = (item) => {
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    ) {
      return;
    }
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    if (item !== null && typeof item === "object") {
      if (Object.getPrototypeOf(item) !== Object.prototype) throw new Error();
      for (const child of Object.values(item)) visit(child);
      return;
    }
    throw new Error();
  };
  try {
    visit(value);
  } catch {
    throw new Error(`${label} must contain only finite JSON values`);
  }
}

function portableRelativePath(base, filename) {
  const absoluteBase = resolve(base);
  const absoluteFilename = resolve(filename);
  const path = relative(absoluteBase, absoluteFilename);
  if (
    path.length === 0 ||
    path === ".." ||
    path.startsWith(`..${sep}`) ||
    isAbsolute(path)
  ) {
    throw new Error(
      `release artifact ${absoluteFilename} must be below manifest directory ` +
        absoluteBase,
    );
  }
  return path.replaceAll("\\", "/");
}

function validateArtifactPath(path, label) {
  assertString(path, label);
  if (
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${label} must be a normalized relative portable path`);
  }
}

function gitOutput(root, arguments_) {
  return execFileSync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function normalizeCommit(value, label = "source commit") {
  assertString(value, label);
  const commit = value.toLowerCase();
  if (!COMMIT_PATTERN.test(commit)) {
    throw new Error(`${label} must be a full 40- or 64-digit Git object id`);
  }
  return commit;
}

function sourceIdentity(root, options = {}) {
  const sourceRoot = resolve(root);
  if (options.sourceArchive) {
    if (options.requireClean) {
      throw new Error(
        "source archives have unknown dirty state and cannot require a clean tree",
      );
    }
    return {
      commit: normalizeCommit(options.sourceCommit),
      dirty: null,
      kind: "source-archive",
      tree: null,
    };
  }
  let commit;
  let tree;
  let status;
  try {
    commit = normalizeCommit(gitOutput(sourceRoot, ["rev-parse", "HEAD"]));
    tree = normalizeCommit(
      gitOutput(sourceRoot, ["rev-parse", "HEAD^{tree}"]),
      "source tree",
    );
    status = gitOutput(sourceRoot, [
      "status",
      "--porcelain=v1",
      "--untracked-files=normal",
    ]);
  } catch (error) {
    throw new Error(
      `cannot inspect Git source at ${sourceRoot}; source archives require ` +
        `--source-archive and --source-commit: ${error.message || error}`,
    );
  }
  if (options.sourceCommit !== undefined) {
    const expected = normalizeCommit(options.sourceCommit);
    if (commit !== expected) {
      throw new Error(`source commit mismatch: expected ${expected}, got ${commit}`);
    }
  }
  const source = {
    commit,
    dirty: status.length > 0,
    kind: "git",
    tree,
  };
  if (options.requireClean && source.dirty) {
    throw new Error("release source is dirty");
  }
  return source;
}

function detectedLibc(targetPlatform) {
  if (targetPlatform !== "linux") return null;
  const report = process.report?.getReport?.();
  const version = report?.header?.glibcVersionRuntime;
  return version
    ? { family: "glibc", version: String(version) }
    : { family: "unknown", version: null };
}

function targetIdentity(options = {}) {
  const targetPlatform = options.platform || platform();
  const targetArch = options.arch || arch();
  const libc = options.libc === undefined
    ? detectedLibc(targetPlatform)
    : options.libc === null
      ? null
      : typeof options.libc === "string"
        ? { family: options.libc, version: options.libcVersion || null }
        : stableJson(options.libc);
  return stableJson({
    arch: targetArch,
    endianness: options.endianness || endianness(),
    libc,
    nodeAbi: String(options.nodeAbi || process.versions.modules || "unknown"),
    nodeNapi: String(options.nodeNapi || process.versions.napi || "unknown"),
    platform: targetPlatform,
    wordBits: options.wordBits || (["x64", "arm64"].includes(targetArch) ? 64 : null),
  });
}

function commandName(command) {
  return basename(String(command).replaceAll("\\", "/"));
}

function inspectBuild(options, target) {
  if (options.build !== undefined) {
    assertPlainObject(options.build, "build provenance");
    return stableJson(options.build);
  }
  const profile = nativeMathBuildProfile({
    arch: target.arch,
    environment: options.environment || process.env,
    platform: target.platform,
  });
  for (const compiler of Object.values(profile.compilers)) {
    compiler.command = commandName(compiler.command);
    compiler.version = compiler.version
      .split("\n")
      .filter((line) => !/^InstalledDir:\s*/.test(line))
      .join("\n");
  }
  // The native cache profile intentionally fingerprints the full compiler
  // command, including a possible installation path. A release manifest
  // instead fingerprints the normalized identity above so moving an otherwise
  // identical toolchain does not change its reproducible provenance.
  delete profile.fingerprint;
  profile.fingerprint = sha256Text(canonicalJson(profile));
  return stableJson({
    nativeMathProfile: profile,
    node: {
      modules: String(process.versions.modules || "unknown"),
      napi: String(process.versions.napi || "unknown"),
      version: process.version,
    },
  });
}

function creationProvenance(options, target) {
  const provenance = {
    build: inspectBuild(options, target),
    generator: {
      name: GENERATOR,
      schemaVersion: 1,
    },
  };
  const epochValue = options.sourceDateEpoch ?? options.environment?.SOURCE_DATE_EPOCH;
  if (epochValue !== undefined) {
    const epoch = Number(epochValue);
    if (!Number.isSafeInteger(epoch) || epoch < 0) {
      throw new Error("SOURCE_DATE_EPOCH must be a nonnegative safe integer");
    }
    provenance.createdAt = new Date(epoch * 1000).toISOString();
    provenance.sourceDateEpoch = epoch;
  }
  return stableJson(provenance);
}

async function artifactIdentity(entry, manifestDirectory) {
  assertPlainObject(entry, "artifact input");
  assertString(entry.kind, "artifact kind");
  if (!KIND_PATTERN.test(entry.kind)) {
    throw new Error(`invalid artifact kind ${JSON.stringify(entry.kind)}`);
  }
  assertString(entry.file, "artifact filename");
  const filename = resolve(entry.file);
  const information = lstatSync(filename);
  if (!information.isFile() || information.isSymbolicLink()) {
    throw new Error(`release artifact must be a regular non-symlink file: ${filename}`);
  }
  return {
    kind: entry.kind,
    path: portableRelativePath(manifestDirectory, filename),
    sha256: await sha256File(filename),
    size: information.size,
  };
}

function manifestBody(schema, identity, provenance) {
  return stableJson({ identity, provenance, schema });
}

async function createManifest(options) {
  assertPlainObject(options, "manifest options");
  const root = resolve(options.root || resolve(__dirname, ".."));
  const manifestDirectory = resolve(options.manifestDirectory || root);
  const packageManifest = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  );
  assertString(packageManifest.version, "Sage.js package version");
  const target = targetIdentity(options.target);
  const artifacts = await Promise.all(
    (options.artifacts || []).map(
      (entry) => artifactIdentity(entry, manifestDirectory),
    ),
  );
  const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  artifacts.sort((left, right) =>
    compare(left.path, right.path) || compare(left.kind, right.kind),
  );
  if (artifacts.length === 0) throw new Error("at least one artifact is required");
  if (new Set(artifacts.map(({ path }) => path)).size !== artifacts.length) {
    throw new Error("each release artifact path must be unique");
  }
  const capabilities = options.capabilities || {};
  assertPlainObject(capabilities, "capabilities");
  assertJsonValue(capabilities, "capabilities");
  const identity = stableJson({
    artifacts,
    capabilities,
    sagejsVersion: packageManifest.version,
    source: sourceIdentity(root, options.source || {}),
    target,
  });
  const provenance = creationProvenance(
    {
      build: options.build,
      environment: options.environment || process.env,
      sourceDateEpoch: options.sourceDateEpoch,
    },
    target,
  );
  const body = manifestBody(SCHEMA, identity, provenance);
  return stableJson({
    ...body,
    integrity: {
      identitySha256: sha256Text(canonicalJson(identity)),
      manifestSha256: sha256Text(canonicalJson(body)),
    },
  });
}

function validateManifest(manifest) {
  assertKeys(
    manifest,
    ["schema", "identity", "integrity", "provenance"],
    [],
    "manifest",
  );
  if (manifest.schema !== SCHEMA) {
    throw new Error(`unsupported manifest schema ${JSON.stringify(manifest.schema)}`);
  }
  assertKeys(
    manifest.identity,
    ["artifacts", "capabilities", "sagejsVersion", "source", "target"],
    [],
    "manifest identity",
  );
  assertString(manifest.identity.sagejsVersion, "Sage.js version");
  assertPlainObject(manifest.identity.capabilities, "capabilities");
  assertJsonValue(manifest.identity.capabilities, "capabilities");
  const source = manifest.identity.source;
  assertKeys(source, ["commit", "dirty", "kind", "tree"], [], "source identity");
  normalizeCommit(source.commit);
  if (source.kind === "git") {
    if (typeof source.dirty !== "boolean") {
      throw new Error("Git source dirty state must be boolean");
    }
    normalizeCommit(source.tree, "source tree");
  } else if (source.kind === "source-archive") {
    if (source.dirty !== null || source.tree !== null) {
      throw new Error("source archives must use null dirty and tree states");
    }
  } else {
    throw new Error(`unsupported source kind ${JSON.stringify(source.kind)}`);
  }
  const target = manifest.identity.target;
  assertKeys(
    target,
    ["arch", "endianness", "libc", "nodeAbi", "nodeNapi", "platform", "wordBits"],
    [],
    "target identity",
  );
  for (const key of ["arch", "endianness", "nodeAbi", "nodeNapi", "platform"]) {
    assertString(target[key], `target ${key}`);
  }
  if (target.wordBits !== null && !Number.isSafeInteger(target.wordBits)) {
    throw new Error("target wordBits must be an integer or null");
  }
  if (target.libc !== null) {
    assertKeys(target.libc, ["family", "version"], [], "target libc");
    assertString(target.libc.family, "target libc family");
    if (target.libc.version !== null) {
      assertString(target.libc.version, "target libc version");
    }
  }
  if (!Array.isArray(manifest.identity.artifacts) || manifest.identity.artifacts.length === 0) {
    throw new Error("manifest must contain at least one artifact");
  }
  const artifactPaths = new Set();
  for (const [index, artifact] of manifest.identity.artifacts.entries()) {
    const label = `artifact ${index}`;
    assertKeys(artifact, ["kind", "path", "sha256", "size"], [], label);
    assertString(artifact.kind, `${label} kind`);
    if (!KIND_PATTERN.test(artifact.kind)) throw new Error(`${label} kind is invalid`);
    validateArtifactPath(artifact.path, `${label} path`);
    if (!SHA256_PATTERN.test(artifact.sha256)) {
      throw new Error(`${label} SHA-256 is invalid`);
    }
    if (!Number.isSafeInteger(artifact.size) || artifact.size < 0) {
      throw new Error(`${label} size must be a nonnegative safe integer`);
    }
    if (artifactPaths.has(artifact.path)) {
      throw new Error(`duplicate artifact path ${artifact.path}`);
    }
    artifactPaths.add(artifact.path);
  }
  assertKeys(manifest.integrity, ["identitySha256", "manifestSha256"], [], "integrity");
  for (const [key, value] of Object.entries(manifest.integrity)) {
    if (!SHA256_PATTERN.test(value)) throw new Error(`integrity ${key} is invalid`);
  }
  assertKeys(
    manifest.provenance,
    ["build", "generator"],
    ["createdAt", "sourceDateEpoch"],
    "provenance",
  );
  assertPlainObject(manifest.provenance.build, "build provenance");
  assertKeys(
    manifest.provenance.generator,
    ["name", "schemaVersion"],
    [],
    "manifest generator",
  );
  if (
    manifest.provenance.generator.name !== GENERATOR ||
    manifest.provenance.generator.schemaVersion !== 1
  ) {
    throw new Error("unrecognized manifest generator");
  }
  if ("sourceDateEpoch" in manifest.provenance) {
    const epoch = manifest.provenance.sourceDateEpoch;
    if (!Number.isSafeInteger(epoch) || epoch < 0) {
      throw new Error("sourceDateEpoch must be a nonnegative safe integer");
    }
    if (manifest.provenance.createdAt !== new Date(epoch * 1000).toISOString()) {
      throw new Error("createdAt does not match sourceDateEpoch");
    }
  } else if ("createdAt" in manifest.provenance) {
    throw new Error("createdAt requires sourceDateEpoch");
  }
  const expectedIdentity = sha256Text(canonicalJson(manifest.identity));
  if (manifest.integrity.identitySha256 !== expectedIdentity) {
    throw new Error("manifest identity checksum mismatch");
  }
  const expectedManifest = sha256Text(canonicalJson(manifestBody(
    manifest.schema,
    manifest.identity,
    manifest.provenance,
  )));
  if (manifest.integrity.manifestSha256 !== expectedManifest) {
    throw new Error("manifest checksum mismatch");
  }
  return manifest;
}

function readManifest(filename) {
  const contents = readFileSync(filename, "utf8");
  let manifest;
  try {
    manifest = JSON.parse(contents);
  } catch (error) {
    throw new Error(`cannot parse release manifest ${filename}: ${error.message || error}`);
  }
  validateManifest(manifest);
  if (contents !== serializeManifest(manifest)) {
    throw new Error(
      `release manifest ${filename} is not in canonical generated form`,
    );
  }
  return manifest;
}

function verifySource(manifestIdentity, root, options = {}) {
  const manifestSource = manifestIdentity.source;
  if (manifestSource.kind === "source-archive") {
    if (options.sourceCommit === undefined) {
      throw new Error(
        "source archive verification requires an independently supplied source commit",
      );
    }
    const packageManifest = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    );
    if (packageManifest.version !== manifestIdentity.sagejsVersion) {
      throw new Error(
        `source archive version mismatch: expected ${manifestIdentity.sagejsVersion}, ` +
          `got ${packageManifest.version}`,
      );
    }
  }
  const observed = sourceIdentity(root, {
    sourceArchive: manifestSource.kind === "source-archive",
    sourceCommit: options.sourceCommit,
  });
  if (canonicalJson(observed) !== canonicalJson(manifestSource)) {
    throw new Error(
      `source identity mismatch: expected ${canonicalJson(manifestSource)}, ` +
        `got ${canonicalJson(observed)}`,
    );
  }
}

async function verifyManifest(manifest, options = {}) {
  validateManifest(manifest);
  const manifestDirectory = resolve(options.manifestDirectory || ".");
  for (const artifact of manifest.identity.artifacts) {
    const filename = resolve(manifestDirectory, ...artifact.path.split("/"));
    const expectedPrefix = `${manifestDirectory}${sep}`;
    if (!filename.startsWith(expectedPrefix)) {
      throw new Error(`artifact escapes manifest directory: ${artifact.path}`);
    }
    let information;
    try {
      information = lstatSync(filename);
    } catch (error) {
      throw new Error(`missing artifact ${artifact.path}: ${error.message || error}`);
    }
    if (!information.isFile() || information.isSymbolicLink()) {
      throw new Error(`artifact is not a regular non-symlink file: ${artifact.path}`);
    }
    if (information.size !== artifact.size) {
      throw new Error(
        `artifact size mismatch for ${artifact.path}: expected ${artifact.size}, ` +
          `got ${information.size}`,
      );
    }
    const observedHash = await sha256File(filename);
    if (observedHash !== artifact.sha256) {
      throw new Error(`artifact SHA-256 mismatch for ${artifact.path}`);
    }
  }
  if (options.sourceRoot !== undefined) {
    verifySource(manifest.identity, options.sourceRoot, options);
  }
  if (
    options.capabilities !== undefined &&
    canonicalJson(options.capabilities) !== canonicalJson(manifest.identity.capabilities)
  ) {
    throw new Error("release capability mismatch");
  }
  return {
    artifacts: manifest.identity.artifacts.length,
    identitySha256: manifest.integrity.identitySha256,
  };
}

function parseArguments(arguments_) {
  const [command, ...tokens] = arguments_;
  if (!["create", "verify"].includes(command)) return { command };
  const values = { artifact: [] };
  const booleanOptions = new Set(["require-clean", "source-archive"]);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const name = token.slice(2);
    if (booleanOptions.has(name)) {
      values[name] = true;
      continue;
    }
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for ${token}`);
    }
    index += 1;
    if (name === "artifact") values.artifact.push(value);
    else if (name in values) throw new Error(`duplicate option ${token}`);
    else values[name] = value;
  }
  return { command, values };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/release-manifest.cjs create --output FILE \\",
    "    --artifact KIND=FILE [--artifact KIND=FILE ...] \\",
    "    [--capabilities FILE] [--source-root DIR] [--require-clean] \\",
    "    [--source-archive --source-commit HASH] [--platform OS] [--arch ARCH]",
    "  node scripts/release-manifest.cjs verify --manifest FILE \\",
    "    [--capabilities FILE] [--source-root DIR] [--source-commit HASH]",
  ].join("\n");
}

function readJsonFile(filename, label) {
  try {
    const value = JSON.parse(readFileSync(resolve(filename), "utf8"));
    assertPlainObject(value, label);
    return value;
  } catch (error) {
    throw new Error(`cannot read ${label} ${filename}: ${error.message || error}`);
  }
}

function parseArtifact(value) {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`artifact must have KIND=FILE form, got ${JSON.stringify(value)}`);
  }
  return { kind: value.slice(0, separator), file: resolve(value.slice(separator + 1)) };
}

async function runCli(arguments_) {
  const { command, values } = parseArguments(arguments_);
  if (command === "create") {
    const allowed = new Set([
      "arch",
      "artifact",
      "capabilities",
      "libc",
      "napi",
      "node-abi",
      "output",
      "platform",
      "require-clean",
      "source-archive",
      "source-commit",
      "source-root",
    ]);
    const unexpected = Object.keys(values).filter((name) => !allowed.has(name));
    if (unexpected.length > 0) {
      throw new Error(`unexpected create option(s): ${unexpected.join(", ")}`);
    }
    if (!values.output) throw new Error("create requires --output");
    const output = resolve(values.output);
    const sourceRoot = resolve(values["source-root"] || resolve(__dirname, ".."));
    const capabilities = values.capabilities
      ? readJsonFile(values.capabilities, "capabilities")
      : {};
    const manifest = await createManifest({
      artifacts: values.artifact.map(parseArtifact),
      capabilities,
      environment: process.env,
      manifestDirectory: dirname(output),
      root: sourceRoot,
      source: {
        requireClean: Boolean(values["require-clean"]),
        sourceArchive: Boolean(values["source-archive"]),
        sourceCommit: values["source-commit"],
      },
      target: {
        arch: values.arch,
        libc: values.libc,
        nodeAbi: values["node-abi"],
        nodeNapi: values.napi,
        platform: values.platform,
      },
    });
    writeFileSync(output, serializeManifest(manifest));
    console.log(
      `Created ${output} for ${manifest.identity.artifacts.length} artifact(s); ` +
        `identity ${manifest.integrity.identitySha256}.`,
    );
    return manifest;
  }
  if (command === "verify") {
    const allowed = new Set([
      "artifact",
      "capabilities",
      "manifest",
      "source-commit",
      "source-root",
    ]);
    const unexpected = Object.keys(values).filter((name) => !allowed.has(name));
    if (unexpected.length > 0) {
      throw new Error(`unexpected verify option(s): ${unexpected.join(", ")}`);
    }
    if (values.artifact.length > 0) {
      throw new Error("verify does not accept --artifact");
    }
    if (!values.manifest) throw new Error("verify requires --manifest");
    const filename = resolve(values.manifest);
    const manifest = readManifest(filename);
    const capabilities = values.capabilities
      ? readJsonFile(values.capabilities, "capabilities")
      : undefined;
    const result = await verifyManifest(manifest, {
      capabilities,
      manifestDirectory: dirname(filename),
      sourceCommit: values["source-commit"],
      sourceRoot: values["source-root"],
    });
    console.log(
      `Verified ${result.artifacts} artifact(s); identity ${result.identitySha256}.`,
    );
    return result;
  }
  throw new Error(usage());
}

if (require.main === module) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  SCHEMA,
  canonicalJson,
  createManifest,
  readManifest,
  runCli,
  serializeManifest,
  sourceIdentity,
  stableJson,
  validateManifest,
  verifyManifest,
};
