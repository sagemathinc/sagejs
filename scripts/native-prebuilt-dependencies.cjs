#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const schema = "sagejs.native-dependency-bundle-v1";
// The first catalog tag was accidentally published empty before this
// repository enabled the draft-first immutable-release flow.  Keep its value
// in the bundle identity so the already-built, verified archives retain their
// content keys, while downloads use the replacement immutable catalog.
const bundleSeries = "native-dependencies-1";
const catalogRelease = "native-dependencies-5";
const packages = Object.freeze(["flint", "fflas", "graph", "m4ri"]);
const supportedTargets = new Set([
  "linux-x64",
  "linux-arm64",
  "macos-x64",
  "macos-arm64",
  "windows-x64",
]);
const identityInputs = Object.freeze([
  "scripts/native-math-profile.cjs",
  "scripts/darwin-native.cjs",
  "packages/flint/patches",
  "packages/flint/scripts/build-deps.cjs",
  "packages/flint/scripts/eclib-source.cjs",
  "packages/flint/scripts/portable-smalljac",
  "packages/flint/scripts/triplets",
  "packages/flint/scripts/vcpkg-ports",
  "packages/flint/vcpkg.json",
  "packages/fflas/scripts/build-deps.cjs",
  "packages/fflas/include/sagejs/fflas_matrix_ffi.h",
  "packages/graph/scripts/build-deps.cjs",
  "packages/graph/include/sagejs/igraph_ffi.h",
  "packages/m4ri/scripts/build-deps.cjs",
  "packages/m4ri/include/sagejs/m4ri_matrix_ffi.h",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function platformName(platform = process.platform) {
  return platform === "darwin" ? "macos" : platform === "win32" ? "windows" : platform;
}

function targetName(platform = process.platform, arch = process.arch) {
  const target = `${platformName(platform)}-${arch}`;
  if (!supportedTargets.has(target)) {
    throw new Error(`no prebuilt native dependencies are defined for ${target}`);
  }
  return target;
}

function walkFiles(directory, base = directory) {
  if (!existsSync(directory)) return [];
  const result = [];
  const visit = (filename) => {
    const entry = lstatSync(filename);
    if (entry.isSymbolicLink()) {
      result.push({
        path: relative(base, filename).split(sep).join("/"),
        type: "symlink",
        target: readlinkSync(filename),
      });
      return;
    }
    if (entry.isDirectory()) {
      for (const name of readdirSync(filename).sort()) visit(join(filename, name));
      return;
    }
    if (!entry.isFile()) throw new Error(`unsupported bundle entry ${filename}`);
    result.push({
      path: relative(base, filename).split(sep).join("/"),
      sha256: sha256(readFileSync(filename)),
      size: entry.size,
      type: "file",
    });
  };
  visit(directory);
  return result;
}

function inputDigest(repositoryRoot = root) {
  const hash = createHash("sha256");
  for (const input of identityInputs) {
    const absolute = join(repositoryRoot, input);
    const entry = lstatSync(absolute);
    const files = entry.isDirectory()
      ? walkFiles(absolute).filter(({ type }) => type === "file")
      : [{ path: "", sha256: sha256(readFileSync(absolute)), type: "file" }];
    for (const file of files) {
      hash.update(`${input}/${file.path}\0${file.sha256}\0`);
    }
  }
  return hash.digest("hex");
}

function bundleIdentity(repositoryRoot = root, options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  return {
    deploymentTarget: platform === "darwin" ? "13.0" : null,
    inputDigest: inputDigest(repositoryRoot),
    profile: "portable",
    release: bundleSeries,
    schema,
    target: targetName(platform, arch),
  };
}

function bundleKey(repositoryRoot = root, options = {}) {
  return sha256(JSON.stringify(bundleIdentity(repositoryRoot, options)));
}

function assetName(repositoryRoot = root, options = {}) {
  const identity = bundleIdentity(repositoryRoot, options);
  return `sagejs-native-dependencies-${identity.target}-${bundleKey(repositoryRoot, options)}.tar.gz`;
}

function packageTargets(repositoryRoot = root, platform = process.platform) {
  const ordinary = (name) => join(repositoryRoot, "packages", name, ".native", "prefix");
  return {
    flint: platform === "win32"
      ? join(
        repositoryRoot,
        "packages/flint/.native/vcpkg-installed/x64-windows-static-md-release",
      )
      : ordinary("flint"),
    fflas: ordinary("fflas"),
    graph: ordinary("graph"),
    m4ri: ordinary("m4ri"),
  };
}

function markerPath(prefix) {
  return join(prefix, ".sagejs-prebuilt-dependencies.json");
}

function prebuiltPackageIsCurrent(
  repositoryRoot,
  packageId,
  prefix,
  required = [],
  options = {},
) {
  if (
    prebuiltDisabled() ||
    !packages.includes(packageId) ||
    !existsSync(markerPath(prefix))
  ) return false;
  try {
    const marker = JSON.parse(readFileSync(markerPath(prefix), "utf8"));
    return marker.schema === schema &&
      marker.package === packageId &&
      marker.key === bundleKey(repositoryRoot, options) &&
      required.every((filename) => existsSync(filename));
  } catch {
    return false;
  }
}

function assertSafeRelative(path) {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized === "" ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`unsafe native dependency archive path: ${path}`);
  }
}

function runTar(arguments_, options = {}) {
  const result = spawnSync("tar", arguments_, {
    cwd: options.cwd,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `tar exited with ${result.status}`);
  }
  return result.stdout;
}

function writeMarkers(staging, identity, key) {
  for (const packageId of packages) {
    const prefix = join(staging, packageId);
    if (!existsSync(prefix)) throw new Error(`missing ${packageId} dependency prefix`);
    writeFileSync(
      markerPath(prefix),
      `${JSON.stringify({ ...identity, key, package: packageId }, null, 2)}\n`,
    );
  }
}

function normalizeCopiedSymlinks(source, destination) {
  const visit = (filename) => {
    const entry = lstatSync(filename);
    if (entry.isDirectory()) {
      for (const name of readdirSync(filename)) visit(join(filename, name));
      return;
    }
    if (!entry.isSymbolicLink()) return;
    const target = readlinkSync(filename);
    if (!isAbsolute(target)) {
      const resolved = resolve(dirname(filename), target);
      if (resolved !== destination && !resolved.startsWith(`${destination}${sep}`)) {
        throw new Error(`dependency symlink escapes its prefix: ${filename}`);
      }
      return;
    }
    const sourceTarget = resolve(target);
    if (sourceTarget !== source && !sourceTarget.startsWith(`${source}${sep}`)) {
      throw new Error(`dependency symlink points outside its prefix: ${filename}`);
    }
    const copiedTarget = join(destination, relative(source, sourceTarget));
    const portableTarget = relative(dirname(filename), copiedTarget);
    unlinkSync(filename);
    symlinkSync(portableTarget, filename);
  };
  visit(destination);
}

function createBundle(repositoryRoot, outputDirectory, options = {}) {
  const platform = options.platform || process.platform;
  const identity = bundleIdentity(repositoryRoot, options);
  const key = bundleKey(repositoryRoot, options);
  const name = assetName(repositoryRoot, options);
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-native-dependencies-pack-"));
  try {
    const targets = packageTargets(repositoryRoot, platform);
    for (const packageId of packages) {
      if (!existsSync(targets[packageId])) {
        throw new Error(`cannot package missing dependency prefix ${targets[packageId]}`);
      }
      const source = lstatSync(targets[packageId]).isSymbolicLink()
        ? realpathSync(targets[packageId])
        : targets[packageId];
      cpSync(source, join(temporary, packageId), {
        dereference: false,
        recursive: true,
        verbatimSymlinks: true,
      });
      normalizeCopiedSymlinks(source, join(temporary, packageId));
    }
    writeMarkers(temporary, identity, key);
    const entries = packages.flatMap((packageId) =>
      walkFiles(join(temporary, packageId), temporary));
    writeFileSync(
      join(temporary, "manifest.json"),
      `${JSON.stringify({ entries, identity, key, packages, schema }, null, 2)}\n`,
    );
    mkdirSync(outputDirectory, { recursive: true });
    const archive = join(resolve(outputDirectory), name);
    runTar(["-czf", archive, "-C", temporary, "."]);
    const digest = sha256(readFileSync(archive));
    writeFileSync(`${archive}.sha256`, `${digest}  ${basename(archive)}\n`);
    return { archive, digest, key, name };
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
}

function validateExtracted(staging, expectedKey) {
  const manifestPath = join(staging, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("native dependency archive has no manifest");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schema !== schema || manifest.key !== expectedKey) {
    throw new Error("native dependency archive identity does not match this checkout");
  }
  if (JSON.stringify(manifest.packages) !== JSON.stringify(packages)) {
    throw new Error("native dependency archive package set is invalid");
  }
  const actual = packages.flatMap((packageId) => walkFiles(join(staging, packageId), staging));
  if (JSON.stringify(actual) !== JSON.stringify(manifest.entries)) {
    throw new Error("native dependency archive contents do not match its manifest");
  }
  for (const entry of actual.filter(({ type }) => type === "symlink")) {
    assertSafeRelative(entry.target);
  }
}

function installBundleArchive(repositoryRoot, archive, expectedDigest, options = {}) {
  const absoluteArchive = resolve(archive);
  const archiveDirectory = dirname(absoluteArchive);
  const archiveName = basename(absoluteArchive);
  const actualDigest = sha256(readFileSync(absoluteArchive));
  if (actualDigest !== expectedDigest) {
    throw new Error(`native dependency SHA-256 is ${actualDigest}, expected ${expectedDigest}`);
  }
  const expectedKey = bundleKey(repositoryRoot, options);
  const listing = runTar(["-tzf", archiveName], { cwd: archiveDirectory });
  for (const path of listing.split(/\r?\n/).filter((value) => value && value !== "./")) {
    assertSafeRelative(path.startsWith("./") ? path.slice(2) : path);
  }
  // Keep tar's archive and extraction operands relative on Windows. Absolute
  // drive-letter paths are parsed as remote `host:file` syntax by Git tar.
  const temporary = mkdtempSync(
    join(archiveDirectory, ".sagejs-native-dependencies-install-"),
  );
  const backups = [];
  const installed = [];
  try {
    runTar(["-xzf", archiveName, "-C", basename(temporary)], {
      cwd: archiveDirectory,
    });
    validateExtracted(temporary, expectedKey);
    const targets = packageTargets(repositoryRoot, options.platform || process.platform);
    for (const packageId of packages) {
      const target = targets[packageId];
      const backup = `${target}.prebuilt-backup-${process.pid}`;
      mkdirSync(dirname(target), { recursive: true });
      rmSync(backup, { force: true, recursive: true });
      if (existsSync(target) || lstatExists(target)) {
        renameSync(target, backup);
        backups.push([target, backup]);
      }
      cpSync(join(temporary, packageId), target, {
        dereference: false,
        recursive: true,
        verbatimSymlinks: true,
      });
      installed.push(target);
    }
    for (const [, backup] of backups) rmSync(backup, { force: true, recursive: true });
    return { key: expectedKey, status: "installed" };
  } catch (error) {
    for (const target of installed.reverse()) rmSync(target, { force: true, recursive: true });
    for (const [target, backup] of backups.reverse()) {
      if (existsSync(backup) || lstatExists(backup)) renameSync(backup, target);
    }
    throw error;
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
}

function installBundlePath(repositoryRoot, input, options = {}) {
  const source = resolve(input);
  const archive = statSync(source).isDirectory()
    ? (() => {
        const archives = readdirSync(source)
          .filter((name) => name.endsWith(".tar.gz"))
          .map((name) => join(source, name));
        if (archives.length !== 1) {
          throw new Error(
            `expected exactly one native dependency archive in ${source}, ` +
              `found ${archives.length}`,
          );
        }
        return archives[0];
      })()
    : source;
  const sidecar = `${archive}.sha256`;
  if (!existsSync(sidecar)) {
    throw new Error(`native dependency archive has no checksum sidecar: ${sidecar}`);
  }
  const digest = parseDigest(readFileSync(sidecar, "utf8"), basename(archive));
  return installBundleArchive(repositoryRoot, archive, digest, options);
}

function lstatExists(filename) {
  try {
    lstatSync(filename);
    return true;
  } catch {
    return false;
  }
}

function parseDigest(source, name) {
  const match = source.trim().match(/^([a-f0-9]{64})(?:\s+\*?(.+))?$/i);
  if (!match || (match[2] && match[2] !== name)) {
    throw new Error("invalid native dependency SHA-256 sidecar");
  }
  return match[1].toLowerCase();
}

async function fetchRequired(url, kind) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${kind} download returned ${response.status}`);
  return response;
}

function prebuiltDisabled() {
  return process.env.SAGEJS_NATIVE_PREBUILT === "0" ||
    process.env.SAGEJS_NATIVE_MATH_PROFILE === "cpu-native" ||
    (process.platform === "darwin" &&
      process.env.MACOSX_DEPLOYMENT_TARGET !== undefined &&
      process.env.MACOSX_DEPLOYMENT_TARGET !== "13.0") ||
    packages.some((packageId) =>
      process.env[`SAGEJS_${packageId.toUpperCase()}_PREFIX`] !== undefined);
}

async function installPrebuiltDependencies(repositoryRoot = root, options = {}) {
  if (prebuiltDisabled()) return { status: "disabled" };
  const targets = packageTargets(repositoryRoot);
  if (packages.every((packageId) =>
    prebuiltPackageIsCurrent(repositoryRoot, packageId, targets[packageId]))) {
    return { key: bundleKey(repositoryRoot), status: "present" };
  }
  const name = assetName(repositoryRoot);
  const base = (process.env.SAGEJS_NATIVE_PREBUILT_BASE_URL ||
    `https://github.com/sagemathinc/sagejs/releases/download/${catalogRelease}`).replace(/\/$/, "");
  const cache = resolve(
    process.env.SAGEJS_NATIVE_PREBUILT_CACHE ||
      join(homedir(), ".cache", "sagejs", "native-prebuilt"),
  );
  const archive = join(cache, name);
  const sidecar = `${archive}.sha256`;
  try {
    let digest;
    try {
      const response = await fetchRequired(`${base}/${name}.sha256`, "checksum");
      const source = await response.text();
      digest = parseDigest(source, name);
      mkdirSync(cache, { recursive: true });
      writeFileSync(sidecar, source);
    } catch (error) {
      if (!existsSync(sidecar)) throw error;
      digest = parseDigest(readFileSync(sidecar, "utf8"), name);
    }
    if (!existsSync(archive) || sha256(readFileSync(archive)) !== digest) {
      const response = await fetchRequired(`${base}/${name}`, "archive");
      const contents = Buffer.from(await response.arrayBuffer());
      const actual = sha256(contents);
      if (actual !== digest) {
        throw new Error(`downloaded native dependency SHA-256 is ${actual}, expected ${digest}`);
      }
      mkdirSync(cache, { recursive: true });
      writeFileSync(archive, contents);
    }
    return installBundleArchive(repositoryRoot, archive, digest, options);
  } catch (error) {
    if (process.env.SAGEJS_NATIVE_PREBUILT_REQUIRED === "1" || options.required) throw error;
    process.stdout.write(`No verified native dependency prebuild: ${error.message || error}\n`);
    return { reason: error.message || String(error), status: "unavailable" };
  }
}

async function main() {
  const [command = "install", argument, ...rest] = process.argv.slice(2);
  if (rest.length !== 0) throw new Error(`unexpected arguments: ${rest.join(" ")}`);
  if (command === "install" && argument === undefined) {
    const result = await installPrebuiltDependencies(root);
    process.stdout.write(`Native dependency prebuild: ${result.status}${result.key ? ` (${result.key})` : ""}\n`);
    return;
  }
  if (command === "pack" && argument) {
    const result = createBundle(root, resolve(argument));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "install-archive" && argument) {
    const result = installBundlePath(root, argument);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "identity" && argument === undefined) {
    process.stdout.write(`${JSON.stringify({
      asset: assetName(root),
      identity: bundleIdentity(root),
      key: bundleKey(root),
    }, null, 2)}\n`);
    return;
  }
  throw new Error(
    "usage: native-prebuilt-dependencies.cjs " +
      "install|identity|pack OUTPUT|install-archive ARCHIVE_OR_DIRECTORY",
  );
}

module.exports = {
  assetName,
  bundleIdentity,
  bundleKey,
  catalogRelease,
  createBundle,
  identityInputs,
  installBundleArchive,
  installBundlePath,
  installPrebuiltDependencies,
  packages,
  packageTargets,
  parseDigest,
  prebuiltPackageIsCurrent,
  targetName,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
