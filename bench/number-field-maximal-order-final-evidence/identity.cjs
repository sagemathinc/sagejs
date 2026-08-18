"use strict";

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const os = require("node:os");
const { relative, resolve } = require("node:path");

const ROOT = resolve(__dirname, "../..");

const RELEVANT_SOURCES = Object.freeze([
  "src/lib/sagejs/number_fields/maximal_order_engine.py",
  "src/lib/sagejs/number_fields/field_analysis_resource.py",
  "src/lib/sagejs/number_fields/buchmann_lenstra.py",
  "src/lib/sagejs/number_fields/bl_composite_kernel.py",
  "src/lib/sagejs/number_fields/round4.py",
  "src/lib/sagejs/number_fields/om_types.py",
  "src/lib/sagejs/number_fields/om_maxmin.py",
  "src/lib/sagejs/number_fields/local_parallel_worker.py",
  "src/lib/sagejs/kernels/matrix/word_prime_krylov.py",
  "architecture/native-kernels.json",
  "test/fixtures/number-field-maximal-order-corpus.json",
]);

const RELEVANT_ARTIFACTS = Object.freeze([
  "packages/flint/build/Release/sagejs_flint.node",
  "dist/tools/kernel.js",
  "dist/native-kernels/manifest.json",
  "dist/production-native-kernels.json",
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
  const bytes = readFileSync(absolute);
  return { path: label, status: "ok", sha256: sha256(bytes), bytes: bytes.length };
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

function collectIdentity() {
  const cpus = os.cpus();
  const status = git(["status", "--porcelain=v1"]);
  const sourceFiles = Object.fromEntries(
    RELEVANT_SOURCES.map((path) => [path, fileIdentity(path)]),
  );
  const artifactFiles = Object.fromEntries(
    RELEVANT_ARTIFACTS.map((path) => [path, fileIdentity(path)]),
  );
  return {
    source: {
      commit: git(["rev-parse", "HEAD"]),
      tree: git(["rev-parse", "HEAD^{tree}"]),
      branch: git(["branch", "--show-current"]),
      tracked_and_untracked_status: status,
      clean: status === "",
      relevant_files: sourceFiles,
    },
    native_artifacts: artifactFiles,
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
  loadSnapshot,
  sha256,
};
