"use strict";

const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const {
  arch,
  cpus,
  freemem,
  loadavg,
  platform,
  release,
  totalmem,
  tmpdir,
} = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..", "..");
const source = join(__dirname, "src", "corpus.py");
const sagejs = join(root, "bin", "sagejs");
const expectedPath = join(__dirname, "expected-benchmarks.txt");
const suitesPath = join(__dirname, "performance-suites.json");
const allBenchmarkNames = readFileSync(expectedPath, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
let benchmarkNames = allBenchmarkNames;
const performanceSuites = JSON.parse(readFileSync(suitesPath, "utf8"));

function usage() {
  console.log(`Usage: node bench/cowasm/run.cjs [options]

Options:
  --check                  Run the strict Sage.js compatibility corpus once
  --samples N              Measured in-process corpus passes (default: 3)
  --warmups N              In-process JIT warmup passes (default: 1)
  --only NAME              Measure an exact benchmark (repeatable)
  --suite NAME             Measure a named benchmark suite
  --runtime NAME=PATH      Add a Python-compatible runtime executable
  --json PATH              Write samples and environment metadata as JSON
  --budget PATH            Check relative performance budgets from JSON
  --help                   Show this help

Sage.js always runs in Python mode. Performance mode compares Sage.js with
SAGEJS_COWASM_PYTHON (default: python3), plus any --runtime entries.
For example, add SageLite with --runtime sagelite=/path/to/sagelite.`);
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
    only: [],
    suite: null,
    runtimes: [],
    jsonPath: null,
    budgetPath: null,
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
      options.only.push(argv[++index] || "");
    } else if (argument === "--suite") {
      options.suite = argv[++index] || "";
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
    } else if (argument === "--json") {
      options.jsonPath = argv[++index] || "";
    } else if (argument === "--budget") {
      options.budgetPath = argv[++index] || "";
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
    samples: measured.map(passAsMap),
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

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) return null;
  return `${result.stdout || ""}${result.stderr || ""}`.trim() || null;
}

function gitMetadata() {
  return {
    revision: commandOutput("git", ["rev-parse", "HEAD"]),
    dirty: Boolean(commandOutput("git", ["status", "--porcelain"])),
  };
}

function runtimeMetadata(runtime) {
  let version;
  if (runtime.key === "sagejs") {
    version = `Sage.js ${require(join(root, "package.json")).version}; ${process.version}`;
  } else {
    version = commandOutput(runtime.command, ["--version"]);
  }
  return {
    key: runtime.key,
    label: runtime.label,
    command: runtime.command,
    version,
  };
}

function corpusSourceHash() {
  const digest = createHash("sha256");
  const directory = join(__dirname, "src");
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith(".py")) continue;
    digest.update(name);
    digest.update("\0");
    digest.update(readFileSync(join(directory, name)));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function ratioSummary(ratios) {
  if (ratios.length === 0) return null;
  return {
    median: median(ratios),
    geometricMean: Math.exp(
      ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) /
        ratios.length,
    ),
  };
}

function createReport(options, measurements) {
  const reference = measurements.find(
    ({ runtime }) => runtime.key === "python",
  );
  const benchmarks = {};
  for (const name of benchmarkNames) {
    const runtimes = {};
    for (const { runtime, measurement } of measurements) {
      const medianUs = measurement.timings.get(name);
      runtimes[runtime.key] = {
        firstPassUs: measurement.firstPass.get(name),
        samplesUs: measurement.samples.map((sample) => sample.get(name)),
        medianUs,
        ratioToPython:
          runtime.key === "python"
            ? 1
            : Math.max(medianUs, 0.5) /
              Math.max(reference.measurement.timings.get(name), 0.5),
      };
    }
    benchmarks[name] = { runtimes };
  }

  const summaries = {};
  for (const { runtime, measurement } of measurements) {
    const ratios = benchmarkNames.map(
      (name) =>
        Math.max(measurement.timings.get(name), 0.5) /
        Math.max(reference.measurement.timings.get(name), 0.5),
    );
    summaries[runtime.key] = {
      ...ratioSummary(ratios),
      sumOfMediansUs: benchmarkNames.reduce(
        (sum, name) => sum + measurement.timings.get(name),
        0,
      ),
    };
  }

  const cpuList = cpus();
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    corpus: {
      name: "cowasm-python-benchmarks",
      formatVersion: 2,
      source: "bench/cowasm/src/corpus.py",
      sourceTreeSha256: corpusSourceHash(),
      suite: options.suite,
      benchmarks: benchmarkNames,
      warmups: options.warmups,
      samples: options.samples,
    },
    repository: gitMetadata(),
    host: {
      platform: platform(),
      release: release(),
      architecture: arch(),
      cpuModel: cpuList[0]?.model || null,
      logicalCpuCount: cpuList.length,
      totalMemoryBytes: totalmem(),
      freeMemoryBytes: freemem(),
      loadAverage: loadavg(),
    },
    runtimes: measurements.map(({ runtime }) => runtimeMetadata(runtime)),
    benchmarks,
    summaries,
  };
}

function readBudget(path) {
  const budget = JSON.parse(readFileSync(path, "utf8"));
  if (
    budget.schemaVersion !== 1 ||
    budget.referenceRuntime !== "python" ||
    budget.runtime !== "sagejs" ||
    !budget.benchmarks ||
    typeof budget.benchmarks !== "object"
  ) {
    throw new Error(`unsupported performance budget format in ${path}`);
  }
  return budget;
}

function checkBudget(budget, report) {
  const failures = [];
  const targetMisses = [];
  let evaluated = 0;
  for (const [name, envelope] of Object.entries(budget.benchmarks)) {
    const benchmark = report.benchmarks[name];
    if (!benchmark) continue;
    evaluated += 1;
    const ratio = benchmark.runtimes.sagejs.ratioToPython;
    if (envelope.targetRatio && ratio > envelope.targetRatio) {
      targetMisses.push(
        `${name}: ${ratio.toFixed(2)}x (target ${envelope.targetRatio.toFixed(2)}x)`,
      );
    }
    if (!Number.isFinite(envelope.maxRatio) || envelope.maxRatio <= 0) {
      throw new Error(`invalid maxRatio budget for ${JSON.stringify(name)}`);
    }
    if (ratio > envelope.maxRatio) {
      failures.push(
        `${name}: ${ratio.toFixed(2)}x exceeds ${envelope.maxRatio.toFixed(2)}x`,
      );
    }
  }
  if (targetMisses.length > 0) {
    console.log();
    console.log("Performance targets still open:");
    for (const message of targetMisses) console.log(`  ${message}`);
  }
  if (failures.length > 0) {
    throw new Error(`performance budget failed:\n  ${failures.join("\n  ")}`);
  }
  console.log(
    `Performance budget: ${evaluated} envelope(s) passed`,
  );
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.suite !== null && options.only.length > 0) {
    throw new Error("--suite cannot be combined with --only");
  }
  if (options.suite !== null) {
    const suite = performanceSuites.suites[options.suite];
    if (!suite) {
      throw new Error(`unknown benchmark suite: ${JSON.stringify(options.suite)}`);
    }
    benchmarkNames = suite.benchmarks;
  } else if (options.only.length > 0) {
    benchmarkNames = [...new Set(options.only)];
  } else if (options.budgetPath !== null) {
    benchmarkNames = Object.keys(readBudget(options.budgetPath).benchmarks);
  }
  for (const name of benchmarkNames) {
    if (!allBenchmarkNames.includes(name)) {
      throw new Error(`unknown benchmark: ${JSON.stringify(name)}`);
    }
  }
  const selectedBenchmarks = new Set(benchmarkNames);
  benchmarkNames = allBenchmarkNames.filter((name) =>
    selectedBenchmarks.has(name));
  if (options.check) {
    if (
      options.only.length > 0 ||
      options.suite !== null ||
      options.jsonPath !== null ||
      options.budgetPath !== null
    ) {
      throw new Error(
        "--check cannot be combined with performance selection or reporting options",
      );
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
          benchmarkNames.length === allBenchmarkNames.length
            ? []
            : benchmarkNames.flatMap((name) => ["--only", name]),
      },
      {
        key: "python",
        label: "CPython",
        command: process.env.SAGEJS_COWASM_PYTHON || "python3",
        args: [source],
        corpusArguments:
          benchmarkNames.length === allBenchmarkNames.length
            ? []
            : benchmarkNames.flatMap((name) => ["--only", name]),
      },
      ...options.runtimes.map((runtime) => ({
        ...runtime,
        corpusArguments:
          benchmarkNames.length === allBenchmarkNames.length
            ? []
            : benchmarkNames.flatMap((name) => ["--only", name]),
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
    const report = createReport(options, measurements);
    if (options.jsonPath !== null) {
      writeFileSync(options.jsonPath, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Wrote benchmark report to ${options.jsonPath}`);
    }
    if (options.budgetPath !== null) {
      checkBudget(readBudget(options.budgetPath), report);
    }
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
