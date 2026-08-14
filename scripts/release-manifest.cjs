#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  closeSync,
  constants: fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  linkSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readlinkSync,
  readSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { execFileSync } = require("node:child_process");
const {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} = require("node:path");

const BUILD_MANIFEST_SCHEMA = "sagejs.release-build-manifest-v1";
const MANIFEST_SCHEMA = "sagejs.release-artifact-manifest-v2";
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const GIT_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
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

function serialize(value) {
  return `${JSON.stringify(stableJson(value), null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !(key in value));
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length) throw new Error(`${label} is missing ${missing.join(", ")}`);
  if (unexpected.length) {
    throw new Error(`${label} has unexpected ${unexpected.join(", ")}`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a nonempty string`);
  }
}

function assertJson(value, label) {
  const visit = (item) => {
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    ) return;
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

function normalizeHash(value, label) {
  assertString(value, label);
  if (!HASH_PATTERN.test(value)) throw new Error(`${label} must be SHA-256`);
  return value;
}

function normalizeGit(value, label) {
  assertString(value, label);
  if (!GIT_PATTERN.test(value)) {
    throw new Error(`${label} must be a full Git object id`);
  }
  return value;
}

function portablePath(base, filename) {
  const root = directoryRealpath(base, "artifact manifest root");
  const canonical = realpathSync.native(resolve(filename));
  const path = relative(root, canonical);
  if (!path || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error(`artifact ${filename} must be below manifest directory ${base}`);
  }
  return path.replaceAll("\\", "/");
}

function validatePortablePath(path, label) {
  assertString(path, label);
  if (
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) throw new Error(`${label} must be a normalized relative portable path`);
}

function samePath(left, right) {
  left = resolve(left);
  right = resolve(right);
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function directoryRealpath(directory, label) {
  const absolute = resolve(directory);
  const information = lstatSync(absolute);
  if (!information.isDirectory() || information.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory, not a symlink or reparse point`);
  }
  // macOS exposes temporary directories lexically below /var while the same
  // system-owned tree canonicalizes below /private/var. Accept aliases in the
  // ancestors of the declared root, then enforce descendant containment
  // against this canonical root.
  return realpathSync.native(absolute);
}

function containedExistingFile(root, filename, label) {
  const realRoot = directoryRealpath(root, `${label} root`);
  const absolute = resolve(filename);
  const information = lstatSync(absolute, { bigint: true });
  if (!information.isFile() || information.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file: ${absolute}`);
  }
  const real = realpathSync.native(absolute);
  const canonical = relative(realRoot, real);
  if (
    !canonical ||
    canonical === ".." ||
    canonical.startsWith(`..${sep}`) ||
    isAbsolute(canonical)
  ) {
    throw new Error(`${label} escapes canonical root ${realRoot}`);
  }
  return { absolute, information, real, realRoot };
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function hashRegularFile(root, filename, label) {
  const before = containedExistingFile(root, filename, label);
  const nofollow = fsConstants.O_NOFOLLOW || 0;
  const fd = openSync(before.absolute, fsConstants.O_RDONLY | nofollow);
  try {
    const openedBefore = fstatSync(fd, { bigint: true });
    if (!openedBefore.isFile() || !sameFile(before.information, openedBefore)) {
      throw new Error(`${label} changed before hashing`);
    }
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytes = 0;
    while (true) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      bytes += count;
      digest.update(buffer.subarray(0, count));
    }
    const openedAfter = fstatSync(fd, { bigint: true });
    if (
      !sameFile(openedBefore, openedAfter) ||
      openedBefore.size !== openedAfter.size ||
      openedBefore.mtimeNs !== openedAfter.mtimeNs ||
      openedBefore.ctimeNs !== openedAfter.ctimeNs ||
      BigInt(bytes) !== openedAfter.size
    ) throw new Error(`${label} changed while hashing`);
    // This closes the ordinary substitution windows around open(2): the same
    // descriptor is inspected before and after streaming, then the pathname is
    // matched back to that descriptor. It cannot make a hostile writable file
    // immutable while reading it; release assembly must therefore run in a
    // trusted build directory whose producers have stopped.
    const pathnameAfter = lstatSync(before.absolute, { bigint: true });
    if (
      pathnameAfter.isSymbolicLink() ||
      !pathnameAfter.isFile() ||
      !sameFile(openedAfter, pathnameAfter) ||
      pathnameAfter.size !== openedAfter.size ||
      pathnameAfter.mtimeNs !== openedAfter.mtimeNs ||
      pathnameAfter.ctimeNs !== openedAfter.ctimeNs ||
      !samePath(realpathSync.native(before.absolute), before.real)
    ) throw new Error(`${label} changed after hashing`);
    const size = Number(openedAfter.size);
    if (!Number.isSafeInteger(size)) throw new Error(`${label} is too large to manifest safely`);
    return { sha256: digest.digest("hex"), size };
  } finally {
    closeSync(fd);
  }
}

function validateTarget(target) {
  assertKeys(
    target,
    ["arch", "endianness", "libc", "nodeAbi", "nodeNapi", "platform", "wordBits"],
    [],
    "build target",
  );
  for (const key of ["arch", "endianness", "nodeAbi", "nodeNapi", "platform"]) {
    assertString(target[key], `build target ${key}`);
  }
  if (target.wordBits !== null && !Number.isSafeInteger(target.wordBits)) {
    throw new Error("build target wordBits must be an integer or null");
  }
  if (target.libc !== null) {
    assertKeys(target.libc, ["family", "version"], [], "build target libc");
    assertString(target.libc.family, "build target libc family");
    if (target.libc.version !== null) assertString(target.libc.version, "libc version");
  }
  const supported = new Set([
    "darwin-arm64",
    "linux-arm64",
    "linux-x64",
    "win32-x64",
  ]);
  const targetName = `${target.platform}-${target.arch}`;
  if (!supported.has(targetName)) {
    throw new Error(`unsupported Sage.js release target ${targetName}`);
  }
  if (target.endianness !== "LE" || target.wordBits !== 64) {
    throw new Error(`${targetName} requires LE endianness and 64-bit words`);
  }
  if (target.platform === "linux" && target.libc?.family !== "glibc") {
    throw new Error(`${targetName} requires explicit glibc identity`);
  }
  if (target.platform !== "linux" && target.libc !== null) {
    throw new Error(`${targetName} must use null libc identity`);
  }
}

function validateSource(source) {
  assertKeys(
    source,
    ["commit", "contentSha256", "dirty", "kind", "tree"],
    [],
    "build source",
  );
  normalizeGit(source.commit, "build source commit");
  normalizeHash(source.contentSha256, "build source contentSha256");
  if (source.kind === "git-clean") {
    if (source.dirty !== false) throw new Error("clean Git source dirty must be false");
    normalizeGit(source.tree, "build source tree");
  } else if (source.kind === "git-dirty") {
    if (source.dirty !== true) throw new Error("dirty Git source dirty must be true");
    normalizeGit(source.tree, "build source tree");
  } else if (source.kind === "source-archive") {
    if (source.dirty !== null || source.tree !== null) {
      throw new Error("source archive dirty and tree states must be null");
    }
  } else throw new Error(`unsupported build source kind ${source.kind}`);
}

function buildManifestBody(buildManifest) {
  return stableJson({
    capabilities: buildManifest.capabilities,
    sagejsVersion: buildManifest.sagejsVersion,
    schema: buildManifest.schema,
    source: buildManifest.source,
    target: buildManifest.target,
    toolchain: buildManifest.toolchain,
  });
}

function validateBuildManifest(buildManifest) {
  assertKeys(
    buildManifest,
    ["capabilities", "identitySha256", "sagejsVersion", "schema", "source", "target", "toolchain"],
    [],
    "build manifest",
  );
  if (buildManifest.schema !== BUILD_MANIFEST_SCHEMA) {
    throw new Error(`unsupported build manifest schema ${buildManifest.schema}`);
  }
  assertString(buildManifest.sagejsVersion, "build manifest Sage.js version");
  assertPlainObject(buildManifest.capabilities, "build manifest capabilities");
  assertPlainObject(buildManifest.toolchain, "build manifest toolchain");
  assertJson(buildManifest.capabilities, "build manifest capabilities");
  assertJson(buildManifest.toolchain, "build manifest toolchain");
  validateSource(buildManifest.source);
  validateTarget(buildManifest.target);
  normalizeHash(buildManifest.identitySha256, "build manifest identitySha256");
  const expected = sha256(canonicalJson(buildManifestBody(buildManifest)));
  if (buildManifest.identitySha256 !== expected) {
    throw new Error("build manifest identity checksum mismatch");
  }
  return buildManifest;
}

function createBuildManifest(value) {
  assertPlainObject(value, "build manifest input");
  const body = stableJson({
    capabilities: value.capabilities,
    sagejsVersion: value.sagejsVersion,
    schema: BUILD_MANIFEST_SCHEMA,
    source: value.source,
    target: value.target,
    toolchain: value.toolchain,
  });
  return validateBuildManifest({
    ...body,
    identitySha256: sha256(canonicalJson(body)),
  });
}

function parseCanonical(filename, validator, label) {
  filename = resolve(filename);
  const canonicalParent = directoryRealpath(dirname(filename), `${label} parent`);
  const canonicalFilename = join(canonicalParent, basename(filename));
  const before = lstatSync(filename, { bigint: true });
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    !samePath(realpathSync.native(filename), canonicalFilename)
  ) {
    throw new Error(`${label} must be a regular file without symlink or reparse parents`);
  }
  const fd = openSync(filename, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  let contents;
  try {
    const openedBefore = fstatSync(fd, { bigint: true });
    if (!sameFile(before, openedBefore)) throw new Error(`${label} changed before reading`);
    contents = readFileSync(fd, "utf8");
    const openedAfter = fstatSync(fd, { bigint: true });
    const pathnameAfter = lstatSync(filename, { bigint: true });
    if (
      !sameFile(openedBefore, openedAfter) ||
      openedBefore.size !== openedAfter.size ||
      openedBefore.mtimeNs !== openedAfter.mtimeNs ||
      openedBefore.ctimeNs !== openedAfter.ctimeNs ||
      !sameFile(openedAfter, pathnameAfter) ||
      pathnameAfter.size !== openedAfter.size ||
      pathnameAfter.mtimeNs !== openedAfter.mtimeNs ||
      pathnameAfter.ctimeNs !== openedAfter.ctimeNs ||
      !samePath(realpathSync.native(filename), canonicalFilename)
    ) throw new Error(`${label} changed while reading`);
  } finally {
    closeSync(fd);
  }
  let value;
  try {
    value = JSON.parse(contents);
  } catch (error) {
    throw new Error(`cannot parse ${label} ${filename}: ${error.message || error}`);
  }
  validator(value);
  if (contents !== serialize(value)) {
    throw new Error(`${label} ${filename} is not in canonical generated form`);
  }
  return value;
}

function gitOutput(root, arguments_) {
  return execFileSync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitSourceIdentity(root, options = {}) {
  root = directoryRealpath(root, "Git source root");
  const topLevel = resolve(gitOutput(root, ["rev-parse", "--show-toplevel"]).trim());
  if (!samePath(root, topLevel)) {
    throw new Error(`Git source root must be the repository top level ${topLevel}`);
  }
  const commit = normalizeGit(gitOutput(root, ["rev-parse", "HEAD"]).trim(), "commit");
  const tree = normalizeGit(gitOutput(root, ["rev-parse", "HEAD^{tree}"]).trim(), "tree");
  const status = gitOutput(root, ["status", "--porcelain=v1", "--untracked-files=normal"]);
  const dirty = status.length > 0;
  if (dirty && !options.allowDirty) throw new Error("release build source is dirty");
  let contentSha256;
  if (dirty) {
    const digestDirty = () => {
      const trackedPatch = gitOutput(root, [
        "diff",
        "--binary",
        "--no-ext-diff",
        "--no-textconv",
        "HEAD",
        "--",
        ".",
      ]);
      const untracked = gitOutput(root, [
        "ls-files", "--others", "--exclude-standard", "-z",
      ]).split("\0").filter(Boolean).sort();
      const digest = createHash("sha256");
      digest.update("sagejs.git-dirty-source-v1\0");
      digest.update(commit);
      digest.update("\0");
      digest.update(trackedPatch);
      for (const path of untracked) {
        const filename = join(root, path);
        const information = lstatSync(filename, { bigint: true });
        const portable = path.replaceAll("\\", "/");
        let contentHash;
        let mode;
        let size;
        if (information.isFile() && !information.isSymbolicLink()) {
          const artifact = hashRegularFile(root, filename, `untracked source ${path}`);
          contentHash = artifact.sha256;
          mode = information.mode & 0o111n ? "100755" : "100644";
          size = artifact.size;
        } else if (information.isSymbolicLink()) {
          const lexicalParent = dirname(resolve(filename));
          if (!samePath(realpathSync.native(lexicalParent), lexicalParent)) {
            throw new Error(`untracked source ${path} has a symlinked parent`);
          }
          const target = readlinkSync(filename, { encoding: "buffer" });
          contentHash = sha256(target);
          mode = "120000";
          size = target.length;
          const after = lstatSync(filename, { bigint: true });
          if (
            !after.isSymbolicLink() ||
            !sameFile(information, after) ||
            information.mtimeNs !== after.mtimeNs ||
            information.ctimeNs !== after.ctimeNs
          ) throw new Error(`untracked source ${path} changed while hashing`);
        } else {
          throw new Error(`unsupported untracked source type ${path}`);
        }
        digest.update("\0");
        digest.update(portable);
        digest.update("\0");
        digest.update(mode);
        digest.update("\0");
        digest.update(contentHash);
        digest.update("\0");
        digest.update(String(size));
      }
      return digest.digest("hex");
    };
    contentSha256 = digestDirty();
    if (digestDirty() !== contentSha256) {
      throw new Error("dirty release source changed while recording identity");
    }
  } else {
    contentSha256 = sha256(`sagejs.git-tree-v1\0${tree}`);
  }
  const statusAfter = gitOutput(root, ["status", "--porcelain=v1", "--untracked-files=normal"]);
  if (statusAfter !== status) {
    throw new Error("release source changed while recording identity");
  }
  return { commit, contentSha256, dirty, kind: dirty ? "git-dirty" : "git-clean", tree };
}

function validateArtifact(artifact, label) {
  assertKeys(artifact, ["kind", "path", "sha256", "size"], [], label);
  assertString(artifact.kind, `${label} kind`);
  if (!KIND_PATTERN.test(artifact.kind)) throw new Error(`${label} kind is invalid`);
  validatePortablePath(artifact.path, `${label} path`);
  normalizeHash(artifact.sha256, `${label} sha256`);
  if (!Number.isSafeInteger(artifact.size) || artifact.size < 0) {
    throw new Error(`${label} size must be a nonnegative safe integer`);
  }
}

function releaseIdentity(manifest) {
  return stableJson({
    artifacts: manifest.artifacts,
    buildManifestIdentitySha256: manifest.buildManifest.identitySha256,
    sagejsVersion: manifest.buildManifest.sagejsVersion,
    schema: manifest.schema,
  });
}

function manifestBody(manifest) {
  return stableJson({
    artifacts: manifest.artifacts,
    buildManifest: manifest.buildManifest,
    packagingHostObservation: manifest.packagingHostObservation,
    schema: manifest.schema,
  });
}

function validateManifest(manifest) {
  assertKeys(
    manifest,
    ["artifacts", "buildManifest", "integrity", "packagingHostObservation", "schema"],
    [],
    "manifest",
  );
  if (manifest.schema !== MANIFEST_SCHEMA) {
    throw new Error(`unsupported manifest schema ${manifest.schema}`);
  }
  validateBuildManifest(manifest.buildManifest);
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    throw new Error("manifest must contain at least one artifact");
  }
  const paths = new Set();
  for (const [index, artifact] of manifest.artifacts.entries()) {
    validateArtifact(artifact, `artifact ${index}`);
    if (paths.has(artifact.path)) throw new Error(`duplicate artifact ${artifact.path}`);
    paths.add(artifact.path);
  }
  if (manifest.packagingHostObservation !== null) {
    assertPlainObject(manifest.packagingHostObservation, "packaging host observation");
    assertJson(manifest.packagingHostObservation, "packaging host observation");
  }
  assertKeys(
    manifest.integrity,
    ["documentBodySha256", "releaseIdentitySha256"],
    [],
    "manifest integrity",
  );
  const releaseHash = sha256(canonicalJson(releaseIdentity(manifest)));
  if (manifest.integrity.releaseIdentitySha256 !== releaseHash) {
    throw new Error("release identity checksum mismatch");
  }
  const bodyHash = sha256(canonicalJson(manifestBody(manifest)));
  if (manifest.integrity.documentBodySha256 !== bodyHash) {
    throw new Error("manifest document body checksum mismatch");
  }
  return manifest;
}

function outputDirectory(filename) {
  const directory = dirname(resolve(filename));
  return directoryRealpath(directory, "manifest output directory");
}

function outputSafety(filename, artifactFiles = []) {
  filename = resolve(filename);
  const directory = outputDirectory(filename);
  if (!samePath(directoryRealpath(dirname(filename), "manifest output parent"), directory)) {
    throw new Error("manifest output parent changed while checking safety");
  }
  for (const artifact of artifactFiles) {
    if (samePath(artifact, filename)) throw new Error("manifest output cannot be an artifact");
  }
  if (existsSync(filename)) {
    const information = lstatSync(filename);
    if (information.isSymbolicLink() || !information.isFile()) {
      throw new Error("manifest output must not be a symlink, reparse point, or directory");
    }
    if (!samePath(realpathSync.native(filename), join(directory, basename(filename)))) {
      throw new Error("manifest output resolves through a symlink or reparse point");
    }
    throw new Error("manifest output already exists; refusing non-atomic replacement");
  }
  return { directory, filename };
}

function atomicWrite(filename, value, artifactFiles = []) {
  const safe = outputSafety(filename, artifactFiles);
  const temporaryDirectory = mkdtempSync(join(safe.directory, ".sagejs-manifest-"));
  const temporary = join(temporaryDirectory, basename(safe.filename));
  try {
    writeFileSync(temporary, serialize(value), { flag: "wx", mode: 0o644 });
    outputSafety(safe.filename, artifactFiles);
    // A same-filesystem hard link provides atomic publication only while the
    // destination is absent. Unlike rename, it cannot overwrite a concurrent
    // publisher that wins after outputSafety. The temporary inode remains
    // private until the link succeeds and is removed in the finally block.
    linkSync(temporary, safe.filename);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function artifactFromInput(entry, manifestDirectory) {
  assertPlainObject(entry, "artifact input");
  assertString(entry.kind, "artifact kind");
  if (!KIND_PATTERN.test(entry.kind)) throw new Error(`invalid artifact kind ${entry.kind}`);
  assertString(entry.file, "artifact filename");
  const path = portablePath(manifestDirectory, entry.file);
  return { kind: entry.kind, path, ...hashRegularFile(manifestDirectory, entry.file, `artifact ${path}`) };
}

function createManifest(options) {
  assertPlainObject(options, "manifest options");
  const buildManifest = validateBuildManifest(structuredClone(options.buildManifest));
  const manifestDirectory = directoryRealpath(options.manifestDirectory, "manifest directory");
  const artifacts = (options.artifacts || []).map(
    (entry) => artifactFromInput(entry, manifestDirectory),
  );
  if (!artifacts.length) throw new Error("at least one artifact is required");
  artifacts.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  if (new Set(artifacts.map(({ path }) => path)).size !== artifacts.length) {
    throw new Error("artifact paths must be unique");
  }
  const draft = stableJson({
    artifacts,
    buildManifest,
    packagingHostObservation: options.packagingHostObservation ?? null,
    schema: MANIFEST_SCHEMA,
  });
  return validateManifest({
    ...draft,
    integrity: {
      documentBodySha256: sha256(canonicalJson(draft)),
      releaseIdentitySha256: sha256(canonicalJson(releaseIdentity(draft))),
    },
  });
}

function readBuildManifest(filename) {
  return parseCanonical(resolve(filename), validateBuildManifest, "build manifest");
}

function readManifest(filename) {
  return parseCanonical(resolve(filename), validateManifest, "release manifest");
}

function verifyManifest(manifest, options = {}) {
  validateManifest(manifest);
  const directory = directoryRealpath(options.manifestDirectory, "manifest directory");
  for (const artifact of manifest.artifacts) {
    const observed = hashRegularFile(
      directory,
      join(directory, ...artifact.path.split("/")),
      `artifact ${artifact.path}`,
    );
    if (observed.size !== artifact.size) throw new Error(`artifact size mismatch for ${artifact.path}`);
    if (observed.sha256 !== artifact.sha256) throw new Error(`artifact SHA-256 mismatch for ${artifact.path}`);
  }
  if (options.buildManifest) {
    validateBuildManifest(options.buildManifest);
    if (canonicalJson(options.buildManifest) !== canonicalJson(manifest.buildManifest)) {
      throw new Error("build manifest mismatch");
    }
  }
  return { artifacts: manifest.artifacts.length, releaseIdentitySha256: manifest.integrity.releaseIdentitySha256 };
}

function parseArguments(arguments_) {
  const [command, ...tokens] = arguments_;
  const values = { artifact: [] };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const name = token.slice(2);
    const value = tokens[++index];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${token}`);
    if (name === "artifact") values.artifact.push(value);
    else if (name in values) throw new Error(`duplicate option ${token}`);
    else values[name] = value;
  }
  return { command, values };
}

function parseArtifact(value) {
  const at = value.indexOf("=");
  if (at <= 0 || at === value.length - 1) throw new Error("artifact must be KIND=FILE");
  return { kind: value.slice(0, at), file: resolve(value.slice(at + 1)) };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/release-manifest.cjs create --output FILE --build-manifest FILE \\",
    "    --artifact KIND=FILE [--artifact KIND=FILE ...]",
    "  node scripts/release-manifest.cjs verify --manifest FILE [--build-manifest FILE]",
  ].join("\n");
}

function runCli(arguments_) {
  const { command, values } = parseArguments(arguments_);
  if (command === "create") {
    const allowed = new Set(["artifact", "build-manifest", "output"]);
    const unexpected = Object.keys(values).filter((key) => !allowed.has(key));
    if (unexpected.length) throw new Error(`unexpected create options: ${unexpected.join(", ")}`);
    if (!values.output || !values["build-manifest"]) {
      throw new Error("create requires --output and --build-manifest");
    }
    const output = resolve(values.output);
    const artifacts = values.artifact.map(parseArtifact);
    outputSafety(output, artifacts.map(({ file }) => file));
    const manifest = createManifest({
      artifacts,
      buildManifest: readBuildManifest(values["build-manifest"]),
      manifestDirectory: dirname(output),
      packagingHostObservation: null,
    });
    atomicWrite(output, manifest, artifacts.map(({ file }) => file));
    console.log(`Created ${output}; release identity ${manifest.integrity.releaseIdentitySha256}.`);
    return manifest;
  }
  if (command === "verify") {
    const allowed = new Set(["artifact", "build-manifest", "manifest"]);
    const unexpected = Object.keys(values).filter((key) => !allowed.has(key));
    if (unexpected.length || values.artifact.length) throw new Error("unexpected verify option");
    if (!values.manifest) throw new Error("verify requires --manifest");
    const filename = resolve(values.manifest);
    const result = verifyManifest(readManifest(filename), {
      buildManifest: values["build-manifest"] ? readBuildManifest(values["build-manifest"]) : undefined,
      manifestDirectory: dirname(filename),
    });
    console.log(`Verified ${result.artifacts} artifact(s); release identity ${result.releaseIdentitySha256}.`);
    return result;
  }
  throw new Error(usage());
}

if (require.main === module) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  BUILD_MANIFEST_SCHEMA,
  MANIFEST_SCHEMA,
  atomicWrite,
  canonicalJson,
  createBuildManifest,
  createManifest,
  gitSourceIdentity,
  hashRegularFile,
  readBuildManifest,
  readManifest,
  runCli,
  serialize,
  validateBuildManifest,
  validateManifest,
  verifyManifest,
};
