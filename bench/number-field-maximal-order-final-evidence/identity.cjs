"use strict";

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const os = require("node:os");
const { relative, resolve } = require("node:path");

const ROOT = resolve(__dirname, "../..");

const NUMBER_FIELD_SOURCE_DIRECTORY = "src/lib/sagejs/number_fields";
const RELEVANT_SOURCES = Object.freeze([
  ...readdirSync(resolve(ROOT, NUMBER_FIELD_SOURCE_DIRECTORY))
    .filter((name) => name.endsWith(".py"))
    .sort()
    .map((name) => `${NUMBER_FIELD_SOURCE_DIRECTORY}/${name}`),
  "src/baselib/number_fields.py",
  "src/lib/sagejs/kernels/matrix/word_prime_krylov.py",
  "ffi/flint.ffi.py",
  "ffi/flint.ffi.json",
  "packages/flint/generated/ffi_host.py",
  "packages/flint/include/sagejs/number_field_analysis_resource_ffi.h",
  "packages/flint/include/sagejs/number_field_order_ffi.h",
  "packages/flint/include/sagejs/number_field_order_resource_ffi.h",
  "architecture/native-kernels.json",
  "test/fixtures/number-field-maximal-order-corpus.json",
]);

const RELEVANT_ARTIFACTS = Object.freeze([
  "packages/flint/build/Release/sagejs_flint.node",
  "packages/flint/build/generated-ffi/sagejs_flint_ffi.node",
  "packages/flint/build/generated-ffi/manifest.json",
  "dist/tools/kernel.js",
  "dist/native-kernels/index.json",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function git(args) {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function fileIdentity(path) {
  const absolute = resolve(ROOT, path);
  const label = relative(ROOT, absolute).replaceAll("\\", "/");
  if (!existsSync(absolute)) {
    return { path: label, status: "unavailable", sha256: null, bytes: null };
  }
  try {
    const bytes = readFileSync(absolute);
    return { path: label, status: "ok", sha256: sha256(bytes), bytes: bytes.length };
  } catch (error) {
    return {
      path: label,
      status: "invalid",
      sha256: null,
      bytes: null,
      reason: error.code || error.message,
    };
  }
}

function sourceFileIdentity(path) {
  const identity = fileIdentity(path);
  const headBlob = git(["rev-parse", `HEAD:${path}`]);
  const workspaceBlob = identity.status === "ok"
    ? git(["hash-object", "--", path])
    : null;
  return {
    ...identity,
    tracked: typeof headBlob === "string" && /^[0-9a-f]{40}$/.test(headBlob),
    head_blob: headBlob,
    workspace_blob: workspaceBlob,
    head_current: headBlob !== null && workspaceBlob === headBlob,
  };
}

function generatedFfiIdentity() {
  const manifestPath = "packages/flint/build/generated-ffi/manifest.json";
  const manifestIdentity = fileIdentity(manifestPath);
  if (manifestIdentity.status !== "ok") {
    return { status: "unavailable", current: false, manifest: manifestIdentity };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(ROOT, manifestPath), "utf8"));
  } catch (error) {
    return {
      status: "invalid",
      current: false,
      reason: error.message,
      manifest: manifestIdentity,
    };
  }
  const expectedSource = "packages/flint/generated/ffi_host.py";
  const expectedAddon = "sagejs_flint_ffi.node";
  const source = fileIdentity(manifest.source === expectedSource ? expectedSource : "");
  const addonPath = manifest.addon === expectedAddon
    ? `packages/flint/build/generated-ffi/${expectedAddon}`
    : "";
  const addon = fileIdentity(addonPath);
  let declarationIdentity = null;
  try {
    const { loadRegistry } = require("../../tools/ffi/declarations.cjs");
    declarationIdentity = loadRegistry({ root: ROOT }).byId.get("flint")?.identity || null;
  } catch {
    // The failure remains visible as a non-current declaration identity below.
  }
  const errors = [];
  if (manifest.schema !== "sagejs.ffi/generated-host-adapter-v1") {
    errors.push("unsupported-schema");
  }
  if (manifest.library !== declarationIdentity) errors.push("stale-declaration-identity");
  if (manifest.source !== expectedSource) errors.push("invalid-generated-source-path");
  if (manifest.addon !== expectedAddon) errors.push("invalid-addon-path");
  if (source.status !== "ok" || source.sha256 !== manifest.source_hash) {
    errors.push("stale-generated-source");
  }
  if (addon.status !== "ok" || addon.sha256 !== manifest.addon_hash) {
    errors.push("stale-or-modified-addon");
  }
  if (!/^[0-9a-f]{64}$/.test(manifest.cache_key || "")) {
    errors.push("invalid-cache-key");
  }
  return {
    status: errors.length ? "stale" : "ok",
    current: errors.length === 0,
    declaration_identity: declarationIdentity,
    manifest_library: manifest.library || null,
    cache_key: manifest.cache_key || null,
    manifest: manifestIdentity,
    source,
    addon,
    errors,
  };
}

function loadSnapshot() {
  const cpus = os.cpus();
  return {
    captured_at: new Date().toISOString(),
    load_average_1m_5m_15m: os.loadavg(),
    free_memory_bytes: os.freemem(),
    total_memory_bytes: os.totalmem(),
    process_rss_bytes: process.memoryUsage().rss,
    logical_cpu_count: cpus.length,
  };
}

function productionNativeIdentity() {
  const indexPath = "dist/native-kernels/index.json";
  const indexIdentity = fileIdentity(indexPath);
  if (indexIdentity.status !== "ok") {
    return { status: "unavailable", complete: false, index: indexIdentity, modules: {} };
  }
  let index;
  try {
    index = JSON.parse(readFileSync(resolve(ROOT, indexPath), "utf8"));
  } catch (error) {
    return {
      status: "invalid",
      complete: false,
      reason: error.message,
      index: indexIdentity,
      modules: {},
    };
  }
  if (index.schema !== "sagejs.native-cache/v3" || !index.logicalSources) {
    return {
      status: "invalid",
      complete: false,
      reason: "production native index has an unsupported schema",
      index: indexIdentity,
      modules: {},
    };
  }
  const modules = {};
  for (const [logicalSource, record] of Object.entries(index.logicalSources)) {
    const cacheKey = record?.cacheKey;
    const base = typeof cacheKey === "string" ? `dist/native-kernels/${cacheKey}` : null;
    const source = fileIdentity(`src/lib/${logicalSource}`);
    modules[logicalSource] = {
      cache_key: cacheKey || null,
      source_hash: record?.sourceHash || null,
      native_abi: record?.nativeAbi ?? null,
      source,
      source_current: source.status === "ok" && source.sha256 === record?.sourceHash,
      wrapper: base ? fileIdentity(`${base}/index.cjs`) : { status: "invalid" },
      addon: base
        ? fileIdentity(`${base}/build/Release/sagejs_native_kernel.node`)
        : { status: "invalid" },
    };
  }
  const complete = Object.keys(modules).length > 0 && Object.values(modules).every((module) =>
    /^[0-9a-f]{64}$/.test(module.cache_key || "") &&
    /^[0-9a-f]{64}$/.test(module.source_hash || "") &&
    module.wrapper.status === "ok" && /^[0-9a-f]{64}$/.test(module.wrapper.sha256 || "") &&
    module.addon.status === "ok" && /^[0-9a-f]{64}$/.test(module.addon.sha256 || "") &&
    module.source_current === true
  );
  return {
    status: complete ? "ok" : "incomplete",
    complete,
    index: indexIdentity,
    module_count: Object.keys(modules).length,
    modules,
  };
}

function collectIdentity() {
  const cpus = os.cpus();
  const status = git(["status", "--porcelain=v1"]);
  const sourceFiles = Object.fromEntries(
    RELEVANT_SOURCES.map((path) => [path, sourceFileIdentity(path)]),
  );
  const artifactFiles = Object.fromEntries(
    RELEVANT_ARTIFACTS.map((path) => [path, fileIdentity(path)]),
  );
  return {
    source: {
      commit: git(["rev-parse", "HEAD"]),
      tree: git(["rev-parse", "HEAD^{tree}"]),
      commit_tree: git(["show", "-s", "--format=%T", "HEAD"]),
      branch: git(["branch", "--show-current"]),
      tracked_and_untracked_status: status,
      clean: status === "",
      relevant_files: sourceFiles,
    },
    native_artifacts: artifactFiles,
    generated_ffi: generatedFfiIdentity(),
    production_native: productionNativeIdentity(),
    platform: {
      hostname: os.hostname(),
      platform: process.platform,
      architecture: process.arch,
      operating_system: `${os.type()} ${os.release()}`,
      cpu_model: cpus[0]?.model || "unknown",
      logical_cpu_count: cpus.length,
      total_memory_bytes: os.totalmem(),
      node_version: process.version,
      node_modules_abi: process.versions.modules || null,
      napi: process.versions.napi || null,
      v8: process.versions.v8 || null,
      openblas_threads: process.env.OPENBLAS_NUM_THREADS || null,
      omp_threads: process.env.OMP_NUM_THREADS || null,
    },
  };
}

module.exports = {
  RELEVANT_ARTIFACTS,
  RELEVANT_SOURCES,
  collectIdentity,
  fileIdentity,
  generatedFfiIdentity,
  loadSnapshot,
  productionNativeIdentity,
  sourceFileIdentity,
  sha256,
};
