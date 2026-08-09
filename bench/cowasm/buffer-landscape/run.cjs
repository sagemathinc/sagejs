"use strict";

const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { cpus, freemem, hostname, loadavg, platform, release, totalmem } =
  require("node:os");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const directory = __dirname;
const root = resolve(directory, "..", "..", "..");
const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
const allIds = manifest.benchmarks.map((item) => item.id);

function usage() {
  console.log([
    "Usage: node bench/cowasm/buffer-landscape/run.cjs [options]",
    "",
    "  --samples N       Measured passes (default: 5)",
    "  --warmups N       Warmup passes (default: 2)",
    "  --only ID         Select a workload (repeatable)",
    "  --runtime NAME    Select a runtime (repeatable)",
    "  --strict          Fail when a selected runtime is unavailable",
    "  --json PATH       Write a machine-readable report",
  ].join("\n"));
}

function integer(flag, text, allowZero = false) {
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(flag + " requires " +
      (allowZero ? "a nonnegative" : "a positive") + " integer");
  }
  return value;
}

function argumentsFrom(argv) {
  const result = {
    samples: 5,
    warmups: 2,
    only: [],
    runtimes: [],
    strict: false,
    jsonPath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--samples") {
      result.samples = integer(argument, argv[++index]);
    } else if (argument === "--warmups") {
      result.warmups = integer(argument, argv[++index], true);
    } else if (argument === "--only") {
      result.only.push(argv[++index] || "");
    } else if (argument === "--runtime") {
      result.runtimes.push(argv[++index] || "");
    } else if (argument === "--strict") {
      result.strict = true;
    } else if (argument === "--json") {
      result.jsonPath = argv[++index] || "";
    } else if (["--help", "-h"].includes(argument)) {
      usage();
      process.exit(0);
    } else {
      throw new Error("unknown argument: " + argument);
    }
  }
  return result;
}

function version(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 15000,
  });
  if (result.error || result.status !== 0) return null;
  return (String(result.stdout || "") + String(result.stderr || ""))
    .trim().split("\n")[0];
}

function median(values) {
  return [...values].sort((left, right) => left - right)[
    Math.floor(values.length / 2)
  ];
}

function parseOutput(runtime, output, options, ids) {
  let protocol = false;
  let complete = null;
  const samples = Array.from({ length: options.samples }, () => new Map());
  for (const raw of output.split("\n")) {
    const fields = raw.trim().split(/\s+/);
    if (fields[0] === "SAGEJS_COWASM_BUFFERS" && fields[1] === "1") {
      protocol = true;
    } else if (["WARMUP", "RESULT"].includes(fields[0]) &&
        fields.length === 5) {
      const [kind, sampleText, id, elapsedText, answer] = fields;
      if (!ids.includes(id) || answer !== "ok") {
        throw new Error(runtime.label + " emitted invalid result " + raw);
      }
      if (kind === "RESULT") {
        const sample = Number(sampleText);
        const elapsed = Number(elapsedText);
        if (!samples[sample] || !Number.isFinite(elapsed) || elapsed < 0) {
          throw new Error(runtime.label + " emitted an invalid sample");
        }
        samples[sample].set(id, elapsed);
      }
    } else if (fields[0] === "COMPLETE" && fields.length === 4) {
      complete = fields.slice(1).map(Number);
    }
  }
  if (!protocol || complete === null ||
      complete[0] !== options.warmups || complete[1] !== options.samples ||
      complete[2] !== ids.length ||
      samples.some((sample) => sample.size !== ids.length)) {
    throw new Error(runtime.label + " emitted an incomplete protocol");
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
      ...runtime.env,
      SAGEJS_BUFFER_WARMUPS: String(options.warmups),
      SAGEJS_BUFFER_SAMPLES: String(options.samples),
      SAGEJS_BUFFER_ONLY: ids.join(","),
      PYTHONDONTWRITEBYTECODE: "1",
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      runtime.label + " failed\n" + (result.error?.message || "") + "\n" +
        result.stdout + "\n" + result.stderr,
    );
  }
  return parseOutput(runtime, result.stdout, options, ids);
}

function printTable(ids, measurements) {
  const width = Math.max(25, ...ids.map((id) => id.length));
  console.log([
    "benchmark".padEnd(width),
    ...measurements.map((item) => item.runtime.label.padStart(15)),
  ].join("  "));
  console.log("-".repeat(width + measurements.length * 17));
  for (const id of ids) {
    console.log([
      id.padEnd(width),
      ...measurements.map((item) =>
        (item.measurement.mediansNs[id] / 1e6).toFixed(3).padStart(12) + " ms"
      ),
    ].join("  "));
  }
}

function hashSources() {
  const files = [
    "manifest.json", "python.py", "native.cjs", "julia.jl", "c.c",
    "../native/numerical_buffers.py",
  ];
  return Object.fromEntries(files.map((relative) => [
    relative,
    createHash("sha256")
      .update(readFileSync(resolve(directory, relative)))
      .digest("hex"),
  ]));
}

function main() {
  const options = argumentsFrom(process.argv.slice(2));
  const ids = options.only.length === 0 ? allIds : [...new Set(options.only)];
  for (const id of ids) {
    if (!allIds.includes(id)) throw new Error("unknown workload " + id);
  }
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-buffer-landscape-"));
  try {
    const executable = join(temporary, "buffers-c");
    const compiler = process.env.CC || "cc";
    const compiled = spawnSync(
      compiler,
      ["-O3", "-std=c11", join(directory, "c.c"), "-lm", "-o", executable],
      { cwd: root, encoding: "utf8" },
    );
    if (compiled.error || compiled.status !== 0) {
      throw new Error("C compilation failed\n" + compiled.stderr);
    }
    const node = process.execPath;
    const python = process.env.SAGEJS_COWASM_PYTHON || "python3";
    const pypy = process.env.SAGEJS_COWASM_PYPY || "pypy3";
    const julia = process.env.SAGEJS_COWASM_JULIA || "julia";
    const nativeScript = join(directory, "native.cjs");
    const pythonScript = join(directory, "python.py");
    const runtimes = [
      {
        key: "native", label: "Sage.js AOT", command: node,
        args: [nativeScript], env: {},
        version: "Native Kernel v13; " + process.version + "; CC=" + compiler,
      },
      {
        key: "javascript", label: "Generated JS", command: node,
        args: [nativeScript], env: { SAGEJS_BUFFER_BACKEND: "javascript" },
        version: process.version,
      },
      {
        key: "cpython", label: "CPython", command: python,
        args: [pythonScript], env: {}, version: version(python, ["--version"]),
      },
      {
        key: "pypy", label: "PyPy", command: pypy,
        args: [pythonScript], env: {}, version: version(pypy, ["--version"]),
      },
      {
        key: "julia", label: "Julia", command: julia,
        args: [join(directory, "julia.jl")], env: {},
        version: version(julia, ["--version"]),
      },
      {
        key: "c", label: "C -O3", command: executable,
        args: [], env: {}, version: version(compiler, ["--version"]),
      },
    ];
    const requested = new Set(options.runtimes);
    const selectedRuntimes = runtimes.filter((runtime) =>
      requested.size === 0 || requested.has(runtime.key)
    );
    if (requested.size > 0) {
      const known = new Set(runtimes.map((runtime) => runtime.key));
      const missing = [...requested].filter((name) => !known.has(name));
      if (missing.length) throw new Error("unknown runtime " + missing.join(", "));
    }
    const measurements = [];
    const skipped = [];
    for (const runtime of selectedRuntimes) {
      if (runtime.version === null) {
        if (options.strict) throw new Error(runtime.label + " is unavailable");
        skipped.push({ key: runtime.key, reason: "unavailable" });
        continue;
      }
      console.log("Measuring " + runtime.label);
      measurements.push({
        runtime,
        measurement: execute(runtime, options, ids),
      });
    }
    printTable(ids, measurements);
    const cpu = cpus();
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      manifest,
      options: { ...options, ids },
      sourceHashes: hashSources(),
      host: {
        hostname: hostname(), platform: platform(), release: release(),
        architecture: process.arch, cpuModel: cpu[0]?.model,
        logicalCpuCount: cpu.length, totalMemoryBytes: totalmem(),
        freeMemoryBytes: freemem(), loadAverage: loadavg(),
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
    if (options.jsonPath) {
      writeFileSync(resolve(options.jsonPath), JSON.stringify(report, null, 2) + "\n");
      console.log("Wrote buffer landscape report to " + resolve(options.jsonPath));
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error("CoWasm buffer landscape: " + error.message);
  process.exitCode = 1;
}
