#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  canonicalJson,
  contentDigestPath,
  contentId,
  digestPath,
  platformIdentity,
  repositoryIdentity,
  repositoryPath,
  sha256,
} = require("../common.cjs");
const { writeImmutableJson } = require("../receipt.cjs");

const root = path.resolve(__dirname, "..", "..", "..");
const SCHEMA = "sagejs.numerical-soak-evidence/v1";
const COLLECTOR = "scripts/numerical-computing/qualification/run-soak.cjs";
const HARNESS = "bench/numerical-computing/qualification/soak/session.cjs";
const MARKER = "__SAGEJS_NUMERICAL_SOAK_SESSION__";
const LOG_LIMIT = 8 * 1024 * 1024;

const PROFILES = Object.freeze({
  development: Object.freeze({
    sessions: 1,
    cycles_per_block: 4,
    minimum_session_operations: 196,
    minimum_session_elapsed_ms: 0,
    maximum_blocks: 16,
    session_timeout_ms: 120_000,
    minimum_total_elapsed_ms: 0,
    minimum_total_operations: 196,
  }),
  release: Object.freeze({
    sessions: 12,
    cycles_per_block: 8,
    minimum_session_operations: 448,
    minimum_session_elapsed_ms: 15_000,
    maximum_blocks: 24,
    session_timeout_ms: 180_000,
    minimum_total_elapsed_ms: 180_000,
    minimum_total_operations: 5_376,
  }),
  scheduled: Object.freeze({
    sessions: 24,
    cycles_per_block: 8,
    minimum_session_operations: 448,
    minimum_session_elapsed_ms: 60_000,
    maximum_blocks: 32,
    session_timeout_ms: 240_000,
    minimum_total_elapsed_ms: 1_440_000,
    minimum_total_operations: 10_752,
  }),
});

const THRESHOLDS = Object.freeze({
  maximum_numerical_error: 2e-6,
  memory_slope_window_samples: 6,
  maximum_heap_slope_bytes_per_operation: 32 * 1024,
  maximum_rss_slope_bytes_per_operation: 64 * 1024,
  maximum_heap_growth_bytes_per_session: 64 * 1024 * 1024,
  maximum_rss_growth_bytes_per_session: 384 * 1024 * 1024,
  maximum_session_peak_rss_bytes: 1536 * 1024 * 1024,
  maximum_parent_heap_slope_bytes_per_session: 1024 * 1024,
  maximum_parent_heap_growth_bytes: 64 * 1024 * 1024,
});

function usage() {
  return `Usage: node scripts/numerical-computing/qualification/run-soak.cjs \\
  --candidate COMMIT --artifact DIRECTORY --output FILE \\
  [--profile development|release|scheduled] [--allow-dirty]

Runs source-bound numerical work in repeated fresh Node/Sage.js sessions. The
release profile performs at least twelve sessions, three minutes of useful
work, and 5,376 cross-domain operations. The scheduled profile runs
for at least twenty-four minutes. Both are bounded and stop on the first failed
session, recovery check, numerical oracle, or memory-growth criterion.
`;
}

function parseArguments(argv) {
  const options = {
    candidate: null,
    artifact: null,
    output: null,
    profile: "release",
    requireClean: true,
    help: false,
  };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["--help", "-h"].includes(argument)) options.help = true;
    else if (argument === "--allow-dirty") options.requireClean = false;
    else if (["--candidate", "--artifact", "--output", "--profile"].includes(argument)) {
      const name = argument.slice(2);
      if (seen.has(name)) throw new Error(`${argument} may appear only once`);
      seen.add(name);
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      options[name] = value;
    } else throw new Error(`unknown argument ${argument}`);
  }
  if (!options.help) {
    for (const name of ["candidate", "artifact", "output"]) {
      if (options[name] === null) throw new Error(`--${name} is required`);
    }
    if (!Object.hasOwn(PROFILES, options.profile)) throw new Error("unsupported --profile");
  }
  return options;
}

function nodeIdentity() {
  const filename = fs.realpathSync(process.execPath);
  const bytes = fs.readFileSync(filename);
  return { path: filename, version: process.version, sha256: sha256(bytes), bytes: bytes.length };
}

function median(values) {
  if (values.length === 0) throw new Error("median requires a sample");
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function theilSenSlope(points, xName, yName) {
  const slopes = [];
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      const delta = points[right][xName] - points[left][xName];
      if (delta !== 0) slopes.push((points[right][yName] - points[left][yName]) / delta);
    }
  }
  return slopes.length === 0 ? 0 : median(slopes);
}

function analyseSession(record, thresholds = THRESHOLDS) {
  if (record?.status !== "passed" || !Array.isArray(record.memory_samples) ||
      record.memory_samples.length < thresholds.memory_slope_window_samples) {
    throw new Error("soak session returned an invalid record");
  }
  const samples = record.memory_samples;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const memoryFields = [
      "rss_bytes", "heap_used_bytes", "external_bytes", "array_buffers_bytes",
    ];
    if (sample?.block !== index || !Number.isSafeInteger(sample.operations) ||
        sample.operations < 0 || (index > 0 && sample.operations <= samples[index - 1].operations) ||
        memoryFields.some((field) => !Number.isSafeInteger(sample[field]) || sample[field] < 0)) {
      throw new Error("soak session returned invalid memory samples");
    }
  }
  const stable = samples.slice(-thresholds.memory_slope_window_samples);
  const first = samples[0];
  const last = samples.at(-1);
  return {
    heap_slope_bytes_per_operation: theilSenSlope(stable, "operations", "heap_used_bytes"),
    rss_slope_bytes_per_operation: theilSenSlope(stable, "operations", "rss_bytes"),
    heap_growth_bytes: last.heap_used_bytes - first.heap_used_bytes,
    rss_growth_bytes: last.rss_bytes - first.rss_bytes,
    peak_rss_bytes: Math.max(...samples.map((sample) => sample.rss_bytes)),
  };
}

function validateSession(record, profile, thresholds) {
  const analysis = analyseSession(record, thresholds);
  const failures = [];
  if (!Number.isFinite(record.elapsed_ms) || record.elapsed_ms < 0 ||
      !Number.isSafeInteger(record.blocks) || record.blocks < 1 ||
      record.blocks > profile.maximum_blocks ||
      !Number.isSafeInteger(record.cycles) || record.cycles < 1 ||
      !Number.isSafeInteger(record.operations) || record.operations < 1 ||
      !Number.isSafeInteger(record.failures) || record.failures < 0) {
    failures.push("session accounting was invalid");
  }
  if (record.operations < profile.minimum_session_operations) failures.push("insufficient operations");
  if (record.elapsed_ms < profile.minimum_session_elapsed_ms) failures.push("insufficient elapsed time");
  if (record.blocks + 1 !== record.memory_samples.length ||
      record.cycles !== record.blocks * profile.cycles_per_block ||
      record.operations !== record.cycles * 7) failures.push("work accounting was inconsistent");
  if (record.failures !== 0) failures.push("public numerical operation failed");
  if (!Number.isFinite(record.maximum_error) || record.maximum_error < 0 ||
      record.maximum_error > thresholds.maximum_numerical_error) failures.push("numerical oracle error");
  if (record.recovery?.budget_status !== "maximum_evaluations" ||
      !Number.isSafeInteger(record.recovery?.budget_evaluations) ||
      record.recovery?.budget_evaluations < 0 ||
      record.recovery?.budget_evaluations > 1) failures.push("evaluation budget was not enforced");
  if (record.recovery?.cancelled_status !== "cancelled" ||
      record.recovery?.cancelled_evaluations !== 0) failures.push("explicit cancellation was not enforced");
  if (record.recovery?.callback_status !== "callback_error" ||
      record.recovery?.callback_evaluations !== 1) failures.push("callback failure escaped");
  if (record.recovery?.recovered !== true || record.recovery?.recovery_residual > 1e-12) {
    failures.push("runtime did not recover after contained failures");
  }
  if (analysis.heap_slope_bytes_per_operation >
      thresholds.maximum_heap_slope_bytes_per_operation) failures.push("heap slope exceeded limit");
  if (analysis.rss_slope_bytes_per_operation >
      thresholds.maximum_rss_slope_bytes_per_operation) failures.push("RSS slope exceeded limit");
  if (analysis.heap_growth_bytes >
      thresholds.maximum_heap_growth_bytes_per_session) failures.push("heap growth exceeded limit");
  if (analysis.rss_growth_bytes >
      thresholds.maximum_rss_growth_bytes_per_session) failures.push("RSS growth exceeded limit");
  if (analysis.peak_rss_bytes >
      thresholds.maximum_session_peak_rss_bytes) failures.push("peak RSS exceeded limit");
  if (failures.length !== 0) throw new Error(`soak session failed: ${failures.join(", ")}`);
  return analysis;
}

function childArguments(artifact, profile) {
  return [
    "--expose-gc", path.join(root, HARNESS),
    "--artifact", artifact,
    "--cycles-per-block", String(profile.cycles_per_block),
    "--minimum-operations", String(profile.minimum_session_operations),
    "--minimum-elapsed-ms", String(profile.minimum_session_elapsed_ms),
    "--maximum-blocks", String(profile.maximum_blocks),
    "--memory-slope-window-samples", String(THRESHOLDS.memory_slope_window_samples),
    "--maximum-heap-slope-bytes-per-operation",
    String(THRESHOLDS.maximum_heap_slope_bytes_per_operation),
    "--maximum-rss-slope-bytes-per-operation",
    String(THRESHOLDS.maximum_rss_slope_bytes_per_operation),
  ];
}

function runSession(artifact, profile) {
  const result = spawnSync(process.execPath, childArguments(artifact, profile), {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    timeout: profile.session_timeout_ms,
    maxBuffer: LOG_LIMIT,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(
      `fresh soak session failed (${result.status ?? result.signal})\n${result.stdout}\n${result.stderr}`,
    );
  }
  const line = result.stdout.split(/\r?\n/)
    .findLast((candidate) => candidate.startsWith(MARKER));
  if (line === undefined) throw new Error("fresh soak session produced no result marker");
  return JSON.parse(line.slice(MARKER.length));
}

function artifactBinding(relative) {
  const binding = digestPath(root, relative, "soak artifact");
  return {
    ...binding,
    content_sha256: contentDigestPath(root, relative, "soak artifact content"),
  };
}

function buildEvidence(options, dependencies = {}) {
  const spawnSession = dependencies.runSession ?? runSession;
  const before = repositoryIdentity(root);
  if (before.commit !== options.candidate || (options.requireClean && !before.clean)) {
    throw new Error(
      `soak requires ${options.requireClean ? "clean " : ""}candidate ${options.candidate}; ` +
        `got ${before.commit}${before.clean ? "" : " (dirty)"}`,
    );
  }
  const artifact = repositoryPath(root, options.artifact, "soak artifact");
  const status = fs.lstatSync(artifact.absolute);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error("--artifact must be a non-symlink repository directory");
  }
  const profile = PROFILES[options.profile];
  const startingArtifact = artifactBinding(artifact.relative);
  const node = nodeIdentity();
  const parentSamples = [];
  const sessions = [];
  for (let index = 0; index < profile.sessions; index += 1) {
    if (typeof global.gc === "function") global.gc();
    parentSamples.push({ session: index, heap_used_bytes: process.memoryUsage().heapUsed });
    const record = spawnSession(artifact.absolute, profile);
    const memory = validateSession(record, profile, THRESHOLDS);
    sessions.push({
      session: index,
      elapsed_ms: record.elapsed_ms,
      blocks: record.blocks,
      cycles: record.cycles,
      operations: record.operations,
      failures: record.failures,
      maximum_error: record.maximum_error,
      recovery: record.recovery,
      memory_samples: record.memory_samples,
      memory,
    });
  }
  if (typeof global.gc === "function") global.gc();
  parentSamples.push({ session: profile.sessions, heap_used_bytes: process.memoryUsage().heapUsed });
  const totalElapsed = sessions.reduce((sum, item) => sum + item.elapsed_ms, 0);
  const totalOperations = sessions.reduce((sum, item) => sum + item.operations, 0);
  const parentStable = parentSamples.slice(Math.floor(parentSamples.length / 2));
  const parentHeapSlope = theilSenSlope(parentStable, "session", "heap_used_bytes");
  const parentHeapGrowth = parentSamples.at(-1).heap_used_bytes - parentSamples[0].heap_used_bytes;
  if (totalElapsed < profile.minimum_total_elapsed_ms) throw new Error("soak duration floor not met");
  if (totalOperations < profile.minimum_total_operations) throw new Error("soak work floor not met");
  if (parentHeapSlope > THRESHOLDS.maximum_parent_heap_slope_bytes_per_session ||
      parentHeapGrowth > THRESHOLDS.maximum_parent_heap_growth_bytes) {
    throw new Error("soak collector memory growth exceeded its leak criteria");
  }
  const after = repositoryIdentity(root);
  if (before.commit !== after.commit || before.tree !== after.tree ||
      before.status_sha256 !== after.status_sha256 || before.clean !== after.clean) {
    throw new Error("repository identity changed during numerical soak");
  }
  if (canonicalJson(startingArtifact) !== canonicalJson(artifactBinding(artifact.relative))) {
    throw new Error("numerical artifact changed during soak");
  }
  if (canonicalJson(node) !== canonicalJson(nodeIdentity())) {
    throw new Error("Node executable changed during soak");
  }
  const core = {
    schema: SCHEMA,
    generated_at: new Date().toISOString(),
    status: "passed",
    repository: after,
    platform: platformIdentity(),
    collector: digestPath(root, COLLECTOR, "soak collector"),
    harness: digestPath(root, HARNESS, "soak session harness"),
    tool: node,
    artifact: startingArtifact,
    profile: options.profile,
    configuration: profile,
    thresholds: THRESHOLDS,
    totals: {
      sessions: sessions.length,
      elapsed_ms: totalElapsed,
      operations: totalOperations,
      failures: sessions.reduce((sum, item) => sum + item.failures, 0),
      maximum_error: Math.max(...sessions.map((item) => item.maximum_error)),
      parent_heap_slope_bytes_per_session: parentHeapSlope,
      parent_heap_growth_bytes: parentHeapGrowth,
    },
    parent_memory_samples: parentSamples,
    sessions,
    scope: {
      claim: "source-bound-repeated-fresh-process-numerical-soak",
      representative_domains: [
        "root", "integration", "linear-solve", "scalar-optimization",
        "explicit-ode", "fft", "descriptive-statistics",
      ],
      fresh_process_per_session: true,
      cancellation_and_recovery_per_session: true,
      garbage_collected_memory_samples: true,
      routine_ci: false,
      bounded: true,
    },
  };
  return { ...core, id: contentId(core) };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const evidence = buildEvidence(options);
  writeImmutableJson(options.output, evidence);
  process.stdout.write(`passed: ${evidence.id} -> ${path.resolve(options.output)}\n`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  PROFILES,
  SCHEMA,
  THRESHOLDS,
  analyseSession,
  buildEvidence,
  main,
  median,
  parseArguments,
  theilSenSlope,
  usage,
  validateSession,
};
