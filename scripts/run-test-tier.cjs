#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const { availableParallelism } = require("node:os");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const manifest = require("../test/node-test-manifest.cjs");

const historicalSeconds = {
  portable: 25,
  unit: 30,
  smoke: 45,
  platform: 60,
  integration: 900,
  all: 930,
};

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function partition(items, size) {
  const answer = [];
  for (let index = 0; index < items.length; index += size) {
    answer.push(items.slice(index, index + size));
  }
  return answer;
}

function positiveInteger(value, option) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${option} must be a positive integer`);
  }
  return parsed;
}

function parseRunnerOptions(rawArguments, defaults = {}) {
  const runnerArguments = [];
  let batchSize = defaults.batchSize;
  let heartbeatSeconds = defaults.heartbeatSeconds;
  for (let index = 0; index < rawArguments.length; index += 1) {
    const argument = rawArguments[index];
    if (argument.startsWith("--batch-size=")) {
      batchSize = positiveInteger(argument.slice(13), "--batch-size");
    } else if (argument === "--batch-size") {
      batchSize = positiveInteger(rawArguments[++index], "--batch-size");
    } else if (argument.startsWith("--heartbeat-seconds=")) {
      heartbeatSeconds = positiveInteger(
        argument.slice(20),
        "--heartbeat-seconds",
      );
    } else if (argument === "--heartbeat-seconds") {
      heartbeatSeconds = positiveInteger(
        rawArguments[++index],
        "--heartbeat-seconds",
      );
    } else {
      runnerArguments.push(argument);
    }
  }
  return { batchSize, heartbeatSeconds, runnerArguments };
}

function selectedByNamePattern(files, runnerArguments) {
  let namePattern;
  for (let index = 0; index < runnerArguments.length; index += 1) {
    const argument = runnerArguments[index];
    if (argument.startsWith("--test-name-pattern=")) {
      namePattern = argument.slice("--test-name-pattern=".length);
    } else if (argument === "--test-name-pattern") {
      namePattern = runnerArguments[index + 1];
    }
  }
  return namePattern
    ? files.filter((filename) => new RegExp(namePattern).test(filename))
    : files;
}

function estimateRemaining({ elapsed, completed, total, historical }) {
  if (completed >= total) return 0;
  if (completed > 0) return (elapsed / completed) * (total - completed);
  return historical * ((total - completed) / total);
}

function runNodeBatch({
  batch,
  batchIndex,
  batches,
  completedFiles,
  concurrency,
  heartbeatMilliseconds,
  historicalMilliseconds,
  overallStarted,
  reporter,
  runnerArguments,
  tier,
  totalFiles,
}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const batchStarted = Date.now();
    const first = completedFiles + 1;
    const last = completedFiles + batch.length;
    process.stdout.write(
      `\n[test:${tier}] batch ${batchIndex + 1}/${batches}: ` +
        `files ${first}-${last} of ${totalFiles}\n`,
    );
    const child = spawn(
      process.execPath,
      [
        "--test",
        `--test-concurrency=${concurrency}`,
        `--test-reporter=${reporter}`,
        ...runnerArguments,
        ...batch,
      ],
      { cwd: root, env: process.env, stdio: "inherit" },
    );
    const heartbeat = setInterval(() => {
      const now = Date.now();
      const elapsed = now - overallStarted;
      const remaining = estimateRemaining({
        elapsed,
        completed: completedFiles,
        total: totalFiles,
        historical: historicalMilliseconds,
      });
      process.stdout.write(
        `[test:${tier}] still running batch ${batchIndex + 1}/${batches}; ` +
          `batch ${formatDuration(now - batchStarted)}, ` +
          `total ${formatDuration(elapsed)}, ` +
          `approximately ${formatDuration(remaining)} remaining\n`,
      );
    }, heartbeatMilliseconds);
    heartbeat.unref();
    child.once("error", (error) => {
      clearInterval(heartbeat);
      rejectPromise(error);
    });
    child.once("exit", (status, signal) => {
      clearInterval(heartbeat);
      resolvePromise({
        status: status ?? 1,
        signal,
        duration: Date.now() - batchStarted,
      });
    });
  });
}

async function main(arguments_ = process.argv.slice(2)) {
  const [tier = "all", ...rawRunnerArguments] = arguments_;
  const files = manifest[tier];
  if (!files) {
    console.error(
      `usage: node scripts/run-test-tier.cjs ` +
        `<${Object.keys(manifest).join("|")}> [node:test options] ` +
        `[--batch-size N] [--heartbeat-seconds N]`,
    );
    return 2;
  }

  const reporter = process.env.SAGEJS_TEST_REPORTER || "spec";
  const defaultBatchSize =
    reporter === "spec"
      ? Number(process.env.SAGEJS_TEST_BATCH_SIZE || 12)
      : files.length;
  const options = parseRunnerOptions(rawRunnerArguments, {
    batchSize: defaultBatchSize,
    heartbeatSeconds: Number(process.env.SAGEJS_TEST_HEARTBEAT_SECONDS || 20),
  });
  if (options.runnerArguments[0] === "--") options.runnerArguments.shift();
  const selectedFiles = selectedByNamePattern(files, options.runnerArguments);
  if (selectedFiles.length === 0) {
    console.error(`no ${tier} test file matches the requested pattern`);
    return 1;
  }

  const hostConcurrency =
    typeof availableParallelism === "function" ? availableParallelism() : 4;
  const concurrency = Math.max(
    1,
    Math.min(tier === "integration" || tier === "all" ? 2 : 4, hostConcurrency),
  );
  const batchSize = Math.min(options.batchSize, selectedFiles.length);
  const fileBatches = partition(selectedFiles, batchSize);
  const historicalMilliseconds =
    (historicalSeconds[tier] || Math.max(30, selectedFiles.length * 2)) * 1000;
  process.stdout.write(
    `\nSage.js ${tier} test plan\n` +
      `  files:       ${selectedFiles.length}\n` +
      `  batches:     ${fileBatches.length} (up to ${batchSize} files each)\n` +
      `  concurrency: ${concurrency} files\n` +
      `  expected:    about ${formatDuration(historicalMilliseconds)} on a warm ` +
      `developer build; host speed varies\n` +
      `  failure:     stop before starting the next batch\n`,
  );

  const overallStarted = Date.now();
  let completedFiles = 0;
  for (let index = 0; index < fileBatches.length; index += 1) {
    const result = await runNodeBatch({
      batch: fileBatches[index],
      batchIndex: index,
      batches: fileBatches.length,
      completedFiles,
      concurrency,
      heartbeatMilliseconds: options.heartbeatSeconds * 1000,
      historicalMilliseconds,
      overallStarted,
      reporter,
      runnerArguments: options.runnerArguments,
      tier,
      totalFiles: selectedFiles.length,
    });
    if (result.status !== 0) {
      const remaining =
        selectedFiles.length - completedFiles - fileBatches[index].length;
      process.stderr.write(
        `\n[test:${tier}] FAILED in batch ${index + 1}/${fileBatches.length} ` +
          `after ${formatDuration(Date.now() - overallStarted)}; ` +
          `${Math.max(0, remaining)} later files were not started.\n`,
      );
      if (process.env.GITHUB_ACTIONS) {
        process.stderr.write(
          `::error title=${tier} tests failed::Batch ${index + 1}/${fileBatches.length} ` +
            `failed; later batches were stopped.\n`,
        );
      }
      return result.status;
    }
    completedFiles += fileBatches[index].length;
    const elapsed = Date.now() - overallStarted;
    const remaining = estimateRemaining({
      elapsed,
      completed: completedFiles,
      total: selectedFiles.length,
      historical: historicalMilliseconds,
    });
    process.stdout.write(
      `[test:${tier}] passed batch ${index + 1}/${fileBatches.length} in ` +
        `${formatDuration(result.duration)}; ${completedFiles}/${selectedFiles.length} ` +
        `files complete, approximately ${formatDuration(remaining)} remaining\n`,
    );
  }
  process.stdout.write(
    `\n[test:${tier}] PASS: ${selectedFiles.length} files in ` +
      `${formatDuration(Date.now() - overallStarted)}\n`,
  );
  return 0;
}

if (require.main === module) {
  main().then(
    (status) => {
      process.exitCode = status;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}

module.exports = {
  estimateRemaining,
  formatDuration,
  main,
  parseRunnerOptions,
  partition,
};
