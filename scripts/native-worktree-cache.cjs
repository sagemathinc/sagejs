#!/usr/bin/env node
"use strict";

// Native dependencies and addons are expensive, immutable products of source,
// platform, toolchain, and build options. Keep one verified snapshot in the
// repository's shared Git directory, then provision each worktree with an
// independent copy (a copy-on-write clone where the filesystem supports it).
// Dependency and addon stages have separate keys so a Node ABI or adapter
// change never forces a rebuild of mature static libraries.

const {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { createHash, randomUUID } = require("node:crypto");
const { EOL, homedir, release: operatingSystemRelease } = require("node:os");
const {
  dirname,
  isAbsolute,
  join,
  resolve,
} = require("node:path");
const { spawnSync } = require("node:child_process");
const { git } = require("./parallel-lib.cjs");
const { pnpmInvocation } = require("./pnpm-invocation.cjs");

const nativeCacheSchema = "sagejs.parallel-native-artifact-cache-v1";
const nativeCachePackages = new Set(["flint", "graph"]);
const nativeCacheSleep = new Int32Array(new SharedArrayBuffer(4));

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      stableJson(value[key]),
    ]));
  }
  return value;
}

function safeRelativePath(path) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    normalized === "" ||
    isAbsolute(path) ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`unsafe native-cache path: ${path}`);
  }
  return normalized;
}

function walkPath(workspace, requestedPath) {
  const path = safeRelativePath(requestedPath);
  const absolute = join(workspace, path);
  if (!existsSync(absolute)) return [{ path, type: "missing" }];
  const metadata = lstatSync(absolute);
  if (metadata.isSymbolicLink()) {
    return [{ path, type: "symlink", target: readlinkSync(absolute) }];
  }
  if (metadata.isFile()) {
    const contents = readFileSync(absolute);
    return [{
      path,
      type: "file",
      mode: metadata.mode & 0o777,
      size: contents.length,
      sha256: sha256(contents),
    }];
  }
  if (!metadata.isDirectory()) {
    throw new Error(`native cache cannot snapshot special file ${path}`);
  }
  const entries = readdirSync(absolute).sort();
  if (entries.length === 0) return [{ path, type: "directory" }];
  return entries.flatMap((name) => walkPath(workspace, join(path, name)));
}

function snapshot(workspace, paths) {
  const entries = paths.flatMap((path) => walkPath(workspace, path));
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return entries;
}

function snapshotHash(entries) {
  return sha256(JSON.stringify(stableJson(entries)));
}

function toolVersion(command, args = ["--version"]) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) return `unavailable:${result.error.code || result.error.message}`;
  return [result.status, result.stdout, result.stderr]
    .map((item) => String(item ?? "").trim())
    .join("|");
}

function toolIdentity(command, args = ["--version"]) {
  return {
    executable: toolVersion(
      process.platform === "win32" ? "where.exe" : "which",
      [command],
    ),
    version: toolVersion(command, args),
  };
}

function archiveIdentity(name) {
  const path = process.env[name];
  if (!path) return null;
  const absolute = resolve(path);
  if (!existsSync(absolute)) return { path: absolute, state: "missing" };
  const contents = readFileSync(absolute);
  return { path: absolute, size: contents.length, sha256: sha256(contents) };
}

function nativeBuildIdentity(workspace, overrides = {}) {
  if (overrides.identity !== undefined) return stableJson(overrides.identity);
  const selectedEnvironment = {};
  for (const name of [
    "AR",
    "ARCHFLAGS",
    "CC",
    "CFLAGS",
    "CMAKE_GENERATOR",
    "CMAKE_GENERATOR_PLATFORM",
    "CMAKE_TOOLCHAIN_FILE",
    "CPPFLAGS",
    "CXX",
    "CXXFLAGS",
    "LDFLAGS",
    "MACOSX_DEPLOYMENT_TARGET",
    "GYP_DEFINES",
    "ComSpec",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "SDKROOT",
    "SAGEJS_BUILD_JOBS",
    "SAGEJS_CLANG_BUILTINS",
    "VCPKG_DEFAULT_TRIPLET",
    "VCPKG_ROOT",
    "VSCMD_VER",
    "VCToolsVersion",
    "VisualStudioVersion",
    "WindowsSDKVersion",
    "npm_config_arch",
    "npm_config_debug",
    "npm_config_nodedir",
    "npm_config_runtime",
    "npm_config_target",
    "npm_config_target_arch",
  ]) {
    if (process.env[name] !== undefined) selectedEnvironment[name] = process.env[name];
  }
  const archives = {};
  for (const name of [
    "SAGEJS_CLANG_BUILTINS",
    "SAGEJS_FFPOLY_TARBALL",
    "SAGEJS_FLINT_TARBALL",
    "SAGEJS_GMP_TARBALL",
    "SAGEJS_IGRAPH_TARBALL",
    "SAGEJS_MPC_TARBALL",
    "SAGEJS_MPFR_TARBALL",
    "SAGEJS_OPENBLAS_TARBALL",
    "SAGEJS_SMALLJAC_TARBALL",
  ]) {
    const identity = archiveIdentity(name);
    if (identity !== null) archives[name] = identity;
  }
  const compilers = process.platform === "win32"
    ? {
      clangCl: toolIdentity(process.env.CXX || "clang-cl"),
      cl: toolIdentity("cl", []),
      cmake: toolIdentity("cmake"),
    }
    : {
      cc: toolIdentity(process.env.CC || "cc"),
      cmake: toolIdentity("cmake"),
      cxx: toolIdentity(process.env.CXX || "c++"),
      make: toolIdentity("make"),
    };
  let packageManager = null;
  try {
    packageManager = JSON.parse(
      readFileSync(join(workspace, "package.json"), "utf8"),
    ).packageManager ?? null;
  } catch {
    // Synthetic tests and partial source distributions may omit package.json.
  }
  return stableJson({
    native: {
      archives,
      compilers,
      environment: selectedEnvironment,
      linker: process.platform === "win32"
        ? toolIdentity("link", [])
        : toolIdentity("ld"),
      platform: {
        arch: process.arch,
        osRelease: operatingSystemRelease(),
        platform: process.platform,
      },
      python: toolIdentity(process.env.PYTHON || "python3"),
    },
    node: {
      abi: process.versions.modules,
      executable: process.execPath,
      napi: process.versions.napi,
      version: process.versions.node,
    },
    pnpm: {
      packageManager,
      version: toolIdentity(process.platform === "win32" ? "pnpm.cmd" : "pnpm"),
    },
  });
}

function dependencyPrefix(packageId) {
  if (packageId === "flint" && process.platform === "win32") {
    return "packages/flint/.native/vcpkg-installed/x64-windows-static-md-release";
  }
  return `packages/${packageId}/.native/prefix`;
}

function nativeArtifactSpecs(workspace, overrides = {}) {
  const identity = nativeBuildIdentity(workspace, overrides);
  const commonAddonInputs = [
    "pnpm-lock.yaml",
    "scripts/build-ffi-host-adapter.cjs",
    "tools/ffi",
    "tools/native-kernel",
  ];
  const descriptions = {
    flint: {
      dependencyInputs: [
        "packages/flint/scripts/build-deps.cjs",
        "packages/flint/scripts/triplets",
        "packages/flint/scripts/vcpkg-ports",
        "packages/flint/vcpkg.json",
      ],
      addonInputs: [
        "packages/flint/binding.gyp",
        "packages/flint/package.json",
        "packages/flint/src",
        "packages/flint/include",
        "packages/flint/generated/ffi_host.py",
        "packages/flint/scripts/native-prefix.cjs",
        "packages/flint/scripts/windows-clang-builtins.cjs",
        "ffi/flint.ffi.py",
        "ffi/flint.json",
        ...commonAddonInputs,
      ],
      addonOutputs: [
        "packages/flint/build/Release/sagejs_flint.node",
        "packages/flint/build/generated-ffi",
      ],
      requiredAddonOutputs: [
        "packages/flint/build/Release/sagejs_flint.node",
        "packages/flint/build/generated-ffi/sagejs_flint_ffi.node",
        "packages/flint/build/generated-ffi/manifest.json",
      ],
    },
    graph: {
      dependencyInputs: [
        "packages/graph/scripts/build-deps.cjs",
        "packages/graph/include/sagejs/igraph_ffi.h",
      ],
      addonInputs: [
        "packages/graph/binding.gyp",
        "packages/graph/package.json",
        "packages/graph/src",
        "packages/graph/include",
        "packages/graph/generated/ffi_host.py",
        "packages/graph/scripts/native-prefix.cjs",
        "ffi/igraph.ffi.py",
        "ffi/igraph.json",
        ...commonAddonInputs,
      ],
      addonOutputs: [
        "packages/graph/build/Release/sagejs_graph.node",
        "packages/graph/build/generated-ffi",
      ],
      requiredAddonOutputs: [
        "packages/graph/build/Release/sagejs_graph.node",
        "packages/graph/build/generated-ffi/sagejs_igraph_ffi.node",
        "packages/graph/build/generated-ffi/manifest.json",
      ],
    },
  };
  return Object.entries(descriptions).flatMap(([packageId, description]) => {
    const dependencyInputs = snapshot(workspace, description.dependencyInputs);
    // Node's addon ABI cannot affect static GMP/FLINT/igraph archives. Keeping
    // it out of this stage avoids rebuilding mature dependencies after an
    // otherwise compatible Node upgrade; the addon stage below includes it.
    const dependencyIdentity = identity.native ?? identity;
    const dependencyKey = sha256(JSON.stringify(stableJson({
      identity: dependencyIdentity,
      inputs: dependencyInputs,
      packageId,
      schema: nativeCacheSchema,
      stage: "dependencies",
    })));
    const addonInputs = snapshot(workspace, description.addonInputs);
    const addonKey = sha256(JSON.stringify(stableJson({
      dependencyKey,
      identity,
      inputs: addonInputs,
      packageId,
      schema: nativeCacheSchema,
      stage: "addon",
    })));
    return [
      {
        id: `${packageId}-dependencies`,
        packageId,
        stage: "dependencies",
        key: dependencyKey,
        identity,
        inputs: dependencyInputs,
        outputRoots: [dependencyPrefix(packageId)],
        requiredOutputs: packageId === "flint"
          ? process.platform === "win32"
            ? [
              `${dependencyPrefix(packageId)}/lib/flint.lib`,
              `${dependencyPrefix(packageId)}/lib/openblas.lib`,
            ]
            : [
              `${dependencyPrefix(packageId)}/lib/libflint.a`,
              `${dependencyPrefix(packageId)}/lib/libgmp.a`,
              `${dependencyPrefix(packageId)}/lib/libopenblas.a`,
              `${dependencyPrefix(packageId)}/.sagejs-flint-dependencies.json`,
            ]
          : [
            process.platform === "win32"
              ? `${dependencyPrefix(packageId)}/lib/igraph.lib`
              : `${dependencyPrefix(packageId)}/lib/libigraph.a`,
            `${dependencyPrefix(packageId)}/.sagejs-igraph-1.0.1`,
          ],
        buildCommands: [["pnpm", ["--dir", `packages/${packageId}`, "run", "build:deps"]]],
      },
      {
        id: `${packageId}-addon`,
        packageId,
        stage: "addon",
        key: addonKey,
        identity,
        inputs: addonInputs,
        outputRoots: description.addonOutputs,
        requiredOutputs: description.requiredAddonOutputs,
        buildCommands: [
          ["pnpm", ["--dir", `packages/${packageId}`, "run", "build:addon"]],
          ["pnpm", ["--dir", `packages/${packageId}`, "run", "build:ffi"]],
        ],
      },
    ];
  });
}

function defaultNativeCacheRoot(workspace = process.cwd()) {
  if (process.env.SAGEJS_PARALLEL_NATIVE_CACHE) {
    return resolve(process.env.SAGEJS_PARALLEL_NATIVE_CACHE);
  }
  try {
    const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], workspace);
    return join(common, "sagejs-native-artifacts");
  } catch {
    return join(homedir(), ".cache", "sagejs", "parallel-native-artifacts");
  }
}

function cacheEntry(cacheRoot, spec) {
  return join(cacheRoot, spec.id, spec.key);
}

function manifestForEntry(entry) {
  const filename = join(entry, "manifest.json");
  if (!existsSync(filename)) return null;
  try {
    return JSON.parse(readFileSync(filename, "utf8"));
  } catch {
    return null;
  }
}

function pathIsWithin(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

function validCacheEntry(entry, spec) {
  try {
    const manifest = manifestForEntry(entry);
    if (
      manifest?.schema !== nativeCacheSchema ||
      manifest.id !== spec.id ||
      manifest.key !== spec.key ||
      manifest.input_hash !== snapshotHash(spec.inputs) ||
      JSON.stringify(manifest.output_roots) !== JSON.stringify(spec.outputRoots) ||
      !Array.isArray(manifest.files)
    ) return false;
    const outputRoots = spec.outputRoots.map(safeRelativePath);
    const files = manifest.files.map((file) => ({
      ...file,
      path: safeRelativePath(file.path),
    }));
    const paths = new Set(files.map(({ path }) => path));
    if (paths.size !== files.length) return false;
    for (const required of spec.requiredOutputs) {
      if (!paths.has(safeRelativePath(required))) return false;
    }
    const symlinks = new Set(
      files.filter(({ type }) => type === "symlink").map(({ path }) => path),
    );
    for (const file of files) {
      if (!outputRoots.some((root) => pathIsWithin(file.path, root))) return false;
      const components = file.path.split("/");
      for (let length = 1; length < components.length; length += 1) {
        if (symlinks.has(components.slice(0, length).join("/"))) return false;
      }
      const path = file.path;
      const absolute = join(entry, "payload", path);
      if (!existsSync(absolute)) return false;
      const metadata = lstatSync(absolute);
      if (file.type === "symlink") {
        if (!metadata.isSymbolicLink() || readlinkSync(absolute) !== file.target) return false;
      } else if (file.type === "directory") {
        if (!metadata.isDirectory()) return false;
      } else if (file.type === "file") {
        if (!metadata.isFile() || metadata.size !== file.size) return false;
        if (sha256(readFileSync(absolute)) !== file.sha256) return false;
      } else {
        return false;
      }
    }
    return true;
  } catch {
    // A concurrent quarantine can remove an invalid entry during inspection.
    return false;
  }
}

function copySnapshotEntry(sourceRoot, destinationRoot, entry) {
  const source = join(sourceRoot, entry.path);
  const destination = join(destinationRoot, entry.path);
  mkdirSync(dirname(destination), { recursive: true });
  if (entry.type === "directory") {
    mkdirSync(destination, { recursive: true });
  } else if (entry.type === "symlink") {
    symlinkSync(entry.target, destination);
  } else if (entry.type === "file") {
    try {
      copyFileSync(source, destination, constants.COPYFILE_FICLONE);
    } catch {
      copyFileSync(source, destination);
    }
    chmodSync(destination, entry.mode);
  }
}

function quarantineCacheEntry(entry) {
  if (!existsSync(entry)) return;
  const quarantine = `${entry}.corrupt-${process.pid}-${randomUUID()}`;
  try {
    renameSync(entry, quarantine);
    rmSync(quarantine, { recursive: true, force: true });
  } catch {
    // Another publisher or reader won the race. Treat this lookup as a miss.
  }
}

function publishNativeArtifact(workspace, cacheRoot, spec) {
  for (const path of spec.requiredOutputs) {
    if (!existsSync(join(workspace, path))) {
      throw new Error(`${spec.id} did not produce required output ${path}`);
    }
  }
  const entry = cacheEntry(cacheRoot, spec);
  if (validCacheEntry(entry, spec)) return { status: "already-published", entry };
  if (existsSync(entry)) quarantineCacheEntry(entry);
  const parent = dirname(entry);
  mkdirSync(parent, { recursive: true });
  const temporary = mkdtempSync(join(parent, `.publish-${spec.key}-`));
  try {
    const files = snapshot(workspace, spec.outputRoots).filter(
      ({ type }) => type !== "missing",
    );
    for (const file of files) {
      copySnapshotEntry(workspace, join(temporary, "payload"), file);
    }
    const manifest = {
      schema: nativeCacheSchema,
      id: spec.id,
      key: spec.key,
      output_roots: spec.outputRoots,
      input_hash: snapshotHash(spec.inputs),
      files,
    };
    writeFileSync(join(temporary, "manifest.json"), `${JSON.stringify(manifest, null, 2)}${EOL}`);
    try {
      renameSync(temporary, entry);
    } catch (error) {
      if (validCacheEntry(entry, spec)) {
        rmSync(temporary, { recursive: true, force: true });
        return { status: "concurrent-publication", entry };
      }
      throw error;
    }
    return { status: "published", entry };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function restoreNativeArtifact(workspace, cacheRoot, spec) {
  const entry = cacheEntry(cacheRoot, spec);
  if (!validCacheEntry(entry, spec)) {
    if (existsSync(entry)) quarantineCacheEntry(entry);
    return { status: "miss", entry };
  }
  const manifest = manifestForEntry(entry);
  const currentFiles = snapshot(workspace, spec.outputRoots).filter(
    ({ type }) => type !== "missing",
  );
  if (JSON.stringify(currentFiles) === JSON.stringify(manifest.files)) {
    return { status: "present", entry };
  }
  const temporary = mkdtempSync(join(workspace, ".sagejs-native-restore-"));
  try {
    for (const file of manifest.files) {
      copySnapshotEntry(join(entry, "payload"), temporary, file);
    }
    for (const requestedRoot of spec.outputRoots) {
      const outputRoot = safeRelativePath(requestedRoot);
      const staged = join(temporary, outputRoot);
      if (!existsSync(staged)) continue;
      const target = join(workspace, outputRoot);
      const backup = `${target}.sagejs-cache-backup-${process.pid}-${randomUUID()}`;
      mkdirSync(dirname(target), { recursive: true });
      let backedUp = false;
      try {
        if (existsSync(target)) {
          renameSync(target, backup);
          backedUp = true;
        }
        renameSync(staged, target);
        if (backedUp) rmSync(backup, { recursive: true, force: true });
      } catch (error) {
        if (!existsSync(target) && backedUp && existsSync(backup)) {
          renameSync(backup, target);
        }
        throw error;
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  return { status: "restored", entry };
}

function wait(milliseconds) {
  Atomics.wait(nativeCacheSleep, 0, 0, milliseconds);
}

function acquireNativeCacheLock(lock, options = {}) {
  const waitMilliseconds = options.waitMilliseconds ?? 60 * 60 * 1000;
  const staleMilliseconds = options.staleMilliseconds ?? 2 * 60 * 60 * 1000;
  const started = Date.now();
  while (true) {
    const token = randomUUID();
    try {
      mkdirSync(lock, { recursive: false });
      writeFileSync(join(lock, "owner.json"), `${JSON.stringify({
        pid: process.pid,
        started_at: new Date().toISOString(),
        token,
      })}${EOL}`);
      return token;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    let abandoned = false;
    const owner = join(lock, "owner.json");
    if (existsSync(owner)) {
      try {
        const { pid } = JSON.parse(readFileSync(owner, "utf8"));
        if (Number.isInteger(pid) && pid > 0) {
          try {
            process.kill(pid, 0);
          } catch (error) {
            abandoned = error.code === "ESRCH";
          }
        }
      } catch {
        // A lock owner may be between mkdir and its atomic-sized metadata write.
      }
    }
    try {
      if (abandoned || Date.now() - statSync(lock).mtimeMs > staleMilliseconds) {
        const stale = `${lock}.stale-${process.pid}-${randomUUID()}`;
        renameSync(lock, stale);
        rmSync(stale, { recursive: true, force: true });
        continue;
      }
    } catch {
      continue;
    }
    if (Date.now() - started > waitMilliseconds) {
      throw new Error(`timed out waiting for native cache lock ${lock}`);
    }
    wait(100);
  }
}

function releaseNativeCacheLock(lock, token) {
  try {
    const owner = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8"));
    if (owner.token !== token) return;
    const released = `${lock}.released-${process.pid}-${token}`;
    renameSync(lock, released);
    rmSync(released, { recursive: true, force: true });
  } catch {
    // A stale-lock recovery may already have transferred ownership.
  }
}

function runCommand(command, args, cwd) {
  process.stdout.write(`+ ${command} ${args.join(" ")}\n`);
  const invocation = command === "pnpm"
    ? pnpmInvocation(args)
    : { command, arguments: args, shell: false };
  const result = spawnSync(invocation.command, invocation.arguments, {
    cwd,
    env: process.env,
    shell: invocation.shell,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function runBuildCommands(workspace, spec, runner = runCommand) {
  for (const [command, args] of spec.buildCommands) runner(command, args, workspace);
}

function prepareNativeArtifact(workspace, cacheRoot, spec, options = {}) {
  const restored = restoreNativeArtifact(workspace, cacheRoot, spec);
  if (["present", "restored"].includes(restored.status)) return restored;
  const entry = cacheEntry(cacheRoot, spec);
  const lock = `${entry}.lock`;
  mkdirSync(dirname(lock), { recursive: true });
  let lockToken;
  while (true) {
    try {
      lockToken = acquireNativeCacheLock(lock, options);
      break;
    } catch (error) {
      if (validCacheEntry(entry, spec)) {
        return restoreNativeArtifact(workspace, cacheRoot, spec);
      }
      throw error;
    }
  }
  try {
    const afterLock = restoreNativeArtifact(workspace, cacheRoot, spec);
    if (["present", "restored"].includes(afterLock.status)) return afterLock;
    // A cache key attests to the toolchain recorded in `spec`. Do not publish
    // an unverified package-local build that may have been produced by an
    // older compiler or a different set of build flags.
    for (const outputRoot of spec.outputRoots) {
      rmSync(join(workspace, safeRelativePath(outputRoot)), {
        recursive: true,
        force: true,
      });
    }
    if (typeof options.build === "function") options.build(workspace, spec);
    else runBuildCommands(workspace, spec, options.runner);
    const publication = publishNativeArtifact(workspace, cacheRoot, spec);
    return { status: "built", entry: publication.entry };
  } finally {
    releaseNativeCacheLock(lock, lockToken);
  }
}

function selectedNativeSpecs(workspace, packageIds, options = {}) {
  const selected = new Set(packageIds);
  for (const packageId of selected) {
    if (!nativeCachePackages.has(packageId)) {
      throw new Error(`unknown native package ${packageId}`);
    }
  }
  return nativeArtifactSpecs(workspace, options).filter(
    ({ packageId }) => selected.has(packageId),
  );
}

function nativePackageCacheable(packageId) {
  return process.env[`SAGEJS_${packageId.toUpperCase()}_PREFIX`] === undefined;
}

function prepareNativePackages(workspace, packageIds, options = {}) {
  const cacheRoot = options.cacheRoot || defaultNativeCacheRoot(workspace);
  const results = [];
  for (const packageId of packageIds) {
    if (!nativePackageCacheable(packageId)) {
      runCommand("pnpm", ["--dir", `packages/${packageId}`, "build"], workspace);
      results.push({ id: packageId, status: "built-uncached-custom-prefix" });
      continue;
    }
    for (const spec of selectedNativeSpecs(workspace, [packageId], options)) {
      results.push({ id: spec.id, ...prepareNativeArtifact(workspace, cacheRoot, spec, options) });
    }
  }
  return results;
}

function restoreNativePackages(workspace, packageIds, options = {}) {
  const cacheRoot = options.cacheRoot || defaultNativeCacheRoot(workspace);
  if (!packageIds.every(nativePackageCacheable)) return [];
  return selectedNativeSpecs(workspace, packageIds, options).map((spec) => ({
    id: spec.id,
    ...restoreNativeArtifact(workspace, cacheRoot, spec),
  }));
}

module.exports = {
  defaultNativeCacheRoot,
  nativeArtifactSpecs,
  nativeCachePackages,
  prepareNativeArtifact,
  prepareNativePackages,
  publishNativeArtifact,
  restoreNativeArtifact,
  restoreNativePackages,
  snapshot,
  validCacheEntry,
};
