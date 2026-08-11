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
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { createHash, randomUUID } = require("node:crypto");
const {
  EOL,
  homedir,
  hostname,
  release: operatingSystemRelease,
} = require("node:os");
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
  if (typeof path !== "string") {
    throw new Error(`native-cache path must be a string: ${path}`);
  }
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  const components = normalized.split("/");
  if (
    normalized === "" ||
    isAbsolute(path) ||
    /^[A-Za-z]:\//.test(normalized) ||
    components.some((component) => component === "" || component === "." || component === "..")
  ) {
    throw new Error(`unsafe native-cache path: ${path}`);
  }
  return normalized;
}

function pathMetadata(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function resolvedWorkspaceRoot(workspace) {
  const root = realpathSync(resolve(workspace));
  if (!statSync(root).isDirectory()) {
    throw new Error(`native-cache workspace is not a directory: ${workspace}`);
  }
  return root;
}

function workspacePath(workspace, requestedPath, { allowLeafSymlink = true } = {}) {
  const root = resolvedWorkspaceRoot(workspace);
  const path = safeRelativePath(requestedPath);
  const components = path.split("/");
  let current = root;
  for (let index = 0; index < components.length; index += 1) {
    current = join(current, components[index]);
    const metadata = pathMetadata(current);
    if (metadata === null) break;
    const leaf = index === components.length - 1;
    if (metadata.isSymbolicLink() && (!leaf || !allowLeafSymlink)) {
      throw new Error(`native-cache path has symlinked ancestor: ${path}`);
    }
    if (!leaf && !metadata.isDirectory()) {
      throw new Error(`native-cache path has non-directory ancestor: ${path}`);
    }
  }
  const absolute = join(root, path);
  if (!pathIsWithin(absolute.replaceAll("\\", "/"), root.replaceAll("\\", "/"))) {
    throw new Error(`native-cache path escapes workspace: ${path}`);
  }
  return absolute;
}

function walkPath(workspace, requestedPath, options = {}) {
  const path = safeRelativePath(requestedPath);
  const absolute = workspacePath(workspace, path);
  const metadata = pathMetadata(absolute);
  if (metadata === null) return [{ path, type: "missing" }];
  if (metadata.isSymbolicLink()) {
    if (options.rejectSymlinks) {
      throw new Error(`native-cache input cannot be a symlink: ${path}`);
    }
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
  return entries.flatMap((name) => walkPath(workspace, join(path, name), options));
}

function snapshot(workspace, paths, options = {}) {
  const entries = paths.flatMap((path) => walkPath(workspace, path, options));
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return entries;
}

function validateNativeArtifactSpec(spec) {
  if (spec === null || typeof spec !== "object") {
    throw new Error("native-cache artifact spec must be an object");
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(spec.id || "")) {
    throw new Error(`invalid native-cache artifact id: ${spec.id}`);
  }
  if (!/^[a-f0-9]{64}$/.test(spec.key || "")) {
    throw new Error(`invalid native-cache artifact key for ${spec.id}`);
  }
  for (const name of ["inputPaths", "inputs", "outputRoots", "requiredOutputs"]) {
    if (!Array.isArray(spec[name])) {
      throw new Error(`native-cache ${spec.id} ${name} must be an array`);
    }
  }
  if (spec.inputPaths.length === 0 || spec.outputRoots.length === 0) {
    throw new Error(`native-cache ${spec.id} needs input and output roots`);
  }
  const inputPaths = spec.inputPaths.map(safeRelativePath);
  const outputRoots = spec.outputRoots.map(safeRelativePath);
  if (new Set(inputPaths).size !== inputPaths.length) {
    throw new Error(`native-cache ${spec.id} has duplicate input paths`);
  }
  if (new Set(outputRoots).size !== outputRoots.length) {
    throw new Error(`native-cache ${spec.id} has duplicate output roots`);
  }
  for (let left = 0; left < outputRoots.length; left += 1) {
    for (let right = left + 1; right < outputRoots.length; right += 1) {
      if (
        pathIsWithin(outputRoots[left], outputRoots[right]) ||
        pathIsWithin(outputRoots[right], outputRoots[left])
      ) {
        throw new Error(`native-cache ${spec.id} has overlapping output roots`);
      }
    }
  }
  for (const required of spec.requiredOutputs.map(safeRelativePath)) {
    if (!outputRoots.some((root) => pathIsWithin(required, root))) {
      throw new Error(`native-cache ${spec.id} required output is outside its roots`);
    }
  }
}

function assertInputsCurrent(workspace, spec) {
  validateNativeArtifactSpec(spec);
  const current = snapshot(workspace, spec.inputPaths, { rejectSymlinks: true });
  if (JSON.stringify(current) !== JSON.stringify(spec.inputs)) {
    throw new Error(`native-cache inputs changed while preparing ${spec.id}`);
  }
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

function fileIdentity(path) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) return { path: absolute, state: "missing" };
  const contents = readFileSync(absolute);
  return { path: absolute, size: contents.length, sha256: sha256(contents) };
}

function archiveIdentity(name) {
  const path = process.env[name];
  return path ? fileIdentity(path) : null;
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
  const externalVcpkgPath = process.env.VCPKG_ROOT
    ? join(
      process.env.VCPKG_ROOT,
      process.platform === "win32" ? "vcpkg.exe" : "vcpkg",
    )
    : null;
  const externalVcpkg = externalVcpkgPath
    ? {
      file: fileIdentity(externalVcpkgPath),
      tool: toolIdentity(externalVcpkgPath, ["version"]),
    }
    : null;
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
      archiver: toolIdentity(
        process.env.AR || (process.platform === "win32" ? "lib" : "ar"),
        process.platform === "win32" ? [] : ["--version"],
      ),
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
      vcpkg: externalVcpkg,
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
    const dependencyInputs = snapshot(workspace, description.dependencyInputs, {
      rejectSymlinks: true,
    });
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
    const addonInputs = snapshot(workspace, description.addonInputs, {
      rejectSymlinks: true,
    });
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
        inputPaths: description.dependencyInputs,
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
        inputPaths: description.addonInputs,
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
    validateNativeArtifactSpec(spec);
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
    for (const root of outputRoots) {
      if (!files.some(({ path }) => pathIsWithin(path, root))) return false;
    }
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
  assertInputsCurrent(workspace, spec);
  const workspaceRoot = resolvedWorkspaceRoot(workspace);
  for (const path of spec.requiredOutputs) {
    if (!existsSync(workspacePath(workspaceRoot, path))) {
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
    for (const outputRoot of spec.outputRoots) {
      workspacePath(workspaceRoot, outputRoot, { allowLeafSymlink: false });
    }
    const files = snapshot(workspaceRoot, spec.outputRoots).filter(
      ({ type }) => type !== "missing",
    );
    for (const file of files) {
      copySnapshotEntry(workspaceRoot, join(temporary, "payload"), file);
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
    assertInputsCurrent(workspaceRoot, spec);
    if (!validCacheEntry(temporary, spec)) {
      throw new Error(`native-cache refused invalid publication for ${spec.id}`);
    }
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

function restoreNativeArtifact(workspace, cacheRoot, spec, options = {}) {
  assertInputsCurrent(workspace, spec);
  const workspaceRoot = resolvedWorkspaceRoot(workspace);
  const entry = cacheEntry(cacheRoot, spec);
  if (!validCacheEntry(entry, spec)) {
    if (existsSync(entry)) quarantineCacheEntry(entry);
    return { status: "miss", entry };
  }
  const manifest = manifestForEntry(entry);
  for (const outputRoot of spec.outputRoots) {
    workspacePath(workspaceRoot, outputRoot, { allowLeafSymlink: false });
  }
  const currentFiles = snapshot(workspaceRoot, spec.outputRoots).filter(
    ({ type }) => type !== "missing",
  );
  if (JSON.stringify(currentFiles) === JSON.stringify(manifest.files)) {
    assertInputsCurrent(workspaceRoot, spec);
    return { status: "present", entry };
  }
  const temporary = mkdtempSync(join(workspaceRoot, ".sagejs-native-restore-"));
  const transaction = [];
  let committed = false;
  try {
    for (const file of manifest.files) {
      copySnapshotEntry(join(entry, "payload"), temporary, file);
    }
    for (const requestedRoot of spec.outputRoots) {
      const outputRoot = safeRelativePath(requestedRoot);
      const staged = join(temporary, outputRoot);
      if (!existsSync(staged)) {
        throw new Error(`native-cache entry is missing output root ${outputRoot}`);
      }
      const target = workspacePath(workspaceRoot, outputRoot, {
        allowLeafSymlink: false,
      });
      const backup = `${target}.sagejs-cache-backup-${process.pid}-${randomUUID()}`;
      mkdirSync(dirname(target), { recursive: true });
      transaction.push({
        backup,
        backedUp: false,
        installed: false,
        outputRoot,
        staged,
        target,
      });
    }
    assertInputsCurrent(workspaceRoot, spec);
    for (const root of transaction) {
      workspacePath(workspaceRoot, root.outputRoot, {
        allowLeafSymlink: false,
      });
      if (existsSync(root.target)) {
        renameSync(root.target, root.backup);
        root.backedUp = true;
      }
    }
    for (let index = 0; index < transaction.length; index += 1) {
      const root = transaction[index];
      options.beforeCommitRoot?.(index, root);
      renameSync(root.staged, root.target);
      root.installed = true;
    }
    assertInputsCurrent(workspaceRoot, spec);
    committed = true;
  } catch (error) {
    for (const root of [...transaction].reverse()) {
      try {
        if (root.installed && existsSync(root.target)) {
          rmSync(root.target, { recursive: true, force: true });
        }
        if (root.backedUp && existsSync(root.backup)) {
          renameSync(root.backup, root.target);
        }
      } catch (rollbackError) {
        error.rollbackError ??= rollbackError;
      }
    }
    throw error;
  } finally {
    if (!committed) {
      for (const root of transaction) {
        if (existsSync(root.backup) && !existsSync(root.target)) {
          renameSync(root.backup, root.target);
        }
      }
    }
    rmSync(temporary, { recursive: true, force: true });
  }
  for (const root of transaction) {
    if (root.backedUp) rmSync(root.backup, { recursive: true, force: true });
  }
  return { status: "restored", entry };
}

function wait(milliseconds) {
  Atomics.wait(nativeCacheSleep, 0, 0, milliseconds);
}

function readNativeCacheLockOwner(lock) {
  try {
    const owner = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8"));
    if (
      !Number.isInteger(owner.pid) || owner.pid <= 0 ||
      typeof owner.hostname !== "string" || owner.hostname === "" ||
      typeof owner.token !== "string" || owner.token === ""
    ) return null;
    return owner;
  } catch {
    return null;
  }
}

function heartbeatNativeCacheLock(lock, token) {
  const owner = readNativeCacheLockOwner(lock);
  if (owner?.token !== token) {
    throw new Error(`native-cache lock ownership changed: ${lock}`);
  }
  writeFileSync(join(lock, "heartbeat"), `${new Date().toISOString()}${EOL}`);
}

function acquireNativeCacheLock(lock, options = {}) {
  const waitMilliseconds = options.waitMilliseconds ?? 60 * 60 * 1000;
  const staleMilliseconds = options.staleMilliseconds ?? 2 * 60 * 60 * 1000;
  const started = Date.now();
  while (true) {
    const token = randomUUID();
    const candidate = `${lock}.candidate-${process.pid}-${token}`;
    try {
      mkdirSync(candidate, { recursive: false });
      writeFileSync(join(candidate, "owner.json"), `${JSON.stringify({
        hostname: hostname(),
        pid: process.pid,
        started_at: new Date().toISOString(),
        token,
      })}${EOL}`);
      writeFileSync(join(candidate, "heartbeat"), `${new Date().toISOString()}${EOL}`);
      renameSync(candidate, lock);
      return token;
    } catch (error) {
      rmSync(candidate, { recursive: true, force: true });
      if (!existsSync(lock)) throw error;
    }
    const owner = readNativeCacheLockOwner(lock);
    let recover = owner === null;
    if (owner !== null && owner.hostname === hostname()) {
      try {
        process.kill(owner.pid, 0);
        // A positively live local owner is never displaced based on age.
      } catch (error) {
        recover = error.code === "ESRCH";
      }
    } else if (owner !== null) {
      const heartbeat = pathMetadata(join(lock, "heartbeat"));
      recover = heartbeat === null || Date.now() - heartbeat.mtimeMs > staleMilliseconds;
    }
    if (recover) {
      try {
        const stale = `${lock}.stale-${process.pid}-${randomUUID()}`;
        renameSync(lock, stale);
        rmSync(stale, { recursive: true, force: true });
        continue;
      } catch {
        continue;
      }
    }
    if (Date.now() - started > waitMilliseconds) {
      throw new Error(`timed out waiting for native cache lock ${lock}`);
    }
    wait(100);
  }
}

function releaseNativeCacheLock(lock, token) {
  try {
    const owner = readNativeCacheLockOwner(lock);
    if (owner?.token !== token) return;
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
  assertInputsCurrent(workspace, spec);
  const workspaceRoot = resolvedWorkspaceRoot(workspace);
  const restored = restoreNativeArtifact(workspaceRoot, cacheRoot, spec, options);
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
        return restoreNativeArtifact(workspaceRoot, cacheRoot, spec, options);
      }
      throw error;
    }
  }
  try {
    const afterLock = restoreNativeArtifact(workspaceRoot, cacheRoot, spec, options);
    if (["present", "restored"].includes(afterLock.status)) return afterLock;
    // A cache key attests to the toolchain recorded in `spec`. Do not publish
    // an unverified package-local build that may have been produced by an
    // older compiler or a different set of build flags.
    for (const outputRoot of spec.outputRoots) {
      const target = workspacePath(workspaceRoot, outputRoot, {
        allowLeafSymlink: false,
      });
      rmSync(target, {
        recursive: true,
        force: true,
      });
    }
    assertInputsCurrent(workspaceRoot, spec);
    heartbeatNativeCacheLock(lock, lockToken);
    if (typeof options.build === "function") options.build(workspaceRoot, spec);
    else runBuildCommands(workspaceRoot, spec, options.runner);
    assertInputsCurrent(workspaceRoot, spec);
    heartbeatNativeCacheLock(lock, lockToken);
    const publication = publishNativeArtifact(workspaceRoot, cacheRoot, spec);
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
  const results = [];
  for (const packageId of packageIds) {
    if (!nativePackageCacheable(packageId)) {
      results.push({ id: packageId, status: "skipped-custom-prefix" });
      continue;
    }
    for (const spec of selectedNativeSpecs(workspace, [packageId], options)) {
      results.push({
        id: spec.id,
        ...restoreNativeArtifact(workspace, cacheRoot, spec, options),
      });
    }
  }
  return results;
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
