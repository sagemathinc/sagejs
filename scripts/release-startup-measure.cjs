#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");

const EXPECTED_POWER = "1267650600228229401496703205376";
const EXPECTED_MPMATH = "1.4142135623730950488016887242096980785696718753769";
const CODE_CACHE_REJECTION = /code cache(?: data)? rejected/i;
const CODE_CACHE_DIAGNOSTICS_ENV = "SAGEJS_CODE_CACHE_DIAGNOSTICS";

function usage() {
  return `Usage: node scripts/release-startup-measure.cjs --executable PATH [options]

Measure fresh-process release startup as independently useful components.

Options:
  --executable PATH  Sage.js or sagepython single executable to measure
  --mode MODE        sage or python (inferred from the executable name)
  --samples N        odd sample count for ordinary probes (default: 11)
  --lazy-samples N   cold and warm mpmath samples (default: 3)
  --no-lazy          skip the mpmath cold/warm import probes
  --no-capabilities  skip embedded receipt verification (historical comparison)
  --json             emit a machine-readable report
  -h, --help         show this help`;
}

function positiveOddInteger(value, name, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number % 2 === 0) {
    throw new Error(`${name} must be a positive odd integer, got ${value}`);
  }
  return number;
}

function parseArguments(argv) {
  const options = {
    executable: undefined,
    json: false,
    lazy: true,
    capabilities: true,
    lazySamples: 3,
    mode: undefined,
    samples: 11,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--executable") {
      options.executable = argv[++index];
      if (!options.executable) throw new Error("--executable requires a path");
    } else if (argument === "--mode") {
      options.mode = argv[++index];
      if (!options.mode) throw new Error("--mode requires sage or python");
    } else if (argument === "--samples") {
      options.samples = positiveOddInteger(argv[++index], "--samples", 11);
    } else if (argument === "--lazy-samples") {
      options.lazySamples = positiveOddInteger(
        argv[++index],
        "--lazy-samples",
        3,
      );
    } else if (argument === "--no-lazy") {
      options.lazy = false;
    } else if (argument === "--no-capabilities") {
      options.capabilities = false;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`unknown argument ${JSON.stringify(argument)}`);
    }
  }
  if (options.help) return options;
  if (!options.executable) throw new Error("--executable is required");
  options.executable = resolve(options.executable);
  if (!existsSync(options.executable)) {
    throw new Error(`${options.executable} does not exist`);
  }
  options.mode ??= basename(options.executable).toLowerCase().includes("python")
    ? "python"
    : "sage";
  if (options.mode !== "sage" && options.mode !== "python") {
    throw new Error(`--mode must be sage or python, got ${options.mode}`);
  }
  return options;
}

function median(values) {
  if (values.length === 0) throw new Error("cannot summarize no samples");
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function percentile(values, fraction) {
  if (values.length === 0) throw new Error("cannot summarize no samples");
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

function summarize(values) {
  return {
    median_ms: Number(median(values).toFixed(3)),
    p90_ms: Number(percentile(values, 0.9).toFixed(3)),
    samples_ms: values.map((value) => Number(value.toFixed(3))),
  };
}

function runProcess(command, args, options = {}) {
  const started = performance.now();
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
    ...options,
  });
  const elapsed = performance.now() - started;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${[command, ...args].map(JSON.stringify).join(" ")} exited ` +
        `${result.status}\n${result.stderr || result.stdout}`,
    );
  }
  if (CODE_CACHE_REJECTION.test(result.stderr)) {
    throw new Error(
      `${basename(command)} rejected embedded V8 code cache:\n${result.stderr}`,
    );
  }
  return { elapsed, stderr: result.stderr, stdout: result.stdout };
}

function targetArguments(mode) {
  return [mode === "sage" ? "--sage" : "--python"];
}

function probes(options, sharedCache) {
  const modeArguments = targetArguments(options.mode);
  const power = options.mode === "sage" ? "2^100" : "2**100";
  const baseEnvironment = {
    ...process.env,
    [CODE_CACHE_DIAGNOSTICS_ENV]: "error",
    XDG_CACHE_HOME: sharedCache,
  };
  const definitions = [
    {
      id: "node_launch",
      description: "bare Node process launch",
      samples: options.samples,
      run: () => runProcess(process.execPath, ["-e", ""]),
      validate: ({ stdout }) => stdout.trim() === "",
    },
    {
      id: "sea_entry",
      description: "SEA deserialize and bundled entry",
      samples: options.samples,
      run: () =>
        runProcess(options.executable, [...modeArguments, "--version"], {
          env: baseEnvironment,
        }),
      validate: ({ stdout }) => /^sagejs \S+\s*$/.test(stdout),
    },
    {
      id: "repl_empty",
      description: "compiler context and empty REPL",
      samples: options.samples,
      run: () => runProcess(options.executable, modeArguments, {
        env: baseEnvironment,
        input: "",
      }),
      validate: ({ stdout }) => stdout.trim() === "",
    },
    {
      id: "evaluate_power",
      description: "Tree-sitter, base runtime, compile and evaluate",
      samples: options.samples,
      run: () => runProcess(options.executable, modeArguments, {
        env: baseEnvironment,
        input: `print(${power})\n`,
      }),
      validate: ({ stdout }) => stdout.trim() === EXPECTED_POWER,
    },
  ];
  if (options.capabilities) definitions.push({
      id: "capabilities",
      description: "embedded receipt and capability verification",
      samples: options.samples,
      run: () => runProcess(options.executable, ["capabilities", "--json"], {
        env: baseEnvironment,
      }),
      validate: ({ stdout }) => {
        const report = JSON.parse(stdout);
        return (
          report.artifact?.kind === "single-executable" &&
          report.buildReceipt?.availability === "available"
        );
      },
    });
  if (options.lazy) {
    const source = [
      "from mpmath import mp",
      "mp.dps = 50",
      "print(mp.sqrt(2))",
      "",
    ].join("\n");
    definitions.push(
      {
        id: "mpmath_cold",
        description: "first mpmath import with a new writable cache",
        samples: options.lazySamples,
        run: () => {
          const cache = mkdtempSync(join(tmpdir(), "sagejs-startup-cold-"));
          try {
            return runProcess(options.executable, modeArguments, {
              env: {
                ...process.env,
                [CODE_CACHE_DIAGNOSTICS_ENV]: "error",
                XDG_CACHE_HOME: cache,
              },
              input: source,
            });
          } finally {
            rmSync(cache, { recursive: true, force: true });
          }
        },
        validate: ({ stdout }) => stdout.trim() === EXPECTED_MPMATH,
      },
      {
        id: "mpmath_warm",
        description: "mpmath import with reusable local bytecode cache",
        samples: options.lazySamples,
        run: () => runProcess(options.executable, modeArguments, {
          env: baseEnvironment,
          input: source,
        }),
        validate: ({ stdout }) => stdout.trim() === EXPECTED_MPMATH,
      },
    );
  }
  return definitions;
}

function measure(options) {
  const sharedCache = mkdtempSync(join(tmpdir(), "sagejs-startup-shared-"));
  try {
    const definitions = probes(options, sharedCache);
    const observations = new Map(
      definitions.map((probe) => [probe.id, { elapsed: [], stderr: new Set() }]),
    );
    const rounds = Math.max(...definitions.map((probe) => probe.samples));
    // Rotate the first probe each round so changing host load and filesystem
    // temperature cannot systematically favor one component.
    for (let round = 0; round < rounds; round += 1) {
      for (let offset = 0; offset < definitions.length; offset += 1) {
        const probe = definitions[(round + offset) % definitions.length];
        if (round >= probe.samples) continue;
        const result = probe.run();
        if (!probe.validate(result)) {
          throw new Error(
            `${probe.id} returned unexpected output ${JSON.stringify(result.stdout)}`,
          );
        }
        const observation = observations.get(probe.id);
        observation.elapsed.push(result.elapsed);
        for (const line of result.stderr.split("\n")) {
          if (line.trim()) observation.stderr.add(line);
        }
      }
    }
    const components = Object.fromEntries(
      definitions.map((probe) => {
        const observation = observations.get(probe.id);
        return [probe.id, {
          description: probe.description,
          ...summarize(observation.elapsed),
          stderr: [...observation.stderr].sort(),
        }];
      }),
    );
    const entry = components.sea_entry.median_ms;
    const empty = components.repl_empty.median_ms;
    const evaluate = components.evaluate_power.median_ms;
    return {
      schema: "sagejs.release-startup-components/v1",
      target: {
        executable: options.executable,
        mode: options.mode,
        platform: process.platform,
        arch: process.arch,
        node: process.versions.node,
      },
      components,
      derived: {
        sea_entry_over_node_ms: Number(
          (entry - components.node_launch.median_ms).toFixed(3),
        ),
        compiler_repl_over_entry_ms: Number((empty - entry).toFixed(3)),
        parse_runtime_evaluate_over_empty_ms: Number(
          (evaluate - empty).toFixed(3),
        ),
      },
      code_cache_rejection_observed: false,
      code_cache_diagnostics: "error",
    };
  } finally {
    rmSync(sharedCache, { recursive: true, force: true });
  }
}

function formatReport(report) {
  const lines = [
    `Sage.js release startup (${report.target.platform}-${report.target.arch}, ` +
      `${report.target.mode} mode)`,
    "  component                         median      p90",
  ];
  for (const [id, component] of Object.entries(report.components)) {
    lines.push(
      `  ${id.padEnd(31)} ` +
        `${component.median_ms.toFixed(1).padStart(7)} ms ` +
        `${component.p90_ms.toFixed(1).padStart(7)} ms`,
    );
  }
  lines.push(
    "  derived incremental medians:",
    `    SEA entry over Node:             ${report.derived.sea_entry_over_node_ms.toFixed(1)} ms`,
    `    compiler/REPL over SEA entry:    ${report.derived.compiler_repl_over_entry_ms.toFixed(1)} ms`,
    `    parser/runtime/eval over empty:  ${report.derived.parse_runtime_evaluate_over_empty_ms.toFixed(1)} ms`,
    "  embedded V8 code-cache rejection: not observed",
  );
  return lines.join("\n");
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = measure(options);
  console.log(options.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  CODE_CACHE_REJECTION,
  CODE_CACHE_DIAGNOSTICS_ENV,
  formatReport,
  median,
  parseArguments,
  percentile,
  positiveOddInteger,
  runProcess,
  summarize,
  targetArguments,
};
