#!/usr/bin/env node
"use strict";

const {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} = require("node:fs");
const { homedir, availableParallelism } = require("node:os");
const { dirname, join, resolve } = require("node:path");

const {
  runBufferedCommand,
} = require("./build-parallelism.cjs");
const manifest = require("../test/node-test-manifest.cjs");

const root = resolve(__dirname, "..");
const timingSchema = "sagejs.test-timings/v1";
const historicalSeconds = {
  portable: 25,
  unit: 30,
  smoke: 5,
  platform: 10,
  integration: 900,
  all: 930,
};

function childTestEnvironment() {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  return environment;
}

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
  let concurrency = defaults.concurrency ?? defaults.batchSize;
  let heartbeatSeconds = defaults.heartbeatSeconds;
  for (let index = 0; index < rawArguments.length; index += 1) {
    const argument = rawArguments[index];
    if (argument.startsWith("--concurrency=")) {
      concurrency = positiveInteger(argument.slice(14), "--concurrency");
    } else if (argument === "--concurrency") {
      concurrency = positiveInteger(rawArguments[++index], "--concurrency");
    } else if (argument.startsWith("--batch-size=")) {
      concurrency = positiveInteger(argument.slice(13), "--batch-size");
    } else if (argument === "--batch-size") {
      concurrency = positiveInteger(rawArguments[++index], "--batch-size");
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
  return { concurrency, heartbeatSeconds, runnerArguments };
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

function timingFilename(environment = process.env) {
  return environment.SAGEJS_TEST_TIMINGS ||
    join(homedir(), ".cache", "sagejs", "test-timings-v1.json");
}

function timingHostKey() {
  return `${process.platform}-${process.arch}-node${process.versions.node.split(".")[0]}`;
}

function readTimings(filename = timingFilename()) {
  try {
    const parsed = JSON.parse(readFileSync(filename, "utf8"));
    if (parsed.schema === timingSchema && typeof parsed.hosts === "object") {
      return parsed;
    }
  } catch {}
  return { schema: timingSchema, hosts: {} };
}

function writeTimings(timings, filename = timingFilename()) {
  mkdirSync(dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(timings, null, 2)}\n`);
  renameSync(temporary, filename);
}

function estimatedFileMilliseconds(file, learned, fallback) {
  const value = learned[file];
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function longestFirst(files, learned, fallback) {
  return [...files].sort((left, right) =>
    estimatedFileMilliseconds(right, learned, fallback) -
      estimatedFileMilliseconds(left, learned, fallback) ||
    left.localeCompare(right),
  );
}

function queueEtaMilliseconds(files, learned, fallback, concurrency) {
  const work = files.reduce(
    (sum, file) => sum + estimatedFileMilliseconds(file, learned, fallback),
    0,
  );
  return work / Math.max(1, concurrency);
}

function activeRemainingMilliseconds(file, started, learned, fallback, now) {
  const expected = estimatedFileMilliseconds(file, learned, fallback);
  const elapsed = Math.max(0, now - started);
  if (elapsed < expected) return expected - elapsed;
  // Once a test exceeds its learned duration there is no defensible exact ETA.
  // Keep a diminishing-but-nonzero estimate so progress never claims completion
  // while an overdue child is visibly still running.
  return Math.max(1_000, elapsed / 2);
}

function scheduledEtaMilliseconds({
  active,
  concurrency,
  fallback,
  learned,
  pending,
  now = Date.now(),
}) {
  const laneLoads = [...active.entries()].map(([file, started]) =>
    activeRemainingMilliseconds(file, started, learned, fallback, now)
  );
  while (laneLoads.length < concurrency) laneLoads.push(0);
  const work = longestFirst([...pending], learned, fallback);
  for (const file of work) {
    let lane = 0;
    for (let index = 1; index < laneLoads.length; index += 1) {
      if (laneLoads[index] < laneLoads[lane]) lane = index;
    }
    laneLoads[lane] += estimatedFileMilliseconds(file, learned, fallback);
  }
  return Math.max(0, ...laneLoads);
}

function rememberTiming(learned, file, duration) {
  const previous = learned[file];
  learned[file] = previous === undefined
    ? duration
    : Math.round(previous * 0.7 + duration * 0.3);
}

async function runStructuredReporter({
  concurrency,
  files,
  reporter,
  runnerArguments,
}) {
  const result = await runBufferedCommand(
    process.execPath,
    [
      "--test",
      `--test-concurrency=${concurrency}`,
      `--test-reporter=${reporter}`,
      ...runnerArguments,
      ...files,
    ],
    { cwd: root, env: childTestEnvironment() },
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  return result.status;
}

async function runFileQueue({
  concurrency,
  fallbackMilliseconds,
  files,
  heartbeatMilliseconds,
  learned,
  replayFailure = true,
  runnerArguments,
  tier,
}) {
  const queue = longestFirst(files, learned, fallbackMilliseconds);
  const pending = new Set(queue);
  const active = new Map();
  const controller = new AbortController();
  const verbose = process.env.SAGEJS_TEST_VERBOSE === "1";
  const started = Date.now();
  let completed = 0;
  let next = 0;
  let firstFailure = null;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    controller.abort();
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

  const heartbeat = setInterval(() => {
    const eta = scheduledEtaMilliseconds({
      active,
      concurrency,
      fallback: fallbackMilliseconds,
      learned,
      pending: [...pending].filter((file) => !active.has(file)),
    });
    process.stdout.write(
      `[test:${tier}] ${completed}/${files.length} files complete; ` +
        `elapsed ${formatDuration(Date.now() - started)}, ` +
        `approximately ${formatDuration(eta)} remaining\n`,
    );
  }, heartbeatMilliseconds);
  heartbeat.unref();

  async function worker() {
    while (firstFailure === null && !interrupted) {
      const index = next;
      next += 1;
      if (index >= queue.length) return;
      const file = queue[index];
      const fileStarted = Date.now();
      active.set(file, fileStarted);
      let result;
      try {
        result = await runBufferedCommand(
          process.execPath,
          [
            "--test",
            "--test-concurrency=1",
            "--test-reporter=spec",
            ...runnerArguments,
            file,
          ],
          {
            cwd: root,
            env: childTestEnvironment(),
            signal: controller.signal,
            onStdout: verbose ? (data) => process.stdout.write(data) : undefined,
            onStderr: verbose ? (data) => process.stderr.write(data) : undefined,
          },
        );
      } catch (error) {
        result = { status: 1, stdout: "", stderr: `${error.stack || error}\n` };
      }
      const duration = Date.now() - fileStarted;
      pending.delete(file);
      active.delete(file);
      if (interrupted || firstFailure !== null) return;
      rememberTiming(learned, file, duration);
      if (result.status !== 0) {
        firstFailure = { file, duration, ...result };
        controller.abort();
        return;
      }
      completed += 1;
      const eta = scheduledEtaMilliseconds({
        active,
        concurrency,
        fallback: fallbackMilliseconds,
        learned,
        pending: [...pending].filter((pendingFile) => !active.has(pendingFile)),
      });
      process.stdout.write(
        `[test:${tier}] PASS ${completed}/${files.length} ${file} ` +
          `(${formatDuration(duration)}); elapsed ` +
          `${formatDuration(Date.now() - started)}, ETA ${formatDuration(eta)}\n`,
      );
    }
  }

  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally {
    clearInterval(heartbeat);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
  }
  if (interrupted) return 130;
  if (firstFailure !== null) {
    if (replayFailure) {
      process.stderr.write(
        `\n[test:${tier}] FAIL ${firstFailure.file} after ` +
          `${formatDuration(firstFailure.duration)}; cancelled active siblings and ` +
          `did not start ${Math.max(0, queue.length - next)} remaining files.\n`,
      );
      if (!verbose) {
        process.stdout.write(firstFailure.stdout);
        process.stderr.write(firstFailure.stderr);
      }
    }
    if (process.env.GITHUB_ACTIONS) {
      process.stderr.write(
        `::error title=${tier} tests failed::${firstFailure.file} failed; ` +
          `active siblings were cancelled.\n`,
      );
    }
    return firstFailure.status || 1;
  }
  process.stdout.write(
    `\n[test:${tier}] PASS: ${files.length} files in ` +
      `${formatDuration(Date.now() - started)}\n`,
  );
  return 0;
}

async function main(arguments_ = process.argv.slice(2)) {
  const [tier = "all", ...rawRunnerArguments] = arguments_;
  const files = manifest[tier];
  if (!files) {
    console.error(
      `usage: node scripts/run-test-tier.cjs ` +
        `<${Object.keys(manifest).join("|")}> [node:test options] ` +
        `[--concurrency N] [--heartbeat-seconds N]`,
    );
    return 2;
  }
  const reporter = process.env.SAGEJS_TEST_REPORTER || "spec";
  const hostConcurrency = typeof availableParallelism === "function"
    ? availableParallelism()
    : 4;
  const defaultConcurrency = Number(
    process.env.SAGEJS_TEST_CONCURRENCY ||
      process.env.SAGEJS_TEST_BATCH_SIZE ||
      Math.min(tier === "integration" || tier === "all" ? 2 : 4, hostConcurrency),
  );
  const options = parseRunnerOptions(rawRunnerArguments, {
    concurrency: defaultConcurrency,
    heartbeatSeconds: Number(process.env.SAGEJS_TEST_HEARTBEAT_SECONDS || 20),
  });
  if (options.runnerArguments[0] === "--") options.runnerArguments.shift();
  const selectedFiles = selectedByNamePattern(files, options.runnerArguments);
  if (selectedFiles.length === 0) {
    console.error(`no ${tier} test file matches the requested pattern`);
    return 1;
  }
  const concurrency = Math.min(options.concurrency, selectedFiles.length);
  if (reporter !== "spec") {
    return runStructuredReporter({
      concurrency,
      files: selectedFiles,
      reporter,
      runnerArguments: options.runnerArguments,
    });
  }

  const historicalMilliseconds =
    (historicalSeconds[tier] || Math.max(30, selectedFiles.length * 2)) * 1000;
  // Historical tier values are wall-clock observations from the old bounded
  // runner. Convert them to per-file work before feeding the queue simulator;
  // otherwise a cold timing database divides the old wall time by concurrency
  // twice and advertises an implausibly short first-run ETA.
  const fallbackMilliseconds =
    historicalMilliseconds * concurrency / selectedFiles.length;
  const timings = readTimings();
  const hostKey = timingHostKey();
  const learned = timings.hosts[hostKey] ?? {};
  timings.hosts[hostKey] = learned;
  const expected = queueEtaMilliseconds(
    selectedFiles,
    learned,
    fallbackMilliseconds,
    concurrency,
  );
  process.stdout.write(
    `\nSage.js ${tier} test plan\n` +
      `  files:       ${selectedFiles.length}\n` +
      `  concurrency: ${concurrency} independent files\n` +
      `  ordering:    longest learned files first\n` +
      `  expected:    about ${formatDuration(expected)} on this host\n` +
      `  failure:     cancel active siblings and stop scheduling immediately\n`,
  );
  const status = await runFileQueue({
    concurrency,
    fallbackMilliseconds,
    files: selectedFiles,
    heartbeatMilliseconds: options.heartbeatSeconds * 1000,
    learned,
    runnerArguments: options.runnerArguments,
    tier,
  });
  try {
    writeTimings(timings);
  } catch (error) {
    process.stderr.write(`[test:${tier}] could not save timings: ${error.message}\n`);
  }
  return status;
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
  estimatedFileMilliseconds,
  formatDuration,
  longestFirst,
  main,
  parseRunnerOptions,
  partition,
  queueEtaMilliseconds,
  scheduledEtaMilliseconds,
  readTimings,
  rememberTiming,
  runFileQueue,
  selectedByNamePattern,
  writeTimings,
};
