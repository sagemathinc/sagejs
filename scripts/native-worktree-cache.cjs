#!/usr/bin/env node
"use strict";

// Native dependencies and addons are expensive, immutable products of source,
// platform, toolchain, and build options. Keep one verified snapshot in the
// repository's shared Git directory, then provision each worktree with an
// independent copy (a copy-on-write clone where the filesystem supports it)
// or a read-only link for artifacts explicitly declared safe to share.
// Dependency and addon stages have separate keys so a Node ABI or adapter
// change never forces a rebuild of mature static libraries.

const {
  chmodSync,
  constants,
  cpSync,
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
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { git } = require("./parallel-lib.cjs");
const { pnpmInvocation } = require("./pnpm-invocation.cjs");
const { nativeMathBuildProfile } = require("./native-math-profile.cjs");

const nativeCacheSchema = "sagejs.parallel-native-artifact-cache-v1";
const nativeCacheMaintenanceSchema = "sagejs.parallel-native-cache-status-v1";
const nativeCachePackages = new Set(["flint", "fflas", "graph"]);
const nativeCacheArtifactIds = new Set(
  [...nativeCachePackages].flatMap((packageId) => [
    `${packageId}-dependencies`,
    `${packageId}-addon`,
  ]),
);
const nativeCacheSleep = new Int32Array(new SharedArrayBuffer(4));
const nativeCompilerStampSchema = "sagejs.native-compiler-inputs-v1";
const nativeCompilerInputPaths = [
  "bootstrap",
  "package.json",
  "pnpm-lock.yaml",
  "scripts/build-vendor.cjs",
  "tools",
  "tsconfig.json",
];

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
  if (spec.cleanupRoots !== undefined && !Array.isArray(spec.cleanupRoots)) {
    throw new Error(`native-cache ${spec.id} cleanupRoots must be an array`);
  }
  if (
    spec.materialization !== undefined &&
    !["copy", "shared-readonly"].includes(spec.materialization)
  ) {
    throw new Error(
      `invalid native-cache materialization for ${spec.id}: ${spec.materialization}`,
    );
  }
  if (
    process.platform === "win32" &&
    spec.materialization === "shared-readonly"
  ) {
    throw new Error(
      `native-cache ${spec.id} cannot enforce shared read-only storage on Windows`,
    );
  }
  const inputPaths = spec.inputPaths.map(safeRelativePath);
  const outputRoots = spec.outputRoots.map(safeRelativePath);
  const cleanupRoots = (spec.cleanupRoots || []).map(safeRelativePath);
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
  for (const cleanupRoot of cleanupRoots) {
    if (
      inputPaths.some((input) =>
        pathIsWithin(input, cleanupRoot) || pathIsWithin(cleanupRoot, input)
      ) ||
      outputRoots.some((output) =>
        pathIsWithin(output, cleanupRoot) || pathIsWithin(cleanupRoot, output)
      )
    ) {
      throw new Error(
        `native-cache ${spec.id} cleanup root overlaps inputs or outputs: ${cleanupRoot}`,
      );
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
    "SAGEJS_FFLAS_FFPACK_TARBALL",
    "SAGEJS_FLINT_TARBALL",
    "SAGEJS_GMP_TARBALL",
    "SAGEJS_GIVARO_TARBALL",
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
  const mathProfile = stableJson(
    overrides.mathProfile || nativeMathBuildProfile(),
  );
  const commonAddonInputs = [
    ...nativeCompilerInputPaths,
    "scripts/build-ffi-host-adapter.cjs",
    "ffi/abi-types.json",
  ];
  const descriptions = {
    flint: {
      dependencyInputs: [
        "scripts/native-math-profile.cjs",
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
        "ffi/flint.ffi.json",
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
      requiredDependencyOutputs: process.platform === "win32"
        ? [
          `${dependencyPrefix("flint")}/lib/flint.lib`,
          `${dependencyPrefix("flint")}/lib/openblas.lib`,
        ]
        : [
          `${dependencyPrefix("flint")}/lib/libflint.a`,
          `${dependencyPrefix("flint")}/lib/libgmp.a`,
          `${dependencyPrefix("flint")}/lib/libopenblas.a`,
          `${dependencyPrefix("flint")}/.sagejs-flint-dependencies.json`,
        ],
    },
    fflas: {
      dependencyMaterialization: process.platform === "win32"
        ? "copy"
        : "shared-readonly",
      dependencyInputs: [
        "scripts/native-math-profile.cjs",
        "packages/fflas/package.json",
        "packages/fflas/scripts/build-deps.cjs",
        "packages/fflas/include/sagejs/fflas_matrix_ffi.h",
        "packages/flint/scripts/build-deps.cjs",
      ],
      addonInputs: [
        "packages/fflas/package.json",
        "packages/fflas/include",
        "packages/fflas/generated/ffi_host.py",
        "packages/fflas/scripts/native-prefix.cjs",
        "ffi/fflas.ffi.py",
        "ffi/fflas.ffi.json",
        ...commonAddonInputs,
      ],
      addonOutputs: [
        "packages/fflas/build/generated-ffi",
      ],
      requiredAddonOutputs: [
        "packages/fflas/build/generated-ffi/sagejs_fflas_ffi.node",
        "packages/fflas/build/generated-ffi/manifest.json",
      ],
      requiredDependencyOutputs: process.platform === "win32"
        ? [
          `${dependencyPrefix("fflas")}/.sagejs-fflas-dependencies.json`,
          `${dependencyPrefix("fflas")}/include/sagejs/fflas_matrix_ffi.h`,
        ]
        : [
          `${dependencyPrefix("fflas")}/lib/libgmpxx.a`,
          `${dependencyPrefix("fflas")}/lib/libgivaro.a`,
          `${dependencyPrefix("fflas")}/lib/libopenblas.a`,
          `${dependencyPrefix("fflas")}/.sagejs-fflas-dependencies.json`,
        ],
      addonBuildCommands: [
        ["pnpm", ["--dir", "packages/fflas", "run", "build:ffi"]],
      ],
      dependencyBuildCommands: [
        ["node", ["packages/fflas/scripts/build-deps.cjs", "--cache-build"]],
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
        "ffi/igraph.ffi.json",
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
      requiredDependencyOutputs: [
        process.platform === "win32"
          ? `${dependencyPrefix("graph")}/lib/igraph.lib`
          : `${dependencyPrefix("graph")}/lib/libigraph.a`,
        `${dependencyPrefix("graph")}/.sagejs-igraph-1.0.1`,
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
      mathProfile: ["flint", "fflas"].includes(packageId)
        ? mathProfile
        : null,
      materialization: description.dependencyMaterialization,
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
        mathProfile: ["flint", "fflas"].includes(packageId)
          ? mathProfile
          : null,
        inputPaths: description.dependencyInputs,
        inputs: dependencyInputs,
        outputRoots: [dependencyPrefix(packageId)],
        cleanupRoots: [
          `packages/${packageId}/.native/downloads`,
          `packages/${packageId}/.native/sources`,
        ],
        requiredOutputs: description.requiredDependencyOutputs,
        buildCommands: description.dependencyBuildCommands || [
          ["pnpm", ["--dir", `packages/${packageId}`, "run", "build:deps"]],
        ],
        materialization: description.dependencyMaterialization || "copy",
      },
      {
        id: `${packageId}-addon`,
        packageId,
        stage: "addon",
        key: addonKey,
        identity,
        mathProfile: ["flint", "fflas"].includes(packageId)
          ? mathProfile
          : null,
        inputPaths: description.addonInputs,
        inputs: addonInputs,
        outputRoots: description.addonOutputs,
        requiredOutputs: description.requiredAddonOutputs,
        buildCommands: description.addonBuildCommands || [
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

function materializationForSpec(spec) {
  return spec.materialization || "copy";
}

function generationForSpec(spec) {
  if (!spec.packageId || !spec.stage) return null;
  const identity = spec.stage === "dependencies"
    ? spec.identity?.native ?? spec.identity
    : spec.identity;
  return stableJson({
    identity_hash: identity === undefined
      ? null
      : sha256(JSON.stringify(stableJson(identity))),
    math_profile: spec.mathProfile
      ? {
        effective: spec.mathProfile.effectiveProfile ?? null,
        fingerprint: spec.mathProfile.fingerprint ?? null,
        requested: spec.mathProfile.requestedProfile ?? null,
      }
      : null,
    package_id: spec.packageId,
    stage: spec.stage,
  });
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
      (manifest.materialization || "copy") !== materializationForSpec(spec) ||
      (manifest.generation !== undefined &&
        JSON.stringify(manifest.generation) !==
          JSON.stringify(generationForSpec(spec))) ||
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
    if (
      materializationForSpec(spec) === "shared-readonly" &&
      symlinks.size !== 0
    ) return false;
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
    if (
      materializationForSpec(spec) === "shared-readonly" &&
      !treeIsReadonly(join(entry, "payload"))
    ) return false;
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

function makeTreeWritable(path) {
  const metadata = pathMetadata(path);
  if (metadata === null || metadata.isSymbolicLink()) return;
  chmodSync(path, metadata.mode | (metadata.isDirectory() ? 0o700 : 0o200));
  if (metadata.isDirectory()) {
    for (const name of readdirSync(path)) makeTreeWritable(join(path, name));
  }
}

function treeIsReadonly(path) {
  const metadata = pathMetadata(path);
  if (metadata === null) return false;
  if (metadata.isSymbolicLink()) return true;
  if ((metadata.mode & 0o222) !== 0) return false;
  return !metadata.isDirectory() || readdirSync(path).every(
    (name) => treeIsReadonly(join(path, name)),
  );
}

function freezeSharedPayload(path) {
  const metadata = pathMetadata(path);
  if (metadata === null || metadata.isSymbolicLink()) return;
  if (metadata.isDirectory()) {
    for (const name of readdirSync(path)) freezeSharedPayload(join(path, name));
  }
  chmodSync(path, metadata.mode & ~0o222);
}

function removeCacheTree(path) {
  if (!existsSync(path)) return;
  makeTreeWritable(path);
  rmSync(path, { recursive: true, force: true });
}

function quarantineCacheEntry(entry) {
  if (!existsSync(entry)) return;
  const quarantine = `${entry}.corrupt-${process.pid}-${randomUUID()}`;
  try {
    renameSync(entry, quarantine);
    removeCacheTree(quarantine);
  } catch {
    // Another publisher or reader won the race. Treat this lookup as a miss.
  }
}

function sameNativeCachePath(left, right) {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function assertExactNativeCacheRoot(
  workspace,
  requestedRoot,
  expectedRoot = defaultNativeCacheRoot(workspace),
) {
  if (typeof requestedRoot !== "string" || requestedRoot === "") {
    throw new Error("native-cache maintenance needs an absolute cache root");
  }
  if (!isAbsolute(requestedRoot) || resolve(requestedRoot) !== requestedRoot) {
    throw new Error(`native-cache maintenance root is not exact: ${requestedRoot}`);
  }
  const cacheRoot = requestedRoot;
  const expected = resolve(expectedRoot);
  if (!sameNativeCachePath(cacheRoot, expected)) {
    throw new Error(
      `native-cache maintenance refused unexpected root: ${cacheRoot}`,
    );
  }
  const filesystemRoot = parse(cacheRoot).root;
  const workspaceRoot = resolvedWorkspaceRoot(workspace);
  const broadRoots = new Set([
    filesystemRoot,
    resolve(homedir()),
    workspaceRoot,
  ]);
  if (
    broadRoots.has(cacheRoot) ||
    dirname(cacheRoot) === filesystemRoot ||
    basename(cacheRoot) === ""
  ) {
    throw new Error(`native-cache maintenance refused broad root: ${cacheRoot}`);
  }
  let current = filesystemRoot;
  const suffix = relative(filesystemRoot, cacheRoot);
  for (const component of suffix.split(sep).filter(Boolean)) {
    current = join(current, component);
    const metadata = pathMetadata(current);
    if (metadata === null) break;
    if (metadata.isSymbolicLink()) {
      throw new Error(
        `native-cache maintenance root has a symlinked component: ${current}`,
      );
    }
    if (!metadata.isDirectory()) {
      throw new Error(
        `native-cache maintenance root has a non-directory component: ${current}`,
      );
    }
  }
  return cacheRoot;
}

function cacheTreeUsage(path) {
  const metadata = pathMetadata(path);
  if (metadata === null) return { bytes: 0, files: 0, symlinks: 0 };
  if (metadata.isSymbolicLink()) {
    return { bytes: metadata.size, files: 0, symlinks: 1 };
  }
  if (metadata.isFile()) {
    return { bytes: metadata.size, files: 1, symlinks: 0 };
  }
  if (!metadata.isDirectory()) {
    return { bytes: metadata.size, files: 1, symlinks: 0 };
  }
  const result = { bytes: 0, files: 0, symlinks: 0 };
  for (const name of readdirSync(path)) {
    const child = cacheTreeUsage(join(path, name));
    result.bytes += child.bytes;
    result.files += child.files;
    result.symlinks += child.symlinks;
  }
  return result;
}

function inspectCacheGeneration(category, id, key) {
  const issues = [];
  const entry = join(category, key);
  const metadata = pathMetadata(entry);
  if (metadata === null || !metadata.isDirectory() || metadata.isSymbolicLink()) {
    issues.push(`${id}/${key} is not an ordinary generation directory`);
    return { entry, issues, manifest: null };
  }
  const names = readdirSync(entry).sort();
  const unexpected = names.filter((name) =>
    name !== "manifest.json" && name !== "payload"
  );
  if (unexpected.length !== 0) {
    issues.push(`${id}/${key} has unexpected entries: ${unexpected.join(", ")}`);
  }
  const manifestMetadata = pathMetadata(join(entry, "manifest.json"));
  const payloadMetadata = pathMetadata(join(entry, "payload"));
  if (
    manifestMetadata === null || !manifestMetadata.isFile() ||
    manifestMetadata.isSymbolicLink()
  ) {
    issues.push(`${id}/${key} has no ordinary manifest.json`);
  }
  if (
    payloadMetadata === null || !payloadMetadata.isDirectory() ||
    payloadMetadata.isSymbolicLink()
  ) {
    issues.push(`${id}/${key} has no ordinary payload directory`);
  }
  const manifest = manifestMetadata?.isFile()
    ? manifestForEntry(entry)
    : null;
  if (
    manifest?.schema !== nativeCacheSchema ||
    manifest.id !== id ||
    manifest.key !== key ||
    !Array.isArray(manifest.output_roots) ||
    !Array.isArray(manifest.files)
  ) {
    issues.push(`${id}/${key} has an invalid native-cache manifest`);
  } else {
    try {
      const roots = manifest.output_roots.map(safeRelativePath);
      const declared = new Map();
      for (const file of manifest.files) {
        const path = safeRelativePath(file?.path);
        if (declared.has(path)) throw new Error(`duplicate manifest path ${path}`);
        declared.set(path, file);
        if (!roots.some((root) => pathIsWithin(path, root))) {
          throw new Error(`manifest path is outside output roots: ${path}`);
        }
        if (!["directory", "file", "symlink"].includes(file.type)) {
          throw new Error(`unknown manifest entry type at ${path}`);
        }
      }
      const actual = snapshot(join(entry, "payload"), roots);
      if (actual.length !== declared.size) {
        throw new Error("payload entries do not match the manifest");
      }
      for (const file of actual) {
        const expected = declared.get(file.path);
        if (
          expected?.type !== file.type ||
          (file.type === "file" &&
            (expected.size !== file.size || expected.sha256 !== file.sha256)) ||
          (file.type === "symlink" && expected.target !== file.target)
        ) {
          throw new Error(`payload differs from the manifest at ${file.path}`);
        }
      }
    } catch (error) {
      issues.push(`${id}/${key} is unsafe: ${error.message || error}`);
    }
  }
  return { entry, issues, manifest };
}

function protectionKey(id, key) {
  return `${id}/${key}`;
}

function discoverNativeCacheProtections(workspace, cacheRoot, options = {}) {
  const reasons = new Map();
  const issues = [];
  const add = (id, key, reason) => {
    if (!nativeCacheArtifactIds.has(id) || !/^[a-f0-9]{64}$/.test(key)) return;
    const identity = protectionKey(id, key);
    if (!reasons.has(identity)) reasons.set(identity, new Set());
    reasons.get(identity).add(reason);
  };
  const currentSpecs = options.currentSpecs || nativeArtifactSpecs(workspace);
  for (const spec of currentSpecs) add(spec.id, spec.key, "current-selected");
  for (const item of options.protectedEntries || []) {
    add(item.id, item.key, item.reason || "explicitly-protected");
  }
  const workspaces = options.workspaces || [workspace];
  for (const requestedWorkspace of workspaces) {
    const workspaceMetadata = pathMetadata(resolve(requestedWorkspace));
    if (workspaceMetadata === null) continue;
    let root;
    try {
      root = resolvedWorkspaceRoot(requestedWorkspace);
    } catch (error) {
      issues.push(
        `cannot validate worktree ${requestedWorkspace}: ${error.message || error}`,
      );
      continue;
    }
    for (const spec of currentSpecs) {
      if (!nativeCacheArtifactIds.has(spec.id)) continue;
      for (const outputRoot of spec.outputRoots || []) {
        let output;
        try {
          output = workspacePath(root, outputRoot, { allowLeafSymlink: true });
        } catch (error) {
          issues.push(
            `cannot validate installed output ${root}/${outputRoot}: ` +
              `${error.message || error}`,
          );
          continue;
        }
        const metadata = pathMetadata(output);
        if (metadata === null || !metadata.isSymbolicLink()) continue;
        const target = resolve(dirname(output), readlinkSync(output));
        const targetRelative = relative(cacheRoot, target);
        const components = targetRelative.split(sep);
        if (
          targetRelative.startsWith("..") || isAbsolute(targetRelative) ||
          components.length < 4 ||
          components[0] !== spec.id ||
          !/^[a-f0-9]{64}$/.test(components[1]) ||
          components[2] !== "payload" ||
          target !== join(cacheRoot, spec.id, components[1], "payload", outputRoot)
        ) {
          continue;
        }
        add(spec.id, components[1], `installed-link:${root}`);
      }
    }
  }
  return { currentSpecs, issues, reasons };
}

function nativeCacheStatus(workspace, requestedRoot, options = {}) {
  const cacheRoot = assertExactNativeCacheRoot(
    workspace,
    requestedRoot,
    options.expectedRoot,
  );
  const protection = discoverNativeCacheProtections(
    workspace,
    cacheRoot,
    options,
  );
  const selectedGenerations = protection.currentSpecs
    .filter(({ id, key }) =>
      nativeCacheArtifactIds.has(id) && /^[a-f0-9]{64}$/.test(key)
    )
    .map(({ id, key, mathProfile }) => ({
      id,
      key,
      math_profile: mathProfile
        ? {
          effective: mathProfile.effectiveProfile ?? null,
          fingerprint: mathProfile.fingerprint ?? null,
          requested: mathProfile.requestedProfile ?? null,
        }
        : null,
    }));
  const issues = [...protection.issues];
  const artifacts = [];
  const totals = {
    bytes: 0,
    files: 0,
    generations: 0,
    locks: 0,
    obsolete_bytes: 0,
    obsolete_generations: 0,
    retained_bytes: 0,
    retained_generations: 0,
    symlinks: 0,
  };
  const rootMetadata = pathMetadata(cacheRoot);
  if (rootMetadata === null) {
    return {
      schema: nativeCacheMaintenanceSchema,
      cache_root: cacheRoot,
      safe: issues.length === 0,
      issues,
      selected_generations: selectedGenerations,
      totals,
      artifacts,
    };
  }
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error(`native-cache maintenance root is not an ordinary directory: ${cacheRoot}`);
  }
  for (const name of readdirSync(cacheRoot).sort()) {
    if (!nativeCacheArtifactIds.has(name)) {
      issues.push(`unexpected cache-root entry: ${name}`);
      continue;
    }
    const category = join(cacheRoot, name);
    const categoryMetadata = pathMetadata(category);
    if (
      categoryMetadata === null || !categoryMetadata.isDirectory() ||
      categoryMetadata.isSymbolicLink()
    ) {
      issues.push(`${name} is not an ordinary artifact directory`);
      continue;
    }
    const names = readdirSync(category).sort();
    const lockedKeys = new Set();
    let lockBytes = 0;
    for (const child of names) {
      const match = child.match(/^([a-f0-9]{64})\.lock$/);
      if (!match) continue;
      const lock = join(category, child);
      const metadata = pathMetadata(lock);
      if (metadata === null || !metadata.isDirectory() || metadata.isSymbolicLink()) {
        issues.push(`${name}/${child} is not an ordinary lock directory`);
        continue;
      }
      lockedKeys.add(match[1]);
      const usage = cacheTreeUsage(lock);
      lockBytes += usage.bytes;
      totals.bytes += usage.bytes;
      totals.files += usage.files;
      totals.symlinks += usage.symlinks;
      totals.locks += 1;
    }
    const generations = [];
    for (const key of names) {
      if (/^[a-f0-9]{64}\.lock$/.test(key)) continue;
      if (!/^[a-f0-9]{64}$/.test(key)) {
        issues.push(`unexpected artifact entry: ${name}/${key}`);
        continue;
      }
      const inspected = inspectCacheGeneration(category, name, key);
      issues.push(...inspected.issues);
      const usage = cacheTreeUsage(inspected.entry);
      const reasons = new Set(
        protection.reasons.get(protectionKey(name, key)) || [],
      );
      if (lockedKeys.has(key)) reasons.add("build-lock");
      if (inspected.issues.length !== 0) reasons.add("unsafe-layout");
      const retained = reasons.size !== 0;
      const metadata = pathMetadata(inspected.entry);
      const generation = {
        bytes: usage.bytes,
        files: usage.files,
        id: name,
        identity_hash: inspected.manifest?.generation?.identity_hash ?? null,
        key,
        math_profile: inspected.manifest?.generation?.math_profile ?? null,
        modified_at: metadata
          ? new Date(metadata.mtimeMs).toISOString()
          : null,
        modified_ms: metadata?.mtimeMs ?? 0,
        reasons: [...reasons].sort(),
        state: retained ? "retained" : "obsolete",
        symlinks: usage.symlinks,
      };
      generations.push(generation);
      totals.bytes += usage.bytes;
      totals.files += usage.files;
      totals.generations += 1;
      totals.symlinks += usage.symlinks;
      if (retained) {
        totals.retained_bytes += usage.bytes;
        totals.retained_generations += 1;
      } else {
        totals.obsolete_bytes += usage.bytes;
        totals.obsolete_generations += 1;
      }
    }
    artifacts.push({
      bytes: generations.reduce((sum, generation) => sum + generation.bytes, 0) +
        lockBytes,
      generations,
      id: name,
      locks: lockedKeys.size,
    });
  }
  return {
    schema: nativeCacheMaintenanceSchema,
    cache_root: cacheRoot,
    safe: issues.length === 0,
    issues,
    selected_generations: selectedGenerations,
    totals,
    artifacts,
  };
}

function validateCleanupLimit(name, value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`native-cache cleanup ${name} must be a positive integer`);
  }
  return value;
}

function removeObsoleteGeneration(workspace, cacheRoot, generation, options) {
  options.beforeRemove?.(generation);
  assertExactNativeCacheRoot(
    workspace,
    cacheRoot,
    options.expectedRoot ?? cacheRoot,
  );
  if (
    !nativeCacheArtifactIds.has(generation.id) ||
    !/^[a-f0-9]{64}$/.test(generation.key)
  ) {
    throw new Error("native-cache cleanup refused an invalid generation identity");
  }
  const category = join(cacheRoot, generation.id);
  const entry = join(category, generation.key);
  const categoryMetadata = pathMetadata(category);
  const entryMetadata = pathMetadata(entry);
  if (entryMetadata === null) return { ...generation, result: "already-absent" };
  if (
    categoryMetadata === null || !categoryMetadata.isDirectory() ||
    categoryMetadata.isSymbolicLink() ||
    !entryMetadata.isDirectory() || entryMetadata.isSymbolicLink()
  ) {
    throw new Error(
      `native-cache cleanup refused changed path ${generation.id}/${generation.key}`,
    );
  }
  if (pathMetadata(`${entry}.lock`) !== null) {
    return { ...generation, result: "new-lock" };
  }
  const protection = discoverNativeCacheProtections(workspace, cacheRoot, options);
  if (protection.issues.length !== 0) {
    throw new Error(`native-cache cleanup protection check failed: ${protection.issues.join("; ")}`);
  }
  const newReasons = protection.reasons.get(
    protectionKey(generation.id, generation.key),
  );
  if (newReasons?.size) {
    return {
      ...generation,
      reasons: [...newReasons].sort(),
      result: "new-protection",
    };
  }
  const inspected = inspectCacheGeneration(
    category,
    generation.id,
    generation.key,
  );
  if (inspected.issues.length !== 0) {
    throw new Error(
      `native-cache cleanup generation changed: ${inspected.issues.join("; ")}`,
    );
  }
  const temporary = join(
    category,
    `.cleanup-${generation.key}-${process.pid}-${randomUUID()}`,
  );
  try {
    renameSync(entry, temporary);
  } catch (error) {
    if (error.code === "ENOENT") return { ...generation, result: "already-absent" };
    throw error;
  }
  removeCacheTree(temporary);
  return { ...generation, result: "removed" };
}

function cleanupNativeCache(workspace, requestedRoot, options = {}) {
  const maxGenerations = validateCleanupLimit(
    "maxGenerations",
    options.maxGenerations ?? 8,
  );
  const maxBytes = validateCleanupLimit(
    "maxBytes",
    options.maxBytes ?? 20 * 1024 * 1024 * 1024,
  );
  const before = nativeCacheStatus(workspace, requestedRoot, options);
  if (!before.safe) {
    throw new Error(
      `native-cache cleanup refused unsafe layout: ${before.issues.join("; ")}`,
    );
  }
  const eligible = before.artifacts.flatMap(({ generations }) => generations)
    .filter(({ state }) => state === "obsolete")
    .sort((left, right) =>
      left.modified_ms - right.modified_ms ||
      left.id.localeCompare(right.id) ||
      left.key.localeCompare(right.key)
    );
  const selected = [];
  let selectedBytes = 0;
  for (const generation of eligible) {
    if (selected.length >= maxGenerations) break;
    if (selectedBytes + generation.bytes > maxBytes) continue;
    selected.push(generation);
    selectedBytes += generation.bytes;
  }
  const outcomes = options.apply
    ? selected.map((generation) =>
      removeObsoleteGeneration(workspace, before.cache_root, generation, options)
    )
    : [];
  const removed = outcomes.filter(({ result }) => result === "removed");
  const skipped = outcomes.filter(({ result }) => result !== "removed");
  const after = options.apply
    ? nativeCacheStatus(workspace, before.cache_root, options)
    : before;
  return {
    schema: nativeCacheMaintenanceSchema,
    action: "cleanup",
    applied: options.apply === true,
    cache_root: before.cache_root,
    limits: {
      max_bytes: maxBytes,
      max_generations: maxGenerations,
    },
    before: before.totals,
    eligible: {
      bytes: eligible.reduce((sum, generation) => sum + generation.bytes, 0),
      generations: eligible.length,
    },
    selected: {
      bytes: selectedBytes,
      generations: selected.map(({ id, key, bytes, modified_at }) => ({
        bytes,
        id,
        key,
        modified_at,
      })),
    },
    removed: {
      bytes: removed.reduce((sum, generation) => sum + generation.bytes, 0),
      generations: removed.map(({ id, key, bytes }) => ({ bytes, id, key })),
    },
    skipped: skipped.map(({ id, key, result, reasons }) => ({
      id,
      key,
      reasons,
      result,
    })),
    after: after.totals,
  };
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
      materialization: materializationForSpec(spec),
      generation: generationForSpec(spec),
      files,
    };
    writeFileSync(join(temporary, "manifest.json"), `${JSON.stringify(manifest, null, 2)}${EOL}`);
    if (materializationForSpec(spec) === "shared-readonly") {
      freezeSharedPayload(join(temporary, "payload"));
    }
    assertInputsCurrent(workspaceRoot, spec);
    if (!validCacheEntry(temporary, spec)) {
      throw new Error(`native-cache refused invalid publication for ${spec.id}`);
    }
    try {
      renameSync(temporary, entry);
    } catch (error) {
      if (validCacheEntry(entry, spec)) {
        removeCacheTree(temporary);
        return { status: "concurrent-publication", entry };
      }
      throw error;
    }
    return { status: "published", entry };
  } catch (error) {
    removeCacheTree(temporary);
    throw error;
  }
}

function sharedOutputRootsPresent(workspaceRoot, entry, spec) {
  if (materializationForSpec(spec) !== "shared-readonly") return false;
  return spec.outputRoots.every((outputRoot) => {
    const target = workspacePath(workspaceRoot, outputRoot);
    const metadata = pathMetadata(target);
    if (metadata === null || !metadata.isSymbolicLink()) return false;
    const actual = resolve(dirname(target), readlinkSync(target));
    const expected = resolve(entry, "payload", outputRoot);
    return actual === expected;
  });
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
    workspacePath(workspaceRoot, outputRoot);
  }
  if (sharedOutputRootsPresent(workspaceRoot, entry, spec)) {
    assertInputsCurrent(workspaceRoot, spec);
    return { status: "present", entry };
  }
  if (materializationForSpec(spec) === "copy") {
    const currentFiles = snapshot(workspaceRoot, spec.outputRoots).filter(
      ({ type }) => type !== "missing",
    );
    if (JSON.stringify(currentFiles) === JSON.stringify(manifest.files)) {
      assertInputsCurrent(workspaceRoot, spec);
      return { status: "present", entry };
    }
  }
  const temporary = mkdtempSync(join(workspaceRoot, ".sagejs-native-restore-"));
  const transaction = [];
  let committed = false;
  try {
    if (materializationForSpec(spec) === "shared-readonly") {
      for (const outputRoot of spec.outputRoots) {
        const staged = join(temporary, outputRoot);
        mkdirSync(dirname(staged), { recursive: true });
        symlinkSync(
          join(entry, "payload", outputRoot),
          staged,
          process.platform === "win32" ? "junction" : "dir",
        );
      }
    } else {
      for (const file of manifest.files) {
        copySnapshotEntry(join(entry, "payload"), temporary, file);
      }
    }
    for (const requestedRoot of spec.outputRoots) {
      const outputRoot = safeRelativePath(requestedRoot);
      const staged = join(temporary, outputRoot);
      if (!existsSync(staged)) {
        throw new Error(`native-cache entry is missing output root ${outputRoot}`);
      }
      const target = workspacePath(workspaceRoot, outputRoot, {
        allowLeafSymlink: true,
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
        allowLeafSymlink: true,
      });
      if (pathMetadata(root.target) !== null) {
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
        if (root.installed && pathMetadata(root.target) !== null) {
          rmSync(root.target, { recursive: true, force: true });
        }
        if (root.backedUp && pathMetadata(root.backup) !== null) {
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
        if (
          pathMetadata(root.backup) !== null &&
          pathMetadata(root.target) === null
        ) {
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

function nativeCacheProcessIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (process.platform === "linux") {
    try {
      const boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8").trim();
      const afterCommand = stat.slice(stat.lastIndexOf(") ") + 2).split(/\s+/);
      const startTicks = afterCommand[19];
      if (boot && startTicks) return `${boot}:${startTicks}`;
    } catch {
      return null;
    }
  }
  if (process.platform !== "win32") {
    const result = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const start = result.status === 0 ? result.stdout.trim() : "";
    return start ? `${hostname()}:${pid}:${start}` : null;
  }
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`,
  ], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const start = result.status === 0 ? result.stdout.trim() : "";
  return start ? `${hostname()}:${pid}:${start}` : null;
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
        process_identity: nativeCacheProcessIdentity(process.pid),
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
        const currentIdentity = nativeCacheProcessIdentity(owner.pid);
        if (
          owner.process_identity !== null &&
          owner.process_identity !== undefined &&
          currentIdentity !== owner.process_identity
        ) {
          recover = true;
        }
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

function startNativeCacheHeartbeat(lock, token, options = {}) {
  const interval = options.heartbeatMilliseconds ?? 30_000;
  if (!Number.isInteger(interval) || interval <= 0) {
    throw new Error(`native-cache heartbeat interval must be positive: ${interval}`);
  }
  const identity = nativeCacheProcessIdentity(process.pid);
  if (identity === null) {
    // The owner still has PID liveness and before/after-build heartbeats, but
    // platforms without a process birth identity cannot safely run a helper.
    return () => {};
  }
  const child = spawn(process.execPath, [
    join(__dirname, "native-cache-heartbeat.cjs"),
    lock,
    token,
    String(process.pid),
    identity,
    String(interval),
  ], {
    stdio: "ignore",
    windowsHide: true,
  });
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    child.kill();
  };
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

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function nativeCompilerStamp(workspace) {
  return stableJson({
    arch: process.arch,
    input_hash: snapshotHash(snapshot(workspace, nativeCompilerInputPaths, {
      rejectSymlinks: true,
    })),
    node: process.versions.node,
    platform: process.platform,
    schema: nativeCompilerStampSchema,
  });
}

function ensureNativeCompiler(workspace, options = {}) {
  const stampPath = join(workspace, "dist", ".sagejs-native-compiler.json");
  const required = [
    join(workspace, "dist", "compiler", "compiler.js"),
    join(workspace, "dist", "tools", "compiler.js"),
    join(workspace, "dist", "tools", "python", "compiler-frontend.js"),
    join(workspace, "dist", "vendor", "web-tree-sitter.wasm"),
    join(workspace, "dist", "vendor", "tree-sitter-python.wasm"),
    join(workspace, "dist", "vendor", "tree-sitter-sage.wasm"),
  ];
  const compiler = required[1];
  const expectedStamp = nativeCompilerStamp(workspace);
  const actualStamp = readJsonFile(stampPath);
  if (
    required.every((path) => existsSync(path)) &&
    JSON.stringify(actualStamp) === JSON.stringify(expectedStamp)
  ) {
    return { status: "present", compiler };
  }
  if (typeof options.buildCompiler === "function") {
    options.buildCompiler(workspace, required);
  } else {
    mkdirSync(join(workspace, "dist", "compiler"), { recursive: true });
    cpSync(
      join(workspace, "bootstrap"),
      join(workspace, "dist", "compiler"),
      { recursive: true },
    );
    runCommand(process.execPath, [
      join(workspace, "node_modules", "typescript", "bin", "tsc"),
      "--project",
      join(workspace, "tsconfig.json"),
    ], workspace);
    runCommand(process.execPath, [
      join(workspace, "scripts", "build-vendor.cjs"),
      "--compiler",
    ], workspace);
  }
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length !== 0) {
    throw new Error(
      "native-cache addon preparation requires the compiled Python frontend; " +
        `the compiler build omitted ${missing.join(", ")}`,
    );
  }
  mkdirSync(dirname(stampPath), { recursive: true });
  writeFileSync(stampPath, `${JSON.stringify(expectedStamp, null, 2)}${EOL}`);
  return { status: "built", compiler };
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
  const stopHeartbeat = startNativeCacheHeartbeat(lock, lockToken, options);
  try {
    const afterLock = restoreNativeArtifact(workspaceRoot, cacheRoot, spec, options);
    if (["present", "restored"].includes(afterLock.status)) return afterLock;
    // A cache key attests to the toolchain recorded in `spec`. Do not publish
    // an unverified package-local build that may have been produced by an
    // older compiler or a different set of build flags.
    for (const outputRoot of spec.outputRoots) {
      const target = workspacePath(workspaceRoot, outputRoot, {
        allowLeafSymlink: true,
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
    if (materializationForSpec(spec) === "shared-readonly") {
      const linked = restoreNativeArtifact(
        workspaceRoot,
        cacheRoot,
        spec,
        options,
      );
      if (linked.status !== "restored") {
        throw new Error(`native-cache failed to link shared artifact ${spec.id}`);
      }
    }
    for (const cleanupRoot of spec.cleanupRoots || []) {
      const target = workspacePath(workspaceRoot, cleanupRoot, {
        allowLeafSymlink: false,
      });
      rmSync(target, { recursive: true, force: true });
    }
    return { status: "built", entry: publication.entry };
  } finally {
    stopHeartbeat();
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
  if (process.env[`SAGEJS_${packageId.toUpperCase()}_PREFIX`] !== undefined) {
    return false;
  }
  // FFLAS copies the exact OpenBLAS archive selected by the FLINT prefix.
  // An externally managed FLINT prefix has no content identity in this cache.
  return packageId !== "fflas" || process.env.SAGEJS_FLINT_PREFIX === undefined;
}

function prepareNativePackages(workspace, packageIds, options = {}) {
  const cacheRoot = options.cacheRoot || defaultNativeCacheRoot(workspace);
  const results = [];
  const preparedSpecs = new Set();
  const prepareSpec = (spec) => {
    if (preparedSpecs.has(spec.id)) return;
    if (spec.stage === "addon") ensureNativeCompiler(workspace, options);
    results.push({
      id: spec.id,
      ...prepareNativeArtifact(workspace, cacheRoot, spec, options),
    });
    preparedSpecs.add(spec.id);
  };
  for (const packageId of packageIds) {
    if (packageId === "fflas" && nativePackageCacheable("flint")) {
      const flintPrerequisites = selectedNativeSpecs(
        workspace,
        ["flint"],
        options,
      );
      for (const prerequisite of flintPrerequisites) prepareSpec(prerequisite);
    }
    if (!nativePackageCacheable(packageId)) {
      ensureNativeCompiler(workspace, options);
      runCommand("pnpm", ["--dir", `packages/${packageId}`, "build"], workspace);
      results.push({ id: packageId, status: "built-uncached-custom-prefix" });
      continue;
    }
    for (const spec of selectedNativeSpecs(workspace, [packageId], options)) {
      prepareSpec(spec);
    }
  }
  return results;
}

function prepareNativeDependencies(workspace, packageIds, options = {}) {
  const cacheRoot = options.cacheRoot || defaultNativeCacheRoot(workspace);
  const results = [];
  for (const packageId of packageIds) {
    if (!nativePackageCacheable(packageId)) {
      results.push({ id: packageId, status: "skipped-custom-prefix" });
      continue;
    }
    for (const spec of selectedNativeSpecs(workspace, [packageId], options)) {
      if (spec.stage !== "dependencies") continue;
      results.push({
        id: spec.id,
        ...prepareNativeArtifact(workspace, cacheRoot, spec, options),
      });
    }
  }
  return results;
}

function restoreNativeDependencies(workspace, packageIds, options = {}) {
  const cacheRoot = options.cacheRoot || defaultNativeCacheRoot(workspace);
  const results = [];
  for (const packageId of packageIds) {
    if (!nativePackageCacheable(packageId)) {
      results.push({ id: packageId, status: "skipped-custom-prefix" });
      continue;
    }
    for (const spec of selectedNativeSpecs(workspace, [packageId], options)) {
      if (spec.stage !== "dependencies") continue;
      results.push({
        id: spec.id,
        ...restoreNativeArtifact(workspace, cacheRoot, spec, options),
      });
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
  assertExactNativeCacheRoot,
  cleanupNativeCache,
  defaultNativeCacheRoot,
  discoverNativeCacheProtections,
  ensureNativeCompiler,
  nativeArtifactSpecs,
  nativeCacheArtifactIds,
  nativeCachePackages,
  nativeCacheProcessIdentity,
  nativeCacheStatus,
  prepareNativeArtifact,
  prepareNativeDependencies,
  prepareNativePackages,
  publishNativeArtifact,
  restoreNativeArtifact,
  restoreNativeDependencies,
  restoreNativePackages,
  snapshot,
  validCacheEntry,
};
