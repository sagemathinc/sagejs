"use strict";

const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..", "..");
const source = join(__dirname, "src", "corpus.py");
const sagejs = join(root, "bin", "sagejs");
const expectedPath = join(__dirname, "expected-benchmarks.txt");
const expectedNames = readFileSync(expectedPath, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

function usage() {
  console.log(`Usage: node bench/cowasm/run.cjs [options]

Options:
  --check                  Run the strict Sage.js compatibility corpus once
  --samples N              Measured process runs per runtime (default: 3)
  --warmups N              Unreported warmup process runs (default: 1)
  --runtime NAME=PATH      Add a Python-compatible runtime executable
  --help                   Show this help

Sage.js always runs in Python mode. Performance mode compares Sage.js with
SAGEJS_COWASM_PYTHON (default: python3), plus any --runtime entries.`);
}

function parseNonnegativeInteger(flag, text, { positive = false } = {}) {
  const value = Number(text);
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    (positive && value === 0)
  ) {
    throw new Error(`${flag} requires ${positive ? "a positive" : "a nonnegative"} integer`);
  }
  return value;
}

function parseArguments(argv) {
  const options = {
    check: false,
    samples: 3,
    warmups: 1,
    runtimes: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    } else if (argument === "--check") {
      options.check = true;
    } else if (argument === "--samples") {
      options.samples = parseNonnegativeInteger(
        "--samples",
        argv[++index],
        { positive: true },
      );
    } else if (argument === "--warmups") {
      options.warmups = parseNonnegativeInteger("--warmups", argv[++index]);
    } else if (argument === "--runtime") {
      const specification = argv[++index] || "";
      const separator = specification.indexOf("=");
      if (separator <= 0 || separator === specification.length - 1) {
        throw new Error("--runtime requires NAME=PATH");
      }
      options.runtimes.push({
        key: specification.slice(0, separator),
        label: specification.slice(0, separator),
        command: specification.slice(separator + 1),
        args: [source],
      });
    } else if (argument === "--help" || argument === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle];
  return (ordered[middle - 1] + ordered[middle]) / 2;
}

function parseCorpusOutput(label, output) {
  const results = [];
  let formatVersion = null;
  let completed = null;
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("SAGEJS_COWASM_CORPUS ")) {
      formatVersion = Number(line.split(/\s+/)[1]);
      continue;
    }
    if (line.startsWith("RESULT")) {
      const match = line.match(/^RESULT\s+(\d+)\s+(.+)\s+(\d+)$/);
      if (!match) {
        throw new Error(`${label} emitted a malformed RESULT line: ${line}`);
      }
      results.push({
        index: Number(match[1]),
        name: match[2],
        elapsedUs: Number(match[3]),
      });
      continue;
    }
    if (line.startsWith("COMPLETE")) {
      const match = line.match(/^COMPLETE\s+(\d+)$/);
      if (!match) {
        throw new Error(`${label} emitted a malformed COMPLETE line: ${line}`);
      }
      completed = Number(match[1]);
    }
  }
  if (formatVersion !== 1) {
    throw new Error(`${label} emitted unsupported corpus format ${formatVersion}`);
  }
  if (completed !== results.length) {
    throw new Error(
      `${label} reported COMPLETE ${completed}, but emitted ${results.length} results`,
    );
  }
  if (results.length !== expectedNames.length) {
    throw new Error(
      `${label} ran ${results.length} benchmarks; expected ${expectedNames.length}`,
    );
  }
  for (let index = 0; index < expectedNames.length; index += 1) {
    const result = results[index];
    if (result.index !== index || result.name !== expectedNames[index]) {
      throw new Error(
        `${label} benchmark ${index} was ${JSON.stringify(result.name)}; ` +
          `expected ${JSON.stringify(expectedNames[index])}`,
      );
    }
    if (!Number.isFinite(result.elapsedUs) || result.elapsedUs < 0) {
      throw new Error(
        `${label} emitted invalid timing for ${JSON.stringify(result.name)}`,
      );
    }
  }
  return results;
}

function execute(runtime) {
  const result = spawnSync(runtime.command, runtime.args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONDONTWRITEBYTECODE: "1",
    },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`${runtime.label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${runtime.label} exited with status ${result.status}`);
  }
  return parseCorpusOutput(runtime.label, result.stdout);
}

function measure(runtime, samples, warmups) {
  for (let index = 0; index < warmups; index += 1) execute(runtime);
  const byName = new Map(expectedNames.map((name) => [name, []]));
  for (let index = 0; index < samples; index += 1) {
    const results = execute(runtime);
    for (const result of results) {
      byName.get(result.name).push(result.elapsedUs);
    }
  }
  return new Map(
    [...byName].map(([name, values]) => [name, median(values)]),
  );
}

function formatMilliseconds(microseconds) {
  if (microseconds < 1000) return `${microseconds.toFixed(0)} µs`;
  return `${(microseconds / 1000).toFixed(2)} ms`;
}

function printPerformanceTable(measurements) {
  const runtimeWidth = 14;
  const nameWidth = Math.max(
    24,
    ...expectedNames.map((name) => name.length),
  );
  const header = [
    "benchmark".padEnd(nameWidth),
    ...measurements.map(({ runtime }) =>
      runtime.label.padStart(runtimeWidth)),
  ];
  if (measurements.length >= 2) {
    header.push(
      (
        `${measurements[0].runtime.label} / ` +
        measurements[1].runtime.label
      ).padStart(16),
    );
  }
  console.log(header.join("  "));
  console.log("-".repeat(header.join("  ").length));

  for (const name of expectedNames) {
    const values = measurements.map(({ timings }) => timings.get(name));
    const row = [
      name.padEnd(nameWidth),
      ...values.map((value) =>
        formatMilliseconds(value).padStart(runtimeWidth)),
    ];
    if (values.length >= 2) {
      const ratio = values[1] === 0 ? Infinity : values[0] / values[1];
      row.push(`${ratio.toFixed(2)}x`.padStart(16));
    }
    console.log(row.join("  "));
  }

  const totals = measurements.map(({ timings }) =>
    expectedNames.reduce((sum, name) => sum + timings.get(name), 0));
  const totalRow = [
    "TOTAL (sum of medians)".padEnd(nameWidth),
    ...totals.map((value) =>
      formatMilliseconds(value).padStart(runtimeWidth)),
  ];
  if (totals.length >= 2) {
    totalRow.push(`${(totals[0] / totals[1]).toFixed(2)}x`.padStart(16));
  }
  console.log("-".repeat(header.join("  ").length));
  console.log(totalRow.join("  "));
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const sagejsRuntime = {
    key: "sagejs",
    label: "Sage.js",
    command: process.execPath,
    args: [sagejs, "--python", source],
  };
  if (options.check) {
    execute(sagejsRuntime);
    console.log(
      `CoWasm compatibility: ${expectedNames.length}/${expectedNames.length} benchmarks passed`,
    );
    return;
  }

  const runtimes = [
    sagejsRuntime,
    {
      key: "python",
      label: "CPython",
      command: process.env.SAGEJS_COWASM_PYTHON || "python3",
      args: [source],
    },
    ...options.runtimes,
  ];
  const keys = new Set();
  for (const runtime of runtimes) {
    if (keys.has(runtime.key)) {
      throw new Error(`duplicate runtime name: ${runtime.key}`);
    }
    keys.add(runtime.key);
  }

  const measurements = [];
  for (const runtime of runtimes) {
    console.error(
      `Measuring ${runtime.label}: ${options.warmups} warmup(s), ` +
        `${options.samples} sample(s)`,
    );
    measurements.push({
      runtime,
      timings: measure(runtime, options.samples, options.warmups),
    });
  }
  printPerformanceTable(measurements);
}

try {
  main();
} catch (error) {
  console.error(`cowasm corpus: ${error.message}`);
  process.exitCode = 1;
}
