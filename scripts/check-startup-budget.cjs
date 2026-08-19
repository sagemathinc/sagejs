#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");

const ROOT = resolve(__dirname, "..");
const EXPECTED = "1267650600228229401496703205376";
const PACKAGE_GRAPH = require("../architecture/package-graph.json");

function startupDefaults(
  sea = false,
  empty = false,
  platform = process.platform,
  arch = process.arch,
) {
  const name = `${sea ? "sea-cli" : "development-cli"}${empty ? "-empty" : ""}`;
  const budget = PACKAGE_GRAPH.startup_budgets[name];
  if (!budget) throw new Error(`missing startup budget ${name}`);
  const platformArch = `${platform}-${arch}`;
  return {
    budgetMs:
      budget.normalized_median_ms_by_platform_arch?.[platformArch] ??
      budget.normalized_median_ms,
    hardLimitMs: budget.hard_limit_ms,
    referenceNodeMs: budget.reference_node_ms,
    samples: budget.samples,
  };
}

function positiveNumber(value, name, fallback) {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${name} must be a positive number, got ${value}`);
  }
  return number;
}

function sampleCount(value) {
  const count = positiveNumber(value, "startup sample count", 11);
  if (!Number.isInteger(count) || count < 3 || count % 2 === 0) {
    throw new Error("startup sample count must be an odd integer of at least 3");
  }
  return count;
}

function median(values) {
  if (values.length === 0) throw new Error("cannot take the median of no samples");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function assessStartup({
  nodeMedianMs,
  targetMedianMs,
  budgetMs = 300,
  referenceNodeMs = 30,
  hardLimitMs = 1500,
}) {
  const loadFactor = Math.max(1, nodeMedianMs / referenceNodeMs);
  const normalizedMs = targetMedianMs / loadFactor;
  return {
    loadFactor,
    normalizedMs,
    withinNormalizedBudget: normalizedMs <= budgetMs,
    withinHardLimit: targetMedianMs <= hardLimitMs,
    passed: normalizedMs <= budgetMs && targetMedianMs <= hardLimitMs,
  };
}

function formatCommand(command, args) {
  return [command, ...args].map((part) => JSON.stringify(part)).join(" ");
}

function timedSpawn(command, args, options = {}) {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
    ...options,
  });
  const elapsedMs = performance.now() - started;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${formatCommand(command, args)} exited ${result.status}\n${result.stderr || result.stdout}`,
    );
  }
  return { elapsedMs, result };
}

function parseArguments(argv) {
  let executable;
  let sea = false;
  let samples;
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    if (argument === "--sea") {
      sea = true;
    } else if (argument === "--executable") {
      executable = argv[++i];
      if (!executable) throw new Error("--executable requires a path");
    } else if (argument === "--samples") {
      samples = argv[++i];
      if (!samples) throw new Error("--samples requires a count");
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (sea && executable) throw new Error("use either --sea or --executable, not both");
  return { executable, sea, samples };
}

function targetCommand({ executable, sea }) {
  if (sea) {
    const filename = join(
      ROOT,
      "build",
      "sea",
      process.platform === "win32" ? "sagejs.exe" : "sagejs",
    );
    if (!existsSync(filename)) {
      throw new Error(`${filename} does not exist; run pnpm build:sea first`);
    }
    return { command: filename, args: [], label: "SEA sagejs" };
  }
  if (executable) {
    const filename = resolve(executable);
    if (!existsSync(filename)) throw new Error(`${filename} does not exist`);
    return { command: filename, args: [], label: filename };
  }
  return {
    command: process.execPath,
    args: [join(ROOT, "bin", "sagejs")],
    label: "development sagejs",
  };
}

function run(argv = process.argv.slice(2), environment = process.env) {
  const parsed = parseArguments(argv);
  const defaults = startupDefaults(parsed.sea);
  const emptyDefaults = startupDefaults(parsed.sea, true);
  const samples = sampleCount(
    parsed.samples ?? environment.SAGEJS_STARTUP_SAMPLES ?? defaults.samples,
  );
  const budgetMs = positiveNumber(
    environment.SAGEJS_STARTUP_BUDGET_MS,
    "SAGEJS_STARTUP_BUDGET_MS",
    defaults.budgetMs,
  );
  const referenceNodeMs = positiveNumber(
    environment.SAGEJS_STARTUP_REFERENCE_NODE_MS,
    "SAGEJS_STARTUP_REFERENCE_NODE_MS",
    defaults.referenceNodeMs,
  );
  const hardLimitMs = positiveNumber(
    environment.SAGEJS_STARTUP_HARD_LIMIT_MS,
    "SAGEJS_STARTUP_HARD_LIMIT_MS",
    defaults.hardLimitMs,
  );
  const target = targetCommand(parsed);
  const nodeTimes = [];
  const targetTimes = [];
  const emptyTargetTimes = [];

  const launchNode = () => {
    nodeTimes.push(timedSpawn(process.execPath, ["-e", ""]).elapsedMs);
  };
  const launchTarget = () => {
    const measurement = timedSpawn(target.command, target.args, {
      input: "print(2^100)\n",
    });
    const output = measurement.result.stdout.trim();
    if (!output.endsWith(EXPECTED)) {
      throw new Error(
        `${target.label} did not evaluate 2^100 correctly; output was ${JSON.stringify(output)}`,
      );
    }
    targetTimes.push(measurement.elapsedMs);
  };
  const launchEmptyTarget = () => {
    const measurement = timedSpawn(target.command, target.args, { input: "" });
    if (measurement.result.stdout.trim() !== "") {
      throw new Error(
        `${target.label} produced output for empty stdin: ` +
          JSON.stringify(measurement.result.stdout),
      );
    }
    emptyTargetTimes.push(measurement.elapsedMs);
  };

  // Alternating order keeps a changing host load from systematically favoring
  // either bare Node or Sage.js. Every observation is a fresh OS process.
  for (let i = 0; i < samples; i += 1) {
    if (i % 2 === 0) {
      launchNode();
      launchEmptyTarget();
      launchTarget();
    } else {
      launchTarget();
      launchEmptyTarget();
      launchNode();
    }
  }

  const nodeMedianMs = median(nodeTimes);
  const targetMedianMs = median(targetTimes);
  const emptyTargetMedianMs = median(emptyTargetTimes);
  const assessment = assessStartup({
    nodeMedianMs,
    targetMedianMs,
    budgetMs,
    referenceNodeMs,
    hardLimitMs,
  });
  const emptyAssessment = assessStartup({
    nodeMedianMs,
    targetMedianMs: emptyTargetMedianMs,
    budgetMs: positiveNumber(
      environment.SAGEJS_EMPTY_STARTUP_BUDGET_MS,
      "SAGEJS_EMPTY_STARTUP_BUDGET_MS",
      emptyDefaults.budgetMs,
    ),
    referenceNodeMs: emptyDefaults.referenceNodeMs,
    hardLimitMs: positiveNumber(
      environment.SAGEJS_EMPTY_STARTUP_HARD_LIMIT_MS,
      "SAGEJS_EMPTY_STARTUP_HARD_LIMIT_MS",
      emptyDefaults.hardLimitMs,
    ),
  });
  console.log(`Startup budget (${samples} fresh-process samples, median)`);
  console.log(`  bare Node:             ${nodeMedianMs.toFixed(1)} ms`);
  console.log(`  ${target.label} empty:`.padEnd(25) + `${emptyTargetMedianMs.toFixed(1)} ms`);
  console.log(`  ${target.label}:`.padEnd(25) + `${targetMedianMs.toFixed(1)} ms`);
  console.log(`  measured load factor:  ${assessment.loadFactor.toFixed(2)}x`);
  console.log(`  normalized Sage.js:    ${assessment.normalizedMs.toFixed(1)} ms`);
  console.log(`  normalized empty:      ${emptyAssessment.normalizedMs.toFixed(1)} ms`);
  console.log(`  normalized budget:     ${budgetMs.toFixed(1)} ms`);
  console.log(`  catastrophic ceiling:  ${hardLimitMs.toFixed(1)} ms raw`);

  if (!assessment.passed || !emptyAssessment.passed) {
    const reasons = [];
    if (!assessment.withinNormalizedBudget) {
      reasons.push(
        `${assessment.normalizedMs.toFixed(1)} ms normalized exceeds ${budgetMs.toFixed(1)} ms`,
      );
    }
    if (!assessment.withinHardLimit) {
      reasons.push(`${targetMedianMs.toFixed(1)} ms raw exceeds ${hardLimitMs.toFixed(1)} ms`);
    }
    if (!emptyAssessment.withinNormalizedBudget) {
      reasons.push(
        `${emptyAssessment.normalizedMs.toFixed(1)} ms normalized empty startup ` +
          `exceeds ${emptyDefaults.budgetMs.toFixed(1)} ms`,
      );
    }
    if (!emptyAssessment.withinHardLimit) {
      reasons.push(
        `${emptyTargetMedianMs.toFixed(1)} ms raw empty startup exceeds ` +
          `${emptyDefaults.hardLimitMs.toFixed(1)} ms`,
      );
    }
    throw new Error(`Sage.js startup regression: ${reasons.join("; ")}`);
  }
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  assessStartup,
  median,
  parseArguments,
  positiveNumber,
  sampleCount,
  startupDefaults,
};
