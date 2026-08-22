#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { execFileSync, spawnSync } = require("node:child_process");
const { dirname, join, relative, resolve } = require("node:path");

const packageRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(packageRoot, "..", "..");
const lockFilename = join(packageRoot, "toolchain", "lock.json");
const markerName = ".sagejs-wasm-toolchain.json";

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function loadToolchainLock(filename = lockFilename) {
  const lock = JSON.parse(readFileSync(filename, "utf8"));
  if (lock.schema !== "sagejs.wasm-toolchain-lock/v1") {
    throw new Error(`unsupported WebAssembly toolchain lock schema in ${filename}`);
  }
  if (!/^[0-9a-f]{40}$/.test(lock.cowasm?.revision ?? "")) {
    throw new Error("the CoWasm revision must be a complete 40-character commit");
  }
  for (const [name, dependency] of Object.entries(lock.libraries ?? {})) {
    if (!/^[0-9a-f]{64}$/.test(dependency.sourceSha256 ?? "")) {
      throw new Error(`${name} must have a complete source SHA-256 digest`);
    }
    if (!dependency.prefix || dependency.prefix.startsWith("/") || dependency.prefix.includes("..")) {
      throw new Error(`${name} has an unsafe prefix path`);
    }
    if (dependency.recipe === "sagejs-portable-smalljac" &&
        (!dependency.url || !dependency.archiveName || !dependency.archiveEnvironment)) {
      throw new Error(`${name} has an incomplete portable-smalljac recipe`);
    }
  }
  for (const override of lock.build?.recipeOverrides ?? []) {
    if (!override.path || override.path.startsWith("/") || override.path.includes("..")) {
      throw new Error("a toolchain recipe override has an unsafe path");
    }
    for (const field of ["version", "digest", "url"]) {
      if ((override[`${field}From`] === undefined) !==
          (override[`${field}To`] === undefined)) {
        throw new Error(`${override.path} has an incomplete ${field} override`);
      }
    }
    if (override.urlFrom !== undefined &&
        (!override.urlFrom.startsWith("https://") || !override.urlTo.startsWith("https://"))) {
      throw new Error(`${override.path} source URL overrides must use HTTPS`);
    }
  }
  if (lock.sourceMirror?.schema !== "sagejs.wasm-source-mirror/v1" ||
      !Array.isArray(lock.sourceMirror.objects) || lock.sourceMirror.objects.length === 0) {
    throw new Error("the WebAssembly source mirror inventory is missing");
  }
  const mirrorIds = new Set();
  const mirrorFiles = new Set();
  for (const object of lock.sourceMirror.objects) {
    if (!/^[a-z0-9][a-z0-9-]+$/.test(object.id ?? "") || mirrorIds.has(object.id)) {
      throw new Error(`invalid or duplicate source mirror id ${object.id ?? "missing"}`);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._+-]+$/.test(object.filename ?? "") ||
        !/^[0-9a-f]{64}$/.test(object.sha256 ?? "")) {
      throw new Error(`${object.id} has an invalid source mirror filename or digest`);
    }
    const identity = `${object.sha256}/${object.filename}`;
    if (mirrorFiles.has(identity)) throw new Error(`duplicate source mirror object ${identity}`);
    mirrorIds.add(object.id);
    mirrorFiles.add(identity);
    if (object.cowasmTarget &&
        (object.cowasmTarget.startsWith("/") || object.cowasmTarget.includes(".."))) {
      throw new Error(`${object.id} has an unsafe CoWasm source target`);
    }
    for (const url of object.upstreamUrls ?? []) {
      if (!url.startsWith("https://")) throw new Error(`${object.id} has a non-HTTPS bootstrap URL`);
    }
  }
  if (!lock.sourceMirror.objects.some((object) => object.kind === "git-bundle")) {
    throw new Error("the source mirror does not include the pinned CoWasm checkout");
  }
  if (lock.sourceMirror.objects.filter((object) => object.kind === "git-bundle").length !== 1) {
    throw new Error("the source mirror must include exactly one pinned CoWasm checkout");
  }
  for (const [platform, digest] of Object.entries(lock.wasiSdk.archives)) {
    if (!lock.sourceMirror.objects.some((object) => object.platform === platform && object.sha256 === digest)) {
      throw new Error(`the source mirror lacks the locked WASI SDK archive for ${platform}`);
    }
  }
  for (const [name, dependency] of Object.entries(lock.libraries)) {
    if (name === "arb") continue;
    if (!lock.sourceMirror.objects.some((object) =>
      object.id === name && object.sha256 === dependency.sourceSha256)) {
      throw new Error(`the source mirror lacks the locked ${name} source archive`);
    }
  }
  return lock;
}

function toolchainLockDigest(lock = loadToolchainLock()) {
  const repositoryInputs = (lock.build.repositoryInputs ?? []).map((name) => {
    const filename = resolve(repositoryRoot, ...name.split("/"));
    return `${name}\0${sha256Bytes(readFileSync(filename))}`;
  });
  return sha256Bytes(
    `${canonicalJson(lock)}\0${sha256Bytes(readFileSync(__filename))}\0` +
      repositoryInputs.join("\0"),
  );
}

function platformKey(platform = process.platform, architecture = process.arch) {
  const os = platform === "darwin" ? "darwin" : platform;
  const arch = architecture === "x64" ? "x64" :
    architecture === "arm64" ? "arm64" : architecture;
  return `${os}-${arch}`;
}

function sourceMirrorObjects(lock = loadToolchainLock(), platform = platformKey()) {
  return lock.sourceMirror.objects.filter(
    (object) => object.platform === undefined || object.platform === platform,
  );
}

function sourceMirrorFilename(root, object) {
  return join(resolve(root), object.sha256, object.filename);
}

function verifyMirroredFile(root, object) {
  const filename = sourceMirrorFilename(root, object);
  if (!existsSync(filename)) throw new Error(`source mirror object is missing: ${object.id}`);
  const actual = sha256Bytes(readFileSync(filename));
  if (actual !== object.sha256) {
    throw new Error(`source mirror digest for ${object.id} ${actual} != ${object.sha256}`);
  }
  return filename;
}

function seedMirroredSources(cowasmRoot, mirrorRoot, lock) {
  for (const object of sourceMirrorObjects(lock)) {
    const source = verifyMirroredFile(mirrorRoot, object);
    if (object.cowasmTarget) {
      const destination = resolve(cowasmRoot, ...object.cowasmTarget.split("/"));
      const target = relative(resolve(cowasmRoot), destination);
      if (target.startsWith("..") || target === "") {
        throw new Error(`unsafe CoWasm mirror target for ${object.id}`);
      }
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
    if (object.archiveEnvironment) process.env[object.archiveEnvironment] = source;
  }
}

function gitCommonDirectory(root = repositoryRoot) {
  const output = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
  return resolve(output);
}

function defaultCacheRoot(root = repositoryRoot) {
  return resolve(
    process.env.SAGEJS_WASM_TOOLCHAIN_CACHE ||
      join(gitCommonDirectory(root), "sagejs-wasm-toolchains"),
  );
}

function cacheCheckout(lock = loadToolchainLock(), root = repositoryRoot) {
  return join(defaultCacheRoot(root), "v1", toolchainLockDigest(lock), "cowasm");
}

function explicitOverride(environment = process.env) {
  const preferred = environment.SAGEJS_WASM_TOOLCHAIN_ROOT;
  const legacy = environment.SAGEJS_COWASM_ROOT;
  if (preferred && legacy && resolve(preferred) !== resolve(legacy)) {
    throw new Error(
      "SAGEJS_WASM_TOOLCHAIN_ROOT and SAGEJS_COWASM_ROOT name different toolchains",
    );
  }
  return preferred || legacy || null;
}

function pathsForCowasm(cowasmRoot, lock = loadToolchainLock()) {
  const sdk = join(
    cowasmRoot,
    "core", "build", "build", "wasi-sdk", "dist", "wasi-sdk-next", "native",
  );
  const libraries = {};
  for (const [name, dependency] of Object.entries(lock.libraries)) {
    libraries[name] = {
      ...dependency,
      prefix: join(cowasmRoot, ...dependency.prefix.split("/")),
    };
  }
  return {
    root: cowasmRoot,
    clang: join(sdk, "bin", "clang"),
    llvmStrip: join(sdk, "bin", "llvm-strip"),
    sysroot: join(sdk, "share", "wasi-sysroot"),
    libraries,
  };
}

function checkoutRevision(cowasmRoot) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: cowasmRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function makefilePin(filename, field) {
  const source = readFileSync(filename, "utf8");
  const match = source.match(new RegExp(`^${field}\\s*=\\s*([^#\\r\\n]+)`, "m"));
  return match?.[1].trim() ?? null;
}

function verifySourcePins(cowasmRoot, lock, { recipeBase = false } = {}) {
  const differences = [];
  for (const [name, dependency] of Object.entries(lock.libraries)) {
    if (name === "arb" || dependency.recipe === "sagejs-portable-smalljac") continue;
    const filename = join(cowasmRoot, "sagemath", name, "Makefile");
    if (!existsSync(filename)) {
      if (dependency.required === false) continue;
      differences.push(`${name}: Makefile is missing`);
      continue;
    }
    const version = makefilePin(filename, "VERSION");
    const digest = makefilePin(filename, "TARBALL_SHA256");
    const recipeVersion = recipeBase
      ? dependency.recipeBaseVersion ?? dependency.version
      : dependency.version;
    const recipeDigest = recipeBase
      ? dependency.recipeBaseSourceSha256 ?? dependency.sourceSha256
      : dependency.sourceSha256;
    if (version !== recipeVersion) {
      differences.push(`${name}: version ${version ?? "missing"} != ${recipeVersion}`);
    }
    if (digest !== recipeDigest) {
      differences.push(`${name}: source digest ${digest ?? "missing"} != ${recipeDigest}`);
    }
  }
  const sdkMakefile = join(cowasmRoot, "core", "build", "src", "wasi-sdk", "Makefile");
  if (!existsSync(sdkMakefile)) {
    differences.push("WASI SDK Makefile is missing");
  } else if (makefilePin(sdkMakefile, "VERSION") !== lock.wasiSdk.version) {
    differences.push("WASI SDK version differs from the lock");
  }
  return differences;
}

function replaceExactly(source, before, after, description) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`expected exactly one ${description} in the pinned CoWasm recipe`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function applyRecipeOverrides(cowasmRoot, lock) {
  for (const override of lock.build.recipeOverrides) {
    const filename = join(cowasmRoot, ...override.path.split("/"));
    let source = readFileSync(filename, "utf8");
    if (override.versionFrom !== undefined || override.versionTo !== undefined) {
      source = replaceExactly(
        source,
        `VERSION = ${override.versionFrom}`,
        `VERSION = ${override.versionTo}`,
        `${override.path} version pin`,
      );
    }
    if (override.digestFrom !== undefined || override.digestTo !== undefined) {
      source = replaceExactly(
        source,
        `TARBALL_SHA256 = ${override.digestFrom}`,
        `TARBALL_SHA256 = ${override.digestTo}`,
        `${override.path} source digest`,
      );
    }
    if (override.urlFrom !== undefined || override.urlTo !== undefined) {
      source = replaceExactly(
        source,
        `URL = ${override.urlFrom}`,
        `URL = ${override.urlTo}`,
        `${override.path} source URL`,
      );
    }
    writeFileSync(filename, source);
  }
}

function applyWorkspaceLockRepair(cowasmRoot, lock) {
  const filename = join(cowasmRoot, "pnpm-lock.yaml");
  let source = readFileSync(filename, "utf8");
  const actual = sha256Bytes(source);
  if (actual === lock.cowasm.preparedPnpmLockSha256) return;
  if (actual !== lock.cowasm.pnpmLockSha256) {
    throw new Error(
      `the pinned CoWasm workspace lock digest ${actual} != ${lock.cowasm.pnpmLockSha256}`,
    );
  }
  source = replaceExactly(
    source,
    "  python/py-mpmath:\n",
    "  python/py-meson:\n" +
      "    devDependencies:\n" +
      "      '@cowasm/cpython':\n" +
      "        specifier: workspace:*\n" +
      "        version: link:../cpython\n" +
      "      '@cowasm/kernel':\n" +
      "        specifier: workspace:*\n" +
      "        version: link:../../core/kernel\n\n" +
      "  python/py-mpmath:\n",
    "python/py-meson frozen-lock importer",
  );
  source = replaceExactly(
    source,
    "  python/py-numpy:\n",
    "  python/py-ninja: {}\n\n  python/py-numpy:\n",
    "python/py-ninja frozen-lock importer",
  );
  source = replaceExactly(
    source,
    "  sagemath/combinatorial-designs:\n" +
      "    devDependencies:\n" +
      "      '@cowasm/boost-cropped':\n" +
      "        specifier: workspace:*\n" +
      "        version: link:../boost-cropped\n",
    "  sagemath/combinatorial-designs:\n    devDependencies:\n",
    "sagemath/combinatorial-designs frozen-lock importer",
  );
  source = replaceExactly(
    source,
    "      '@cowasm/gsl':\n" +
      "        specifier: workspace:*\n" +
      "        version: link:../gsl\n" +
      "      '@cowasm/libpng':\n",
    "      '@cowasm/gsl':\n" +
      "        specifier: workspace:*\n" +
      "        version: link:../gsl\n" +
      "      '@cowasm/libcxx':\n" +
      "        specifier: workspace:*\n" +
      "        version: link:../../core/libcxx\n" +
      "      '@cowasm/libpng':\n",
    "sagemath/sagelib libcxx frozen-lock dependency",
  );
  source = replaceExactly(
    source,
    "      '@cowasm/py-numpy':\n" +
      "        specifier: workspace:*\n" +
      "        version: link:../../python/py-numpy\n" +
      "      '@cowasm/py-platformdirs':\n" +
      "        specifier: workspace:*\n" +
      "        version: link:../../python/py-platformdirs\n\n" +
      "  sagemath/sirocco:\n",
    "      '@cowasm/py-numpy':\n" +
      "        specifier: workspace:*\n" +
      "        version: link:../../python/py-numpy\n" +
      "      '@cowasm/py-packaging':\n" +
      "        specifier: workspace:*\n" +
      "        version: link:../../python/py-packaging\n" +
      "      '@cowasm/py-platformdirs':\n" +
      "        specifier: workspace:*\n" +
      "        version: link:../../python/py-platformdirs\n" +
      "      '@cowasm/rw':\n" +
      "        specifier: workspace:*\n" +
      "        version: link:../rw\n\n" +
      "  sagemath/sirocco:\n",
    "sagemath/sagelib Python and rw frozen-lock dependencies",
  );
  const repaired = sha256Bytes(source);
  if (repaired !== lock.cowasm.preparedPnpmLockSha256) {
    throw new Error(
      `the repaired CoWasm workspace lock digest ${repaired} != ${lock.cowasm.preparedPnpmLockSha256}`,
    );
  }
  writeFileSync(filename, source);
}

function installCowasmWrappers(cowasmRoot, lock) {
  const bin = join(cowasmRoot, "bin");
  mkdirSync(bin, { recursive: true });
  for (const [name, sourceName] of Object.entries(lock.build.wrapperSources)) {
    const source = join(cowasmRoot, ...sourceName.split("/"));
    const destination = join(bin, name);
    if (!existsSync(source)) throw new Error(`pinned CoWasm wrapper source is missing: ${sourceName}`);
    rmSync(destination, { force: true });
    symlinkSync(relative(bin, source), destination);
  }
}

function requiredFiles(paths, lock) {
  const files = [
    ["WASI SDK clang", paths.clang],
    ["WASI SDK sysroot", paths.sysroot],
    ["WASI SDK llvm-strip", paths.llvmStrip],
  ];
  for (const [name, dependency] of Object.entries(paths.libraries)) {
    if (dependency.required === false) continue;
    files.push([`${name} headers`, join(dependency.prefix, "include")]);
    files.push([
      `${name} archive`,
      join(dependency.prefix, "lib", dependency.archiveName ?? `lib${name}.a`),
    ]);
  }
  const sdkDigest = lock.wasiSdk.archives[platformKey()];
  if (sdkDigest === undefined) {
    files.push([`locked WASI SDK platform ${platformKey()}`, ""]);
  }
  return files;
}

function inspectToolchain({ root = repositoryRoot, environment = process.env } = {}) {
  const lock = loadToolchainLock();
  const override = explicitOverride(environment);
  const cowasmRoot = resolve(override || cacheCheckout(lock, root));
  const paths = pathsForCowasm(cowasmRoot, lock);
  const problems = [];
  const revision = checkoutRevision(cowasmRoot);
  if (revision !== lock.cowasm.revision) {
    problems.push(
      revision === null
        ? "CoWasm checkout or prepared-toolchain marker is missing"
        : `CoWasm revision ${revision} != locked ${lock.cowasm.revision}`,
    );
  }
  if (!override) {
    const markerFilename = join(cowasmRoot, markerName);
    let marker = null;
    try {
      marker = JSON.parse(readFileSync(markerFilename, "utf8"));
    } catch {}
    if (marker?.schema !== "sagejs.wasm-prepared-toolchain/v1" ||
        marker?.lockDigest !== toolchainLockDigest(lock) ||
        marker?.cowasmRevision !== lock.cowasm.revision) {
      problems.push(`prepared-toolchain marker is missing or differs: ${markerFilename}`);
    }
  }
  if (revision !== null) problems.push(...verifySourcePins(cowasmRoot, lock));
  for (const [description, filename] of requiredFiles(paths, lock)) {
    if (!filename || !existsSync(filename)) problems.push(`missing ${description}: ${filename || "unsupported host"}`);
  }
  return {
    schema: "sagejs.wasm-toolchain-status/v1",
    ready: problems.length === 0,
    source: override ? "explicit-override" : "content-addressed-cache",
    root: cowasmRoot,
    lockDigest: toolchainLockDigest(lock),
    lockedRevision: lock.cowasm.revision,
    actualRevision: revision,
    platform: platformKey(),
    problems,
    paths,
    lock,
  };
}

function resolveToolchain(options = {}) {
  const status = inspectToolchain(options);
  if (!status.ready) {
    const command = "node packages/flint-wasm/scripts/wasm-toolchain.cjs prepare";
    throw new Error(
      `WebAssembly toolchain ${status.source} is not ready at ${status.root}:\n` +
        status.problems.map((problem) => `- ${problem}`).join("\n") +
        `\nRun \`${command}\`, or set SAGEJS_WASM_TOOLCHAIN_ROOT to an exact compatible checkout.`,
    );
  }
  return status;
}

function runChecked(command, arguments_, cwd) {
  process.stdout.write(`+ ${[command, ...arguments_].join(" ")}\n`);
  const bundledWasiRun = join(
    packageRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "wasi-run.cmd" : "wasi-run",
  );
  if (!process.env.COWASM_WASI_RUN && !existsSync(bundledWasiRun)) {
    throw new Error(
      `missing the pinned wasi-run test host: ${bundledWasiRun}; run \`pnpm install\` first`,
    );
  }
  const result = spawnSync(command, arguments_, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      COWASM_WASI_RUN: process.env.COWASM_WASI_RUN || bundledWasiRun,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? "unknown"}`);
  }
}

function prepareToolchain({ root = repositoryRoot } = {}) {
  if (explicitOverride()) {
    throw new Error(
      "prepare writes only to the content-addressed cache; unset SAGEJS_WASM_TOOLCHAIN_ROOT and SAGEJS_COWASM_ROOT",
    );
  }
  if (process.platform === "win32") {
    throw new Error(
      "building the pinned POSIX CoWasm toolchain is not supported on Windows; use a prepared artifact or an explicit compatible root",
    );
  }
  const before = inspectToolchain({ root });
  if (before.ready) return before;
  const lock = before.lock;
  const destination = cacheCheckout(lock, root);
  const parent = dirname(destination);
  mkdirSync(parent, { recursive: true });
  const lockDirectory = `${parent}.prepare-lock`;
  try {
    mkdirSync(lockDirectory);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`another process is preparing this WebAssembly toolchain: ${lockDirectory}`);
    }
    throw error;
  }
  const temporary = join(parent, ".cowasm-prepare");
  const mirrorRoot = process.env.SAGEJS_WASM_SOURCE_MIRROR_DIR;
  try {
    if (existsSync(temporary) && checkoutRevision(temporary) !== lock.cowasm.revision) {
      rmSync(temporary, { recursive: true, force: true });
    }
    if (!existsSync(temporary)) {
      if (mirrorRoot) {
        const bundle = verifyMirroredFile(
          mirrorRoot,
          lock.sourceMirror.objects.find((object) => object.kind === "git-bundle"),
        );
        mkdirSync(temporary, { recursive: true });
        runChecked("git", ["init", "--quiet"], temporary);
        runChecked(
          "git",
          ["fetch", "--quiet", bundle, "refs/heads/toolchain:refs/heads/toolchain"],
          temporary,
        );
      } else {
        runChecked(
          "git",
          ["clone", "--no-checkout", "--filter=blob:none", lock.cowasm.repository, temporary],
          root,
        );
      }
      runChecked("git", ["checkout", "--detach", lock.cowasm.revision], temporary);
    }
    let overriddenProblems = verifySourcePins(temporary, lock);
    if (overriddenProblems.length > 0) {
      const sourceProblems = verifySourcePins(temporary, lock, { recipeBase: true });
      if (sourceProblems.length > 0) {
        throw new Error(
          `the locked CoWasm source disagrees with both base and overridden dependency pins:\n` +
            [...sourceProblems, ...overriddenProblems].join("\n"),
        );
      }
      applyRecipeOverrides(temporary, lock);
      overriddenProblems = verifySourcePins(temporary, lock);
      if (overriddenProblems.length > 0) {
        throw new Error(`the locked dependency overrides failed:\n${overriddenProblems.join("\n")}`);
      }
    }
    applyWorkspaceLockRepair(temporary, lock);
    installCowasmWrappers(temporary, lock);
    if (mirrorRoot) seedMirroredSources(temporary, mirrorRoot, lock);
    for (const [command, ...arguments_] of lock.build.prepareTargets) {
      runChecked(command, arguments_, temporary);
    }
    runChecked(
      process.execPath,
      [join(packageRoot, "scripts", "build-smalljac-toolchain.cjs"), temporary],
      repositoryRoot,
    );
    writeFileSync(
      join(temporary, markerName),
      `${JSON.stringify({
        schema: "sagejs.wasm-prepared-toolchain/v1",
        lockDigest: toolchainLockDigest(lock),
        cowasmRevision: lock.cowasm.revision,
      }, null, 2)}\n`,
    );
    rmSync(destination, { recursive: true, force: true });
    renameSync(temporary, destination);
  } finally {
    rmSync(lockDirectory, { recursive: true, force: true });
  }
  return resolveToolchain({ root });
}

function sha256File(filename) {
  return sha256Bytes(readFileSync(filename));
}

function treeDigest(directory) {
  const hash = createHash("sha256");
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = join(current, entry.name);
      const name = relative(directory, filename).replaceAll("\\", "/");
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) {
        hash.update(name); hash.update("\0"); hash.update(readFileSync(filename)); hash.update("\0");
      }
    }
  }
  visit(directory);
  return hash.digest("hex");
}

function toolchainReceiptIdentity(status = resolveToolchain()) {
  const artifacts = [status.paths.clang, status.paths.llvmStrip];
  const libraries = {};
  for (const [name, dependency] of Object.entries(status.paths.libraries)) {
    if (dependency.required === false || !existsSync(dependency.prefix)) continue;
    const archive = join(
      dependency.prefix,
      "lib",
      status.lock.libraries[name].archiveName ?? `lib${name}.a`,
    );
    libraries[name] = {
      version: status.lock.libraries[name].version,
      sourceSha256: status.lock.libraries[name].sourceSha256,
      archiveSha256: sha256File(archive),
      headersSha256: treeDigest(join(dependency.prefix, "include")),
    };
    artifacts.push(archive);
  }
  let clangVersion = "unknown";
  try {
    clangVersion = execFileSync(status.paths.clang, ["--version"], { encoding: "utf8" })
      .split(/\r?\n/)[0].trim();
  } catch {}
  return {
    lockDigest: status.lockDigest,
    resolverSha256: sha256File(__filename),
    cowasmRevision: status.lockedRevision,
    wasiSdk: {
      version: status.lock.wasiSdk.version,
      platformArchiveSha256: status.lock.wasiSdk.archives[status.platform],
      clangVersion,
      clangSha256: sha256File(status.paths.clang),
      llvmStripSha256: sha256File(status.paths.llvmStrip),
    },
    libraries,
  };
}

function printableStatus(status) {
  return {
    schema: status.schema,
    ready: status.ready,
    source: status.source,
    root: status.root,
    lockDigest: status.lockDigest,
    lockedRevision: status.lockedRevision,
    actualRevision: status.actualRevision,
    platform: status.platform,
    problems: status.problems,
  };
}

function main() {
  const command = process.argv[2] || "status";
  const json = process.argv.includes("--json");
  if (command === "prepare") {
    const status = prepareToolchain();
    process.stdout.write(json ? `${JSON.stringify(printableStatus(status), null, 2)}\n` : `Prepared ${status.root}\n`);
    return;
  }
  if (command === "path") {
    process.stdout.write(`${resolveToolchain().root}\n`);
    return;
  }
  if (command === "cache-path") {
    process.stdout.write(`${cacheCheckout(loadToolchainLock(), repositoryRoot)}\n`);
    return;
  }
  if (command !== "status") {
    throw new Error("usage: wasm-toolchain.cjs [status [--json]|prepare [--json]|path|cache-path]");
  }
  const status = inspectToolchain();
  if (json) process.stdout.write(`${JSON.stringify(printableStatus(status), null, 2)}\n`);
  else {
    process.stdout.write(`WebAssembly toolchain: ${status.ready ? "ready" : "not prepared"}\n`);
    process.stdout.write(`  source: ${status.source}\n  root: ${status.root}\n  identity: ${status.lockDigest}\n`);
    for (const problem of status.problems) process.stdout.write(`  - ${problem}\n`);
  }
  if (!status.ready) process.exitCode = 1;
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = {
  cacheCheckout,
  applyRecipeOverrides,
  canonicalJson,
  defaultCacheRoot,
  explicitOverride,
  installCowasmWrappers,
  inspectToolchain,
  loadToolchainLock,
  pathsForCowasm,
  platformKey,
  prepareToolchain,
  resolveToolchain,
  seedMirroredSources,
  sourceMirrorFilename,
  sourceMirrorObjects,
  toolchainLockDigest,
  toolchainReceiptIdentity,
  verifySourcePins,
};
