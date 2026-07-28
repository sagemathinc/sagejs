"use strict";

const { spawnSync } = require("node:child_process");
const {
  cpus,
  loadavg,
} = require("node:os");
const {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const suiteRoot = join(root, "upstream-tests", "micropython");
const corpusRoot = join(suiteRoot, "basics");
const source = JSON.parse(
  readFileSync(join(suiteRoot, "SOURCE.json"), "utf8"),
);
const sagejs = join(root, "bin", "sagejs");

function usage() {
  console.log(`Usage: pnpm bench:micropython [options]

Compare isolated-process execution of the adopted MicroPython compatibility
corpus under Sage.js and MicroPython. Each sample includes process startup,
parsing/compilation, and execution; a fresh process means V8 is cold each time.

Options:
  --micropython PATH   MicroPython executable (default: $MICROPYTHON or
                       micropython)
  --repetitions N      Recorded samples per test (default: 3)
  --warmups N          Unrecorded OS/filesystem warmups per test (default: 1)
  --sagejs-mode MODE   source (startup + compile + execute, default) or
                       precompiled (startup + execute generated JavaScript)
  --only REGEXP        Benchmark only matching corpus-relative paths
  --timeout MS         Per-process timeout (default: 10000)
  --json PATH          Also write machine-readable results
  --help               Show this help`);
}

function positiveInteger(flag, text, allowZero = false) {
  const value = Number(text);
  if (
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1)
  ) {
    throw new Error(`${flag} requires ${allowZero ? "a nonnegative" : "a positive"} integer`);
  }
  return value;
}

function parseArguments(argv) {
  const options = {
    micropython: process.env.MICROPYTHON || "micropython",
    repetitions: 3,
    warmups: 1,
    sagejsMode: "source",
    only: null,
    timeout: 10000,
    json: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--micropython") {
      options.micropython = argv[++index] || "";
      if (!options.micropython) {
        throw new Error("--micropython requires a path");
      }
    } else if (argument === "--repetitions") {
      options.repetitions = positiveInteger(
        "--repetitions",
        argv[++index],
      );
    } else if (argument === "--warmups") {
      options.warmups = positiveInteger(
        "--warmups",
        argv[++index],
        true,
      );
    } else if (argument === "--sagejs-mode") {
      options.sagejsMode = argv[++index] || "";
      if (!["source", "precompiled"].includes(options.sagejsMode)) {
        throw new Error(
          "--sagejs-mode must be source or precompiled",
        );
      }
    } else if (argument === "--only") {
      const pattern = argv[++index];
      if (!pattern) throw new Error("--only requires a regular expression");
      options.only = new RegExp(pattern);
    } else if (argument === "--timeout") {
      options.timeout = positiveInteger("--timeout", argv[++index]);
    } else if (argument === "--json") {
      options.json = argv[++index] || "";
      if (!options.json) throw new Error("--json requires a path");
    } else if (argument === "--help" || argument === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function discoverTests(only) {
  return readdirSync(corpusRoot)
    .filter((name) => name.endsWith(".py"))
    .filter((name) => !existsSync(join(corpusRoot, `${name}.exp`)))
    .filter((name) => {
      const code = readFileSync(join(corpusRoot, name), "utf8");
      return !/(^|\W)unittest(\W|$)/m.test(code);
    })
    .filter((name) => !only || only.test(name))
    .sort();
}

function identify(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error) {
    throw new Error(`${command} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} version check exited ${result.status}`);
  }
  return `${result.stdout}${result.stderr}`.trim();
}

function runTimed(command, args, timeout) {
  const start = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    cwd: corpusRoot,
    stdio: "ignore",
    timeout,
  });
  const milliseconds =
    Number(process.hrtime.bigint() - start) / 1_000_000;
  if (result.error) {
    const detail =
      result.error.code === "ETIMEDOUT"
        ? `exceeded ${timeout} ms`
        : result.error.message;
    throw new Error(`${command} ${detail}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} exited ${result.status} while running ${args.at(-1)}`,
    );
  }
  return milliseconds;
}

function precompileTests(tests, timeout) {
  // Dynamic eval/exec resolves its compiler helper relative to the generated
  // JavaScript file, so keep temporary outputs beside dist/tools/dynamic-code.
  const directory = join(root, "dist", "tools");
  const prefix =
    `.sagejs-microbench-${process.pid}-${Date.now()}-`;
  const outputs = {};
  const cleanup = () => {
    for (const outputFile of Object.values(outputs)) {
      try {
        unlinkSync(outputFile);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  };
  try {
    for (const name of tests) {
      const sourceFile = join(corpusRoot, name);
      const outputFile = join(directory, `${prefix}${name}.js`);
      outputs[name] = outputFile;
      const result = spawnSync(
        process.execPath,
        [
          sagejs,
          "compile",
          "--python",
          "--output",
          outputFile,
          sourceFile,
        ],
        {
          cwd: corpusRoot,
          stdio: "ignore",
          timeout,
        },
      );
      if (result.error || result.status !== 0) {
        throw new Error(
          `could not precompile ${name}: ` +
            (result.error?.message || `exit ${result.status}`),
        );
      }
    }
    return { cleanup, outputs };
  } catch (error) {
    cleanup();
    throw error;
  }
}

function quantile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function geometricMean(values) {
  return Math.exp(
    values.reduce((total, value) => total + Math.log(value), 0) /
      values.length,
  );
}

function formatMilliseconds(value) {
  return `${value.toFixed(value < 10 ? 3 : 2)} ms`;
}

function benchmark(options) {
  const tests = discoverTests(options.only);
  if (tests.length === 0) throw new Error("no tests matched");

  const micropythonVersion = identify(options.micropython, ["--version"]);
  const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  const gitStatus = spawnSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  });
  const revision =
    git.status === 0
      ? git.stdout.trim() +
        (gitStatus.status === 0 && gitStatus.stdout.trim()
          ? "+dirty"
          : "")
      : "unknown";
  const host = {
    cpu: cpus()[0]?.model || "unknown",
    logicalCpus: cpus().length,
    loadAverageStart: loadavg(),
    node: process.version,
  };

  console.log(
    `Benchmarking ${tests.length} differential tests, ` +
      `${options.repetitions} recorded + ${options.warmups} warmup rounds`,
  );
  console.log(`Sage.js ${revision}, Node ${process.version}`);
  console.log(micropythonVersion);
  console.log(
    `MicroPython corpus ${source.revision.slice(0, 12)}; ` +
      `Sage.js mode ${options.sagejsMode}; fresh process for every sample`,
  );

  const precompiled =
    options.sagejsMode === "precompiled"
      ? precompileTests(tests, options.timeout)
      : null;
  const samples = Object.fromEntries(
    tests.map((name) => [
      name,
      { sagejs: [], micropython: [] },
    ]),
  );
  const rounds = options.warmups + options.repetitions;
  try {
    for (let round = 0; round < rounds; round += 1) {
      const recorded = round >= options.warmups;
      for (let index = 0; index < tests.length; index += 1) {
        const name = tests[index];
        const file = join(corpusRoot, name);
        const engines =
          (round + index) % 2 === 0
            ? ["sagejs", "micropython"]
            : ["micropython", "sagejs"];
        for (const engine of engines) {
          const elapsed =
            engine === "sagejs"
              ? options.sagejsMode === "precompiled"
                ? runTimed(
                    process.execPath,
                    [precompiled.outputs[name]],
                    options.timeout,
                  )
                : runTimed(
                    process.execPath,
                    [sagejs, "--python", file],
                    options.timeout,
                  )
              : runTimed(
                  options.micropython,
                  [file],
                  options.timeout,
                );
          if (recorded) samples[name][engine].push(elapsed);
        }
      }
      console.error(
        `${recorded ? "recorded" : "warmup"} round ` +
          `${round + 1}/${rounds} complete`,
      );
    }
  } finally {
    if (precompiled) {
      precompiled.cleanup();
    }
  }

  const results = tests.map((name) => {
    const sagejsMedian = quantile(samples[name].sagejs, 0.5);
    const micropythonMedian = quantile(
      samples[name].micropython,
      0.5,
    );
    return {
      name,
      sagejsMilliseconds: sagejsMedian,
      micropythonMilliseconds: micropythonMedian,
      ratio: sagejsMedian / micropythonMedian,
      samples: samples[name],
    };
  });
  const ratios = results.map((result) => result.ratio);
  const sagejsTimes = results.map(
    (result) => result.sagejsMilliseconds,
  );
  const micropythonTimes = results.map(
    (result) => result.micropythonMilliseconds,
  );

  console.log("\nPer-test cold-process medians:");
  console.log(
    `  Sage.js median             ${formatMilliseconds(quantile(sagejsTimes, 0.5))}`,
  );
  console.log(
    `  MicroPython median         ${formatMilliseconds(quantile(micropythonTimes, 0.5))}`,
  );
  console.log(
    `  ratio geometric mean       ${geometricMean(ratios).toFixed(2)}x`,
  );
  console.log(
    `  ratio p10 / p50 / p90      ` +
      `${quantile(ratios, 0.1).toFixed(2)}x / ` +
      `${quantile(ratios, 0.5).toFixed(2)}x / ` +
      `${quantile(ratios, 0.9).toFixed(2)}x`,
  );
  console.log(
    `  sum of per-test medians    ` +
      `${(sagejsTimes.reduce((a, b) => a + b, 0) / 1000).toFixed(2)} s / ` +
      `${(micropythonTimes.reduce((a, b) => a + b, 0) / 1000).toFixed(2)} s`,
  );
  console.log(
    "  (ratio > 1 means Sage.js is slower; sums reflect this corpus's " +
      "arbitrary test weighting)",
  );

  const slowest = [...results]
    .sort((left, right) => right.ratio - left.ratio)
    .slice(0, Math.min(10, results.length));
  console.log("\nLargest Sage.js/MicroPython ratios:");
  for (const result of slowest) {
    console.log(
      `  ${result.ratio.toFixed(2).padStart(7)}x  ` +
        `${result.name.padEnd(34)} ` +
        `${formatMilliseconds(result.sagejsMilliseconds).padStart(10)} / ` +
        `${formatMilliseconds(result.micropythonMilliseconds)}`,
    );
  }

  const report = {
    format: 1,
    measurement:
      options.sagejsMode === "precompiled"
        ? "isolated process: startup + execute precompiled JavaScript"
        : "isolated process: startup + parse/compile + execute",
    source,
    sagejs: {
      revision,
      node: process.version,
    },
    micropython: {
      command: options.micropython,
      version: micropythonVersion,
    },
    options: {
      repetitions: options.repetitions,
      warmups: options.warmups,
      sagejsMode: options.sagejsMode,
      timeout: options.timeout,
      only: options.only?.source || null,
    },
    host: {
      ...host,
      loadAverageEnd: loadavg(),
    },
    summary: {
      tests: results.length,
      sagejsMedianMilliseconds: quantile(sagejsTimes, 0.5),
      micropythonMedianMilliseconds: quantile(
        micropythonTimes,
        0.5,
      ),
      ratioGeometricMean: geometricMean(ratios),
      ratioP10: quantile(ratios, 0.1),
      ratioP50: quantile(ratios, 0.5),
      ratioP90: quantile(ratios, 0.9),
    },
    results,
  };
  if (options.json) {
    writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nWrote ${options.json}`);
  }
}

try {
  benchmark(parseArguments(process.argv.slice(2)));
} catch (error) {
  console.error(`MicroPython benchmark: ${error.message}`);
  process.exitCode = 1;
}
