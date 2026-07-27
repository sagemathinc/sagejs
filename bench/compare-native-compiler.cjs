"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const config = require("./native-kernel.config.cjs");
const mpc = require("../packages/flint");

const root = join(__dirname, "..");
const benchmarkSource = join(__dirname, "native-multiply-benchmark.sage");
const sagejs = join(root, "bin", "sagejs");
const sage =
  process.env.SAGELITE_SAGE || "/opt/cocalc-webdev-python/bin/sage";
const cases = [
  [53, 500000],
  [1000, 100000],
  [10000, 10000],
];
const kinds = ["real", "complex"];

function timingKey(kind, precision) {
  return `${kind}:${precision}`;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function execute(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`${label} exited with status ${result.status}`);
  }
  const timings = new Map();
  for (const line of result.stdout.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields[0] !== "RESULT") continue;
    const [, kind, precisionText, iterationsText, , elapsedText] = fields;
    const precision = Number(precisionText);
    const key = timingKey(kind, precision);
    const entry = timings.get(key) || {
      kind,
      precision,
      iterations: Number(iterationsText),
      samples: [],
    };
    entry.samples.push(Number(elapsedText));
    timings.set(key, entry);
  }
  assert.equal(timings.size, cases.length * kinds.length);
  return timings;
}

function sageLibraryVersions() {
  const code = [
    "import ctypes",
    "import sage.rings.real_mpfr as real_mpfr",
    "lib = ctypes.CDLL(real_mpfr.__file__)",
    "lib.mpfr_get_version.restype = ctypes.c_char_p",
    "print(lib.mpfr_get_version().decode(),",
    '      ctypes.c_char_p.in_dll(lib, "__gmp_version").value.decode())',
  ].join("\n");
  const result = spawnSync(sage, ["-c", code], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`unable to query SageMath libraries (${result.status})`);
  }
  const [mpfr, gmp] = result.stdout.trim().split(/\s+/);
  return { mpfr, gmp };
}

function complex(realText, imagText, precision) {
  return mpc.complexFromReals(
    mpc.realFromString(realText, precision),
    mpc.realFromString(imagText, precision),
  );
}

function rawComplexMultiply(precision, iterations) {
  let value = complex("1.25", "-0.75", precision);
  const step = complex(
    "1.0000000000000002",
    "0.0000000000000001",
    precision,
  );
  for (let index = 0; index < iterations; index += 1) {
    value = mpc.complexMul(value, step);
  }
  return value;
}

function rawRealMultiply(precision, iterations) {
  let value = mpc.realFromString("1.25", precision);
  const step = mpc.realFromString("1.0000000000000002", precision);
  for (let index = 0; index < iterations; index += 1)
    value = mpc.realMul(value, step);
  return value;
}

const generated = compileKernel({
  ...config,
  sourcePath: join(__dirname, config.sourcePath),
  cacheRoot: join(__dirname, config.cacheRoot),
});
const addon = require(generated.addonPath);

assert.equal(
  mpc.complexToString(addon.multiply_loop(53, 1000)),
  mpc.complexToString(rawComplexMultiply(53, 1000)),
  "generated loop changed MPC semantics",
);
assert.equal(
  mpc.realToString(addon.real_multiply_loop(53, 1000)),
  mpc.realToString(rawRealMultiply(53, 1000)),
  "generated loop changed MPFR semantics",
);

const nativeTimings = new Map();
for (const kind of kinds) {
  const nativeLoop =
    kind === "real" ? addon.real_multiply_loop : addon.multiply_loop;
  for (const [precision, iterations] of cases) {
    nativeLoop(precision, Math.min(iterations, 10000));
    const samples = [];
    for (let sample = 0; sample < 7; sample += 1) {
      const start = performance.now();
      const answer = nativeLoop(precision, iterations);
      samples.push((performance.now() - start) / 1000);
      assert.equal(
        kind === "real"
          ? mpc.realPrecision(answer)
          : mpc.complexPrecision(answer),
        precision,
      );
    }
    nativeTimings.set(timingKey(kind, precision), {
      kind,
      precision,
      iterations,
      samples,
    });
  }
}

const results = [
  ["native kernel", nativeTimings],
  [
    "Sage.js",
    execute("Sage.js", process.execPath, [sagejs, benchmarkSource]),
  ],
  ["SageMath", execute("SageMath", sage, [benchmarkSource])],
];
const sageVersions = sageLibraryVersions();

console.log(
  `Native kernel: MPFR ${mpc.mpfrVersion()}, GMP ${mpc.gmpVersion()}`,
);
console.log(
  `SageMath:      MPFR ${sageVersions.mpfr}, GMP ${sageVersions.gmp}`,
);
for (const kind of kinds) {
  console.log(`\n${kind.toUpperCase()} multiplication`);
  console.log(
    "precision runtime".padEnd(29),
    "median".padStart(10),
    "ns/iteration".padStart(15),
    "vs native".padStart(10),
  );
  console.log("-".repeat(68));
  const medians = new Map();
  for (const [label, timings] of results) {
    for (const [precision] of cases) {
      const entry = timings.get(timingKey(kind, precision));
      const seconds = median(entry.samples);
      const nanoseconds = (seconds * 1e9) / entry.iterations;
      medians.set(`${label}:${precision}`, nanoseconds);
      console.log(
        `${String(precision).padStart(5)} bits  ${label.padEnd(14)}`.padEnd(29),
        `${(seconds * 1000).toFixed(2)} ms`.padStart(10),
        nanoseconds.toFixed(1).padStart(15),
        label === "native kernel"
          ? "-".padStart(10)
          : `${(
              nanoseconds / medians.get(`native kernel:${precision}`)
            ).toFixed(1)}x`.padStart(10),
      );
    }
  }
}
