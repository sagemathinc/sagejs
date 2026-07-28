"use strict";

const { spawnSync } = require("node:child_process");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..", "..");
const source = join(__dirname, "src", "corpus.py");
const sagejs = join(root, "bin", "sagejs");
const expectedPath = join(__dirname, "expected-benchmarks.txt");
const allBenchmarkNames = readFileSync(expectedPath, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
let benchmarkNames = allBenchmarkNames;

function usage() {
  console.log(`Usage: node bench/cowasm/run.cjs [options]

Options:
  --check                  Run the strict Sage.js compatibility corpus once
  --samples N              Measured in-process corpus passes (default: 3)
  --warmups N              In-process JIT warmup passes (default: 1)
  --only NAME              Measure one exact benchmark name
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
    only: null,
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
    } else if (argument === "--only") {
      options.only = argv[++index] || "";
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

function parseCorpusOutput(label, output, expectedWarmups, expectedSamples) {
  const passes = {
    WARMUP: Array.from({ length: expectedWarmups }, () => []),
    RESULT: Array.from({ length: expectedSamples }, () => []),
  };
  let formatVersion = null;
  let completed = null;
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("SAGEJS_COWASM_CORPUS ")) {
      formatVersion = Number(line.split(/\s+/)[1]);
      continue;
    }
    if (line.startsWith("WARMUP") || line.startsWith("RESULT")) {
      const match = line.match(
        /^(WARMUP|RESULT)\s+(\d+)\s+(\d+)\s+(.+)\s+(\d+)$/,
      );
      if (!match) {
        throw new Error(`${label} emitted a malformed timing line: ${line}`);
      }
      const kind = match[1];
      const sample = Number(match[2]);
      if (!passes[kind][sample]) {
        throw new Error(`${label} emitted unexpected ${kind} pass ${sample}`);
      }
      passes[kind][sample].push({
        index: Number(match[3]),
        name: match[4],
        elapsedUs: Number(match[5]),
      });
      continue;
    }
    if (line.startsWith("COMPLETE")) {
      const match = line.match(/^COMPLETE\s+(\d+)\s+(\d+)\s+(\d+)$/);
      if (!match) {
        throw new Error(`${label} emitted a malformed COMPLETE line: ${line}`);
      }
      completed = {
        warmups: Number(match[1]),
        samples: Number(match[2]),
        benchmarks: Number(match[3]),
      };
    }
  }
  if (formatVersion !== 2) {
    throw new Error(`${label} emitted unsupported corpus format ${formatVersion}`);
  }
  if (
    !completed ||
    completed.warmups !== expectedWarmups ||
    completed.samples !== expectedSamples ||
    completed.benchmarks !== benchmarkNames.length
  ) {
    throw new Error(
      `${label} reported inconsistent COMPLETE metadata`,
    );
  }
  for (const [kind, samples] of Object.entries(passes)) {
    for (let sample = 0; sample < samples.length; sample += 1) {
      const results = samples[sample];
      if (results.length !== benchmarkNames.length) {
        throw new Error(
          `${label} ${kind} pass ${sample} ran ${results.length} benchmarks; ` +
            `expected ${benchmarkNames.length}`,
        );
      }
      for (let index = 0; index < benchmarkNames.length; index += 1) {
        const result = results[index];
        if (result.index !== index || result.name !== benchmarkNames[index]) {
          throw new Error(
            `${label} benchmark ${index} was ${JSON.stringify(result.name)}; ` +
              `expected ${JSON.stringify(benchmarkNames[index])}`,
          );
        }
        if (!Number.isFinite(result.elapsedUs) || result.elapsedUs < 0) {
          throw new Error(
            `${label} emitted invalid timing for ${JSON.stringify(result.name)}`,
          );
        }
      }
    }
  }
  return passes;
}

function execute(runtime, samples, warmups) {
  const corpusArguments =
    runtime.passCorpusOptions === false
      ? []
      : [
          ...(runtime.corpusArguments || []),
          "--warmups",
          String(warmups),
          "--samples",
          String(samples),
        ];
  const result = spawnSync(
    runtime.command,
    [...runtime.args, ...corpusArguments],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
      },
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (result.error) {
    throw new Error(`${runtime.label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${runtime.label} exited with status ${result.status}`);
  }
  return parseCorpusOutput(runtime.label, result.stdout, warmups, samples);
}

function passAsMap(results) {
  return new Map(results.map((result) => [result.name, result.elapsedUs]));
}

function measure(runtime, samples, warmups) {
  const passes = execute(runtime, samples, warmups);
  const measured = passes.RESULT;
  const timings = new Map();
  for (const name of benchmarkNames) {
    const values = measured.map((pass) => {
      const result = pass.find((item) => item.name === name);
      if (!result) {
        throw new Error(
          `${runtime.label} omitted ${JSON.stringify(name)} from a sample`,
        );
      }
      return result.elapsedUs;
    });
    timings.set(name, median(values));
  }
  const firstPass = warmups > 0 ? passes.WARMUP[0] : passes.RESULT[0];
  return {
    timings,
    firstPass: passAsMap(firstPass),
  };
}

function formatMilliseconds(microseconds) {
  if (microseconds < 1000) return `${microseconds.toFixed(0)} µs`;
  return `${(microseconds / 1000).toFixed(2)} ms`;
}

function printPerformanceTable(measurements) {
  const runtimeWidth = 14;
  const nameWidth = Math.max(
    24,
    ...benchmarkNames.map((name) => name.length),
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

  for (const name of benchmarkNames) {
    const values = measurements.map(({ measurement }) =>
      measurement.timings.get(name));
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

  const totals = measurements.map(({ measurement }) =>
    benchmarkNames.reduce(
      (sum, name) => sum + measurement.timings.get(name),
      0,
    ));
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

  if (measurements.length >= 2) {
    const ratios = benchmarkNames.map((name) => {
      const left = measurements[0].measurement.timings.get(name);
      const right = measurements[1].measurement.timings.get(name);
      return Math.max(left, 0.5) / Math.max(right, 0.5);
    });
    const geometricMean = Math.exp(
      ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) / ratios.length,
    );
    const coldTotals = measurements.map(({ measurement }) =>
      benchmarkNames.reduce(
        (sum, name) => sum + measurement.firstPass.get(name),
        0,
      ));
    console.log();
    console.log(
      `Unweighted per-benchmark ratio: median ${median(ratios).toFixed(2)}x; ` +
        `geometric mean ${geometricMean.toFixed(2)}x`,
    );
    console.log(
      `First in-process corpus pass: ` +
        measurements
          .map(({ runtime }, index) =>
            `${runtime.label} ${formatMilliseconds(coldTotals[index])}`)
          .join("; ") +
        `; ratio ${(coldTotals[0] / coldTotals[1]).toFixed(2)}x`,
    );
    console.log(
      "The TOTAL ratio is workload-weighted by historical iteration counts; " +
        "the median and geometric mean give every benchmark equal weight.",
    );
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.only !== null) {
    if (!allBenchmarkNames.includes(options.only)) {
      throw new Error(`unknown benchmark: ${JSON.stringify(options.only)}`);
    }
    benchmarkNames = [options.only];
  }
  if (options.check) {
    if (options.only !== null) {
      throw new Error("--only cannot be combined with --check");
    }
    const sagejsRuntime = {
      key: "sagejs",
      label: "Sage.js",
      command: process.execPath,
      args: [sagejs, "--python", source],
      passCorpusOptions: false,
    };
    execute(sagejsRuntime, 1, 0);
    console.log(
      `CoWasm compatibility: ${allBenchmarkNames.length}/${allBenchmarkNames.length} benchmarks passed`,
    );
    return;
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-cowasm-"));
  try {
    const compiled = join(temporaryDirectory, "corpus.js");
    const compilation = spawnSync(
      process.execPath,
      [sagejs, "compile", "--python", "--output", compiled, source],
      { cwd: root, encoding: "utf8" },
    );
    if (compilation.error || compilation.status !== 0) {
      process.stderr.write(compilation.stderr || "");
      throw new Error(
        `could not compile Sage.js corpus: ` +
          (compilation.error?.message || `exit ${compilation.status}`),
      );
    }

    const runtimes = [
      {
        key: "sagejs",
        label: "Sage.js",
        command: process.execPath,
        args: [compiled],
        corpusArguments:
          options.only === null ? [] : ["--only", options.only],
      },
      {
        key: "python",
        label: "CPython",
        command: process.env.SAGEJS_COWASM_PYTHON || "python3",
        args: [source],
        corpusArguments:
          options.only === null ? [] : ["--only", options.only],
      },
      ...options.runtimes.map((runtime) => ({
        ...runtime,
        corpusArguments:
          options.only === null ? [] : ["--only", options.only],
      })),
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
        `Measuring ${runtime.label} in one process: ` +
          `${options.warmups} warmup pass(es), ${options.samples} sample(s)`,
      );
      measurements.push({
        runtime,
        measurement: measure(runtime, options.samples, options.warmups),
      });
    }
    printPerformanceTable(measurements);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`cowasm corpus: ${error.message}`);
  process.exitCode = 1;
}
