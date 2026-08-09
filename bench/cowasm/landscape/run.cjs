"use strict";

const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const directory = __dirname;
const root = resolve(directory, "..", "..", "..");
const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
const allIds = manifest.benchmarks.map((benchmark) => benchmark.id);
const expected = new Map(
  manifest.benchmarks.map((benchmark) => [benchmark.id, benchmark.expected]),
);

function usage() {
  console.log([
    "Usage: node bench/cowasm/landscape/run.cjs [options]",
    "",
    "Options:",
    "  --samples N              Measured in-process passes (default: 3)",
    "  --warmups N              Warmup passes (default: 1)",
    "  --only ID                Select an exact manifest id (repeatable)",
    "  --runtime NAME           Select a runtime (repeatable)",
    "  --strict                 Fail rather than skip unavailable runtimes",
    "  --json PATH              Write a machine-readable report",
    "  --help                   Show this help",
    "",
    "The runner compares algorithm-equivalent translations, not language builtins.",
    "Magma may be selected with SAGEJS_COWASM_MAGMA=/path/to/magma.",
  ].join("\n"));
}

function positiveInteger(flag, text, allowZero = false) {
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(
      flag + " requires " +
      (allowZero ? "a nonnegative" : "a positive") +
      " integer",
    );
  }
  return value;
}

function parseArguments(argv) {
  const result = {
    samples: 3,
    warmups: 1,
    only: [],
    runtimes: [],
    strict: false,
    jsonPath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--samples") {
      result.samples = positiveInteger(argument, argv[++index]);
    } else if (argument === "--warmups") {
      result.warmups = positiveInteger(argument, argv[++index], true);
    } else if (argument === "--only") {
      result.only.push(argv[++index] || "");
    } else if (argument === "--runtime") {
      result.runtimes.push(argv[++index] || "");
    } else if (argument === "--strict") {
      result.strict = true;
    } else if (argument === "--json") {
      result.jsonPath = argv[++index] || "";
    } else if (argument === "--help" || argument === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error("unknown argument: " + argument);
    }
  }
  return result;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function commandVersion(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 15000,
  });
  if (result.error || result.status !== 0) return null;
  return (String(result.stdout || "") + String(result.stderr || ""))
    .trim().split("\n")[0];
}

function parseOutput(runtime, output, options, ids) {
  const samples = Array.from({ length: options.samples }, () => new Map());
  let version = null;
  let complete = null;
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (line === "SAGEJS_COWASM_LANDSCAPE 1") {
      version = 1;
      continue;
    }
    const fields = line.split(/\s+/);
    if ((fields[0] === "WARMUP" || fields[0] === "RESULT") && fields.length === 5) {
      const [kind, sampleText, id, elapsedText, answer] = fields;
      if (!ids.includes(id)) {
        throw new Error(runtime.label + " emitted unknown id " + id);
      }
      if (answer !== expected.get(id)) {
        throw new Error(
          runtime.label + " " + id + " returned " + answer +
          "; expected " + expected.get(id),
        );
      }
      const sample = Number(sampleText);
      const elapsedNs = Number(elapsedText);
      if (!Number.isFinite(elapsedNs) || elapsedNs < 0) {
        throw new Error(runtime.label + " emitted invalid timing for " + id);
      }
      if (kind === "RESULT") {
        if (!samples[sample]) {
          throw new Error(runtime.label + " emitted extra sample");
        }
        samples[sample].set(id, elapsedNs);
      }
      continue;
    }
    if (fields[0] === "COMPLETE" && fields.length === 4) {
      complete = fields.slice(1).map(Number);
    }
  }
  if (version !== 1) {
    throw new Error(runtime.label + " omitted the protocol header");
  }
  if (
    complete === null ||
    complete[0] !== options.warmups ||
    complete[1] !== options.samples ||
    complete[2] !== ids.length
  ) {
    throw new Error(runtime.label + " emitted inconsistent COMPLETE metadata");
  }
  for (const [index, sample] of samples.entries()) {
    if (sample.size !== ids.length) {
      throw new Error(runtime.label + " sample " + index + " is incomplete");
    }
  }
  return {
    samplesNs: Object.fromEntries(
      ids.map((id) => [id, samples.map((sample) => sample.get(id))]),
    ),
    mediansNs: Object.fromEntries(
      ids.map((id) => [id, median(samples.map((sample) => sample.get(id)))]),
    ),
  };
}

function execute(runtime, options, ids) {
  const result = spawnSync(runtime.command, runtime.args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_LANDSCAPE_WARMUPS: String(options.warmups),
      SAGEJS_LANDSCAPE_SAMPLES: String(options.samples),
      SAGEJS_LANDSCAPE_ONLY: ids.join(","),
      PYTHONDONTWRITEBYTECODE: "1",
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(runtime.label + " failed to start: " + result.error.message);
  }
  if (result.status !== 0) {
    throw new Error(
      runtime.label + " exited " + result.status + "\n" +
      result.stdout + "\n" + result.stderr,
    );
  }
  return parseOutput(runtime, result.stdout, options, ids);
}

function sourceHashes() {
  const result = {};
  const sources = [
    ["landscape/manifest.json", join(directory, "manifest.json")],
    ["landscape/python.py", join(directory, "python.py")],
    ["landscape/native.cjs", join(directory, "native.cjs")],
    ["landscape/julia.jl", join(directory, "julia.jl")],
    ["landscape/pari.gp", join(directory, "pari.gp")],
    ["landscape/magma.m", join(directory, "magma.m")],
    ["landscape/c.c", join(directory, "c.c")],
    ["native/scalar_exact.py", join(directory, "..", "native", "scalar_exact.py")],
    ["native/scalar_float.py", join(directory, "..", "native", "scalar_float.py")],
    ["src/nt.py", join(directory, "..", "src", "nt.py")],
    ["src/native_number_theory.py", join(directory, "..", "src", "native_number_theory.py")],
    ["src/numbers.py", join(directory, "..", "src", "numbers.py")],
    ["src/fib.py", join(directory, "..", "src", "fib.py")],
    ["src/mypyc_micro.py", join(directory, "..", "src", "mypyc_micro.py")],
  ];
  for (const [name, sourcePath] of sources) {
    result[name] = createHash("sha256")
      .update(readFileSync(sourcePath))
      .digest("hex");
  }
  return result;
}

function printTable(ids, measurements) {
  const nameWidth = Math.max(20, ...ids.map((id) => id.length));
  const columnWidth = 13;
  console.log([
    "benchmark".padEnd(nameWidth),
    ...measurements.map((item) => item.runtime.label.padStart(columnWidth)),
  ].join("  "));
  console.log("-".repeat(nameWidth + (columnWidth + 2) * measurements.length));
  for (const id of ids) {
    console.log([
      id.padEnd(nameWidth),
      ...measurements.map((item) => {
        const nanoseconds = item.measurement.mediansNs[id];
        if (nanoseconds === undefined) return "—".padStart(columnWidth);
        const milliseconds = nanoseconds / 1e6;
        const digits = milliseconds < 10 ? 3 : 1;
        const specification = manifest.benchmarks.find(
          (benchmark) => benchmark.id === id,
        );
        const marker = specification.optimizerMayElide &&
          nanoseconds < 10000 ? "*" : "";
        return (milliseconds.toFixed(digits) + " ms" + marker).padStart(columnWidth);
      }),
    ].join("  "));
  }
  console.log(
    "* compiler may have algebraically eliminated this fixed-input pure loop",
  );
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const ids = options.only.length === 0 ? allIds : [...new Set(options.only)];
  for (const id of ids) {
    if (!allIds.includes(id)) throw new Error("unknown benchmark id: " + id);
  }
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-landscape-"));
  try {
    const executable = join(temporary, "landscape-c");
    const compiler = process.env.CC || "cc";
    const compilation = spawnSync(
      compiler,
      ["-O3", "-std=c11", join(directory, "c.c"), "-lm", "-o", executable],
      { cwd: root, encoding: "utf8" },
    );
    const cAvailable = !compilation.error && compilation.status === 0;
    const magma = process.env.SAGEJS_COWASM_MAGMA || "magma";
    const definitions = [
      {
        key: "sagejs",
        label: "Sage.js",
        command: process.execPath,
        args: [join(root, "bin", "sagejs"), "--python", join(directory, "python.py")],
        version: "Sage.js " + require(join(root, "package.json")).version +
          "; " + process.version,
        available: true,
      },
      {
        key: "cpython",
        label: "CPython",
        command: process.env.SAGEJS_COWASM_PYTHON || "python3",
        args: [join(directory, "python.py")],
        versionArgs: ["--version"],
      },
      {
        key: "native",
        label: "Sage.js AOT",
        command: process.execPath,
        args: [join(directory, "native.cjs")],
        version: "Native Kernel v12; " + process.version +
          "; CC=" + (process.env.CC || "cc"),
        available: true,
        supportedIds: [
          "prime_counting", "gcd_loop", "xgcd_loop", "inverse_mod_loop",
          "sum_stride", "recursive_fibonacci", "int_to_float",
          "float_abs", "int_divmod",
        ],
      },
      {
        key: "pypy",
        label: "PyPy",
        command: process.env.SAGEJS_COWASM_PYPY || "pypy3",
        args: [join(directory, "python.py")],
        versionArgs: ["--version"],
      },
      {
        key: "julia",
        label: "Julia",
        command: process.env.SAGEJS_COWASM_JULIA || "julia",
        args: ["--startup-file=no", join(directory, "julia.jl")],
        versionArgs: ["--version"],
      },
      {
        key: "pari",
        label: "PARI/GP",
        command: process.env.SAGEJS_COWASM_GP || "gp",
        args: ["-q", "-f", join(directory, "pari.gp")],
        versionArgs: ["--version"],
      },
      {
        key: "magma",
        label: "Magma",
        command: magma,
        args: ["-b", join(directory, "magma.m")],
        versionArgs: ["-v"],
        version: process.env.SAGEJS_COWASM_MAGMA
          ? "Magma executable " + magma
          : undefined,
        available: process.env.SAGEJS_COWASM_MAGMA ? true : undefined,
      },
      {
        key: "c",
        label: "C -O3",
        command: executable,
        args: [],
        version: cAvailable ? commandVersion(compiler, ["--version"]) : null,
        available: cAvailable,
      },
    ];
    const selection = options.runtimes.length === 0
      ? null
      : new Set(options.runtimes);
    if (selection !== null) {
      for (const key of selection) {
        if (!definitions.some((runtime) => runtime.key === key)) {
          throw new Error("unknown runtime: " + key);
        }
      }
    }
    const runtimes = definitions.filter(
      (runtime) => selection === null || selection.has(runtime.key),
    );
    const skipped = [];
    const measurements = [];
    for (const runtime of runtimes) {
      if (runtime.version === undefined) {
        runtime.version = commandVersion(
          runtime.command,
          runtime.versionArgs || ["--version"],
        );
      }
      if (runtime.available === undefined) runtime.available = runtime.version !== null;
      if (!runtime.available) {
        skipped.push({
          key: runtime.key,
          label: runtime.label,
          command: runtime.command,
        });
        if (options.strict) throw new Error(runtime.label + " is unavailable");
        console.error("Skipping unavailable runtime: " + runtime.label);
        continue;
      }
      console.error(
        "Measuring " + runtime.label + ": " + options.warmups +
        " warmup, " + options.samples + " samples",
      );
      const runtimeIds = runtime.supportedIds === undefined
        ? ids
        : ids.filter((id) => runtime.supportedIds.includes(id));
      if (runtimeIds.length === 0) {
        skipped.push({
          key: runtime.key,
          label: runtime.label,
          reason: "selected benchmarks are not supported",
        });
        continue;
      }
      measurements.push({
        runtime,
        measurement: execute(runtime, options, runtimeIds),
      });
    }
    printTable(ids, measurements);
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      manifest: {
        path: "bench/cowasm/landscape/manifest.json",
        sourceHashes: sourceHashes(),
        benchmarks: manifest.benchmarks.filter((benchmark) =>
          ids.includes(benchmark.id)),
      },
      options: {
        warmups: options.warmups,
        samples: options.samples,
      },
      runtimes: measurements.map(({ runtime, measurement }) => ({
        key: runtime.key,
        label: runtime.label,
        command: runtime.command,
        version: runtime.version,
        ...measurement,
      })),
      skipped,
    };
    if (options.jsonPath !== null) {
      const outputPath = resolve(options.jsonPath);
      writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
      console.log("Wrote landscape report to " + outputPath);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error("CoWasm landscape: " + error.message);
  process.exitCode = 1;
}
