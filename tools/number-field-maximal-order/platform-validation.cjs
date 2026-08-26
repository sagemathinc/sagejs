#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const { collectIdentity } = require("../../bench/number-field-maximal-order-final-evidence/identity.cjs");
const { digest } = require("./runner.cjs");
const { readProcessTreeRssKilobytes } = require("./process.cjs");

const ROOT = resolve(__dirname, "../..");
const REQUIRED_CHECKS = Object.freeze([
  "exactness",
  "production_autoload",
  "resource_lifecycle",
  "corruption",
  "dynamic_fallback",
  "representative_performance",
]);

function defaultChecks(node = process.execPath) {
  return {
    exactness: [node, "--test", "test/number-field-maximal-order-contracts.cjs"],
    production_autoload: [node, "--test", "test/production-native-kernels.cjs"],
    resource_lifecycle: [node, "--test", "test/number-field-order-resource-ffi.cjs"],
    corruption: [node, "--test", "test/number-field-analysis-resource.cjs"],
    dynamic_fallback: [node, "--test", "test/number-field-buchmann-lenstra-fallback.cjs"],
    representative_performance: [
      node,
      "--test",
      "test/number-field-maximal-order-public-micro-perf.cjs",
    ],
  };
}

function platformReceiptDigest(receipt) {
  const payload = { ...receipt };
  delete payload.integrity;
  delete payload.receipt_path;
  delete payload.receipt_sha256;
  delete payload.report_target;
  delete payload.report_source_commit;
  delete payload.report_source_tree;
  return digest(JSON.parse(JSON.stringify(payload)));
}

function validatePlatformValidationReceipt(receipt, identity = null) {
  const errors = [];
  if (receipt?.schema !== "sagejs.number-fields/platform-validation-v1") {
    errors.push("unsupported schema");
  }
  if (!/^[0-9a-f]{40}$/.test(receipt?.source_commit || "")) {
    errors.push("missing full source commit");
  }
  if (!/^[0-9a-f]{40}$/.test(receipt?.source_tree || "")) {
    errors.push("missing full source tree");
  }
  if (receipt?.source_clean !== true) errors.push("source was not clean");
  if (!/^(linux|darwin|win32)-(x64|arm64)$/.test(receipt?.target || "")) {
    errors.push("unsupported target label");
  }
  for (const name of REQUIRED_CHECKS) {
    const check = receipt?.checks?.[name];
    if (check?.status !== "pass") errors.push(`${name} did not pass`);
    if (!Array.isArray(check?.argv) || check.argv.length === 0 ||
        check.argv.some((entry) => typeof entry !== "string")) {
      errors.push(`${name} has no exact argv`);
    }
    if (!Number.isFinite(check?.duration_ms) || check.duration_ms < 0) {
      errors.push(`${name} has no finite duration`);
    }
  }
  const performance = receipt?.checks?.representative_performance;
  if (!Number.isFinite(performance?.peak_rss_kb) || performance.peak_rss_kb <= 0) {
    errors.push("representative_performance has no peak RSS");
  }
  if (typeof performance?.peak_rss_scope !== "string" || !performance.peak_rss_scope) {
    errors.push("representative_performance has no RSS scope");
  }
  const expectedDigest = receipt?.integrity?.payload_sha256;
  if (!/^[0-9a-f]{64}$/.test(expectedDigest || "") ||
      platformReceiptDigest(receipt) !== expectedDigest) {
    errors.push("payload digest mismatch");
  }
  if (identity) {
    const target = `${identity.platform.platform}-${identity.platform.architecture}`;
    if (receipt?.target !== target) errors.push(`target does not match ${target}`);
    if (receipt?.source_commit !== identity.source.commit) {
      errors.push("source commit does not match the measured source");
    }
    if (receipt?.source_tree !== identity.source.tree) {
      errors.push("source tree does not match the measured source");
    }
  }
  return { valid: errors.length === 0, errors };
}

function rssSample(pid) {
  return readProcessTreeRssKilobytes(pid);
}

function commandText(argv) {
  return argv.map((value) => JSON.stringify(value)).join(" ");
}

async function runCheck(name, argv, { timeoutMs = 900_000 } = {}) {
  if (!Array.isArray(argv) || argv.length === 0) throw new Error(`${name} has no argv`);
  const startedAt = new Date();
  const started = process.hrtime.bigint();
  const stdoutHash = createHash("sha256");
  const stderrHash = createHash("sha256");
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let outputTail = "";
  let peakRss = null;
  let peakRssScope = process.platform === "linux" ? "process-tree" : "process-only";
  let peakRssObserved = 0;
  const child = spawn(argv[0], argv.slice(1), {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  function sample() {
    const observed = rssSample(child.pid);
    peakRssScope = observed.scope;
    peakRssObserved = Math.max(peakRssObserved, observed.observed_processes || 0);
    if (Number.isFinite(observed.kilobytes)) {
      peakRss = Math.max(peakRss || 0, observed.kilobytes);
    }
  }
  sample();
  const rssTimer = setInterval(sample, process.platform === "win32" ? 500 : 50);
  function retain(stream, chunk) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    stream.update(bytes);
    outputTail = `${outputTail}${bytes.toString("utf8")}`.slice(-16_384);
    return bytes.length;
  }
  child.stdout.on("data", (chunk) => { stdoutBytes += retain(stdoutHash, chunk); });
  child.stderr.on("data", (chunk) => { stderrBytes += retain(stderrHash, chunk); });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, timeoutMs);
  const terminal = await new Promise((resolvePromise) => {
    child.on("error", (error) => resolvePromise({ code: null, signal: null, error }));
    child.on("close", (code, signal) => resolvePromise({ code, signal, error: null }));
  });
  clearTimeout(timeout);
  clearInterval(rssTimer);
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  const rssAccepted = name !== "representative_performance" ||
    (Number.isFinite(peakRss) && peakRss > 0);
  const passed = !timedOut && !terminal.error && terminal.code === 0 &&
    !terminal.signal && rssAccepted;
  return {
    status: passed ? "pass" : "fail",
    argv,
    command: commandText(argv),
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: durationMs,
    exit_code: terminal.code,
    signal: terminal.signal,
    timed_out: timedOut,
    error: terminal.error?.message || null,
    rss_error: rssAccepted ? null : "representative performance RSS was not observed",
    stdout_sha256: stdoutHash.digest("hex"),
    stdout_bytes: stdoutBytes,
    stderr_sha256: stderrHash.digest("hex"),
    stderr_bytes: stderrBytes,
    peak_rss_kb: peakRss,
    peak_rss_scope: peakRssScope,
    peak_rss_observed_processes: peakRssObserved,
    failure_output_tail: passed ? null : outputTail,
  };
}

async function producePlatformValidation({ checks = defaultChecks(), timeoutMs } = {}) {
  const before = collectIdentity();
  if (!before.source.clean) throw new Error("platform validation requires a clean source tree");
  const results = {};
  for (const name of REQUIRED_CHECKS) {
    if (!checks[name]) throw new Error(`missing platform check ${name}`);
    results[name] = await runCheck(name, checks[name], { timeoutMs });
  }
  const after = collectIdentity();
  if (!after.source.clean || after.source.commit !== before.source.commit ||
      after.source.tree !== before.source.tree) {
    throw new Error("source identity changed during platform validation");
  }
  const receipt = {
    schema: "sagejs.number-fields/platform-validation-v1",
    generated_at: new Date().toISOString(),
    target: `${before.platform.platform}-${before.platform.architecture}`,
    source_commit: before.source.commit,
    source_tree: before.source.tree,
    source_clean: before.source.clean,
    platform: before.platform,
    native_artifacts: before.native_artifacts,
    production_native: before.production_native,
    checks: results,
    summary: {
      required: REQUIRED_CHECKS.length,
      passed: Object.values(results).filter((entry) => entry.status === "pass").length,
      failed: Object.values(results).filter((entry) => entry.status !== "pass").length,
    },
  };
  receipt.integrity = {
    algorithm: "sha256(stable-json(receipt-without-integrity))",
    payload_sha256: platformReceiptDigest(receipt),
  };
  return receipt;
}

function parseArguments(argv) {
  const options = { command: "plan" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--") && index === 0) options.command = value;
    else if (value === "--output") options.output = argv[++index];
    else if (value === "--timeout-ms") options.timeoutMs = Number(argv[++index]);
    else throw new Error(`unknown argument ${value}`);
  }
  return options;
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.command === "plan") {
    console.log(JSON.stringify({
      schema: "sagejs.number-fields/platform-validation-plan-v1",
      target: `${process.platform}-${process.arch}`,
      checks: defaultChecks(),
    }, null, 2));
    return;
  }
  if (options.command !== "run") throw new Error(`unknown command ${options.command}`);
  if (!options.output) throw new Error("run requires --output");
  if (options.timeoutMs !== undefined &&
      (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new Error("--timeout-ms must be positive");
  }
  const receipt = await producePlatformValidation({ timeoutMs: options.timeoutMs });
  writeFileSync(resolve(options.output), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    `${receipt.target}: ${receipt.summary.passed}/${receipt.summary.required} platform checks passed; ` +
    `receipt ${receipt.integrity.payload_sha256}`,
  );
  if (receipt.summary.failed) process.exitCode = 2;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  REQUIRED_CHECKS,
  defaultChecks,
  platformReceiptDigest,
  producePlatformValidation,
  runCheck,
  validatePlatformValidationReceipt,
};
