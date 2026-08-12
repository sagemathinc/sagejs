#!/usr/bin/env node
"use strict";

// Reproducible cross-runtime companion to dense-matrix-public-audit.cjs for the
// Apple Silicon machine used during Sage Days. Every measurement gets a fresh
// process. Setup is deliberately outside the timed region; `first_ms` is the
// first invocation of the operation, not process startup or data construction.

const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, relative, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const sagejsVersion = require(join(root, "package.json")).version;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(`Usage: node bench/macos-arm64-math-witness.cjs [options]

  --runtime VALUE   sagejs, sage, or all (default: sagejs)
  --sage PATH       SageMath executable required by sage/all
  --samples N       Warm samples per operation (default: 5)
  --quick           Run formatting and construct/multiply smoke cases
  --filter REGEXP   Select operation names
  --output PATH     Write the complete JSON report
  --markdown PATH   Write a Markdown timing table
  --render-report PATH
                    Render an existing JSON report without benchmarking
  --check           Fail on execution, round-trip, or comparable-result errors
  --require-macos   With --check, require a Darwin arm64 host

Run bench/dense-matrix-public-audit.cjs separately for canonical dense matrix
construction, arithmetic, RREF, determinant, characteristic polynomial,
solving, kernel, and backend-route measurements.
`);
  process.exit(0);
}

function argument(name, fallback = undefined) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const samples = Number(argument("--samples", "5"));
const requestedRuntime = argument("--runtime", "sagejs");
const sage = argument("--sage", process.env.SAGEJS_BENCH_SAGE);
const output = argument("--output");
const markdown = argument("--markdown");
const reportInput = argument("--render-report");
const quick = process.argv.includes("--quick");
const check = process.argv.includes("--check");
const requireMacos = process.argv.includes("--require-macos");
const filterText = argument("--filter");
const filter = filterText ? new RegExp(filterText) : null;

assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 31);
assert.ok(["sagejs", "sage", "all"].includes(requestedRuntime));
if ((requestedRuntime === "sage" || requestedRuntime === "all") && !sage) {
  throw new Error("--runtime sage/all requires --sage PATH");
}

// Dense construction and arithmetic are intentionally not duplicated here.
// `dense-matrix-public-audit.cjs` is the canonical benchmark for construction,
// add/subtract/multiply, RREF, determinant, characteristic polynomial, solve,
// kernels, and backend routes.  This companion covers its two deliberate
// omissions: formatting/serialization and univariate polynomials.
const domains = {
  ZZ: { text: 100, serial: 200 },
  QQ: { text: 80, serial: 150 },
  GF2: { text: 100, serial: 500 },
  GF7: { text: 100, serial: 500 },
  GFword: { text: 80, serial: 300 },
};

const cases = [];
for (const [domain, size] of Object.entries(domains)) {
  cases.push(
    {
      name: `${domain}.matrix.str`,
      family: "matrix",
      setup: `A = make_matrix("${domain}", ${size.text}, ${size.text}, 23)`,
      operation: "A.str()",
      summary: "text_summary(result)",
      quick: true,
    },
    {
      name: `${domain}.matrix.dump`,
      family: "matrix",
      setup: `A = make_matrix("${domain}", ${size.serial}, ${size.serial}, 31)`,
      operation: "dumps(A)",
      summary: "[len(result), loads(result) == A]",
      comparable: false,
    },
    {
      name: `${domain}.matrix.load`,
      family: "matrix",
      setup: `A = make_matrix("${domain}", ${size.serial}, ${size.serial}, 31)\npacket = dumps(A)`,
      operation: "loads(packet)",
      summary: "matrix_summary(result) + [result == A]",
      comparable: false,
    },
  );
}

for (const domain of ["ZZ", "QQ", "GF7", "GFword"]) {
  cases.push(
    {
      name: `${domain}.polynomial.construct`,
      family: "polynomial",
      setup: `R = polynomial_ring("${domain}")\nraw = make_raw("${domain}", 5001, 101)`,
      operation: "R(raw)",
      summary: "polynomial_summary(result)",
      quick: true,
    },
    {
      name: `${domain}.polynomial.multiply`,
      family: "polynomial",
      setup: `R = polynomial_ring("${domain}")\nA = make_polynomial("${domain}", 2000, 107)\nB = make_polynomial("${domain}", 2000, 109)`,
      operation: "A * B",
      summary: "polynomial_summary(result)",
      quick: true,
    },
    {
      name: `${domain}.polynomial.gcd`,
      family: "polynomial",
      setup: `R = polynomial_ring("${domain}")\nx = R.gen()\nshared = make_polynomial("${domain}", 500, 113)\nA = shared * (x**503 + x + 1)\nB = shared * (x**509 + x**2 + 1)`,
      operation: "A.gcd(B)",
      summary: "polynomial_summary(result)",
    },
    {
      name: `${domain}.polynomial.factor`,
      family: "polynomial",
      setup: `R = polynomial_ring("${domain}")\nx = R.gen()\nA = x**120 - 1`,
      operation: "A.factor()",
      summary: "factor_summary(result)",
      comparable: false,
    },
    {
      name: `${domain}.polynomial.str`,
      family: "polynomial",
      setup: `R = polynomial_ring("${domain}")\nx = R.gen()\nA = x**5000 - 3*x**2500 + 7*x - 11`,
      operation: "str(A)",
      summary: "text_summary(result)",
    },
    {
      name: `${domain}.polynomial.dump`,
      family: "polynomial",
      setup: `R = polynomial_ring("${domain}")\nA = make_polynomial("${domain}", 5000, 127)`,
      operation: "dumps(A)",
      summary: "[len(result), loads(result) == A]",
      comparable: false,
    },
    {
      name: `${domain}.polynomial.load`,
      family: "polynomial",
      setup: `R = polynomial_ring("${domain}")\nA = make_polynomial("${domain}", 5000, 127)\npacket = dumps(A)`,
      operation: "loads(packet)",
      summary: "polynomial_summary(result) + [result == A]",
      comparable: false,
    },
  );
}

const selectedCases = cases.filter(
  (entry) => (!quick || entry.quick) && (!filter || filter.test(entry.name)),
);

const prelude = String.raw`
import json
import time

SAMPLES = ${samples}

def ring(name):
    if name == "ZZ":
        return ZZ
    if name == "QQ":
        return QQ
    if name == "GF2":
        return GF(2)
    if name == "GF7":
        return GF(7)
    if name == "GFword":
        return GF(2305843009213693951)
    raise ValueError("unknown domain")

def raw_integer(index, offset):
    value = (1103515245 * (index + 1 + offset) + 12345) % 2147483647
    return (value % 2001) - 1000

def make_raw(name, count, offset):
    if name == "QQ":
        return [QQ(raw_integer(i, offset)) / (((i + 3 * offset) % 31) + 1) for i in range(count)]
    if name == "GF2":
        return [((i + offset) * 1664525 + 1013904223) & 1 for i in range(count)]
    if name == "GF7":
        return [raw_integer(i, offset) % 7 for i in range(count)]
    if name == "GFword":
        return [((i + 1 + offset) * 6364136223846793005 + 1442695040888963407) % 2305843009213693951 for i in range(count)]
    return [raw_integer(i, offset) for i in range(count)]

def make_matrix(name, rows, columns, offset):
    return matrix(ring(name), rows, columns, make_raw(name, rows * columns, offset))

def polynomial_ring(name):
    return PolynomialRing(ring(name), "x")

def make_polynomial(name, degree, offset):
    R = polynomial_ring(name)
    values = make_raw(name, degree + 1, offset)
    values[degree] = ring(name)(1)
    return R(values)

def matrix_summary(value):
    rows = value.nrows()
    columns = value.ncols()
    if rows == 0 or columns == 0:
        return [rows, columns]
    return [rows, columns, str(value[0, 0]), str(value[rows - 1, columns - 1]), str(value[rows // 2, columns // 2])]

def polynomial_summary(value):
    degree = int(value.degree())
    if degree < 0:
        return [degree]
    return [degree, str(value[0]), str(value[degree]), str(value[degree // 2])]

def text_summary(value):
    return [len(value), value[:32], value[-32:]]

def factor_summary(value):
    multiplicity = 0
    for item in value:
        multiplicity += int(item[1])
    # Sage's preparser may leave this as a Sage Integer.  Emit a string so the
    # witness has the same JSON-safe representation in both runtimes.
    return [len(value), str(multiplicity)]

`;

function pythonSource(entry) {
  return `${prelude}\n${entry.setup}\n\ndef operation():\n    return ${entry.operation}\n\nstarted = time.perf_counter()\nresult = operation()\nfirst_ms = 1000 * (time.perf_counter() - started)\nfirst_summary = ${entry.summary}\noperation()\noperation()\nsamples = []\nfor repeat in range(${samples}):\n    started = time.perf_counter()\n    result = operation()\n    samples.append(1000 * (time.perf_counter() - started))\nsamples.sort()\nsummary = ${entry.summary}\nprint("SAGEJS_MACOS_WITNESS " + json.dumps({"first_ms": first_ms, "warm_ms": samples[len(samples) // 2], "summary": summary, "first_summary_matches": first_summary == summary}, separators=(",", ":")))\n`;
}

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function flintVersion() {
  const header = join(root, "packages", "flint", ".native", "prefix", "include", "flint", "flint.h");
  if (!existsSync(header)) return null;
  const match = readFileSync(header, "utf8").match(/^#define FLINT_VERSION "([^"]+)"/m);
  return match?.[1] || null;
}

function nativeArtifactEvidence() {
  const indexPath = join(root, "dist", "native-kernels", "index.json");
  if (!existsSync(indexPath)) return [];
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const representatives = [
    ["sagejs/kernels/matrix/dense_rational_flint.py", "flint"],
    ["sagejs/kernels/matrix/dense_prime_field_fflas.py", "fflas"],
  ];
  return representatives.flatMap(([logicalSource, library]) => {
    const metadata = index.logicalSources?.[logicalSource];
    if (!metadata) return [];
    const artifact = join(
      root,
      "dist",
      "native-kernels",
      metadata.cacheKey,
      "build",
      "Release",
      "sagejs_native_kernel.node",
    );
    if (!existsSync(artifact)) return [];
    const linkage = process.platform === "darwin" ? commandOutput("otool", ["-L", artifact]) : null;
    return [{
      library,
      logical_source: logicalSource,
      cache_key: metadata.cacheKey,
      path: relative(root, artifact),
      file_identity: commandOutput("file", [artifact]),
      linked_libraries: linkage
        ? linkage.split("\n").slice(1).map((line) => line.trim().split(/\s+/)[0]).filter(Boolean)
        : null,
    }];
  });
}

function runCase(runtime, command, entry, directory) {
  const source = join(directory, `${entry.name.replaceAll(".", "-")}.sage`);
  writeFileSync(source, pythonSource(entry));
  const started = performance.now();
  const result = spawnSync(
    runtime === "sagejs" ? process.execPath : command,
    runtime === "sagejs" ? [sagejs, source] : [source],
    {
    cwd: root,
    encoding: "utf8",
    timeout: 10 * 60_000,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      OPENBLAS_NUM_THREADS: "1",
      OMP_NUM_THREADS: "1",
      VECLIB_MAXIMUM_THREADS: "1",
      SAGEJS_NATIVE_REQUIRED: runtime === "sagejs" ? "1" : process.env.SAGEJS_NATIVE_REQUIRED,
    },
    },
  );
  const processMs = performance.now() - started;
  if (result.error || result.status !== 0) {
    return {
      name: entry.name,
      family: entry.family,
      comparable: entry.comparable !== false,
      ok: false,
      process_ms: processMs,
      error: String(result.error || result.stderr || result.stdout).slice(0, 4000),
    };
  }
  const line = result.stdout
    .split("\n")
    .find((candidate) => candidate.startsWith("SAGEJS_MACOS_WITNESS "));
  if (!line) {
    return {
      name: entry.name,
      family: entry.family,
      comparable: entry.comparable !== false,
      ok: false,
      process_ms: processMs,
      error: `missing result sentinel: ${result.stdout.slice(-2000)}`,
    };
  }
  return {
    name: entry.name,
    family: entry.family,
    comparable: entry.comparable !== false,
    ok: true,
    process_ms: processMs,
    ...JSON.parse(line.slice("SAGEJS_MACOS_WITNESS ".length)),
  };
}

function runtimeVersion(runtime, command) {
  return runtime === "sagejs"
    ? sagejsVersion
    : commandOutput(command, ["--version"]);
}

function markdownReport(value) {
  const hasSagejs = Boolean(value.measurements.sagejs);
  const hasSage = Boolean(value.measurements.sage);
  const lines = [
    "# macOS arm64 mathematical performance witness",
    "",
    `Generated from Sage.js commit \`${value.repository.commit}\` on \`${value.host.cpu || `${value.host.platform}-${value.host.architecture}`}\`.`,
    "",
    "Dense construction, arithmetic, RREF, determinant, characteristic polynomial, solving, kernels, and backend routes are measured by the canonical `bench/dense-matrix-public-audit.cjs`. This companion intentionally measures matrix formatting/serialization and univariate polynomials.",
    "",
    "`first` is the first invocation in a fresh runtime process after untimed setup. It is not process startup. `warm` is the median after that first call and two additional untimed warmups. All BLAS/OpenMP thread caps are one.",
    "",
  ];
  if (hasSagejs && hasSage) {
    lines.push(
      "| operation | Sage.js first | Sage.js warm | Sage warm | ratio | status |",
      "| :-- | --: | --: | --: | --: | :-- |",
    );
    const sageByName = new Map(value.measurements.sage.map((entry) => [entry.name, entry]));
    for (const entry of value.measurements.sagejs) {
      const oracle = sageByName.get(entry.name);
      const ratio = entry.comparable && entry.ok && oracle?.ok
        ? entry.warm_ms / oracle.warm_ms
        : null;
      const status = !entry.ok
        ? "Sage.js failed"
        : oracle && !oracle.ok
          ? "Sage failed"
          : entry.comparable
            ? "ok"
            : "runtime-local";
      lines.push(`| ${entry.name} | ${entry.ok ? entry.first_ms.toFixed(3) : "—"} ms | ${entry.ok ? entry.warm_ms.toFixed(3) : "—"} ms | ${oracle?.ok ? `${oracle.warm_ms.toFixed(3)} ms` : "—"} | ${ratio === null ? "—" : `${ratio.toFixed(2)}×`} | ${status} |`);
    }
  } else {
    const runtime = hasSagejs ? "Sage.js" : "Sage";
    const entries = hasSagejs ? value.measurements.sagejs : value.measurements.sage;
    lines.push(
      `| operation | ${runtime} first | ${runtime} warm | status |`,
      "| :-- | --: | --: | :-- |",
    );
    for (const entry of entries || []) {
      const status = !entry.ok ? "failed" : entry.comparable ? "ok" : "runtime-local";
      lines.push(`| ${entry.name} | ${entry.ok ? entry.first_ms.toFixed(3) : "—"} ms | ${entry.ok ? entry.warm_ms.toFixed(3) : "—"} ms | ${status} |`);
    }
  }
  lines.push("", "Serialization byte lengths and timings are intentionally not compared: Sage.js uses SagePack while SageMath's `dumps` currently uses its own Python serialization. Matrix/scalar/polynomial summaries are compared where the public result has a common canonical meaning.", "");
  return lines.join("\n");
}

if (reportInput) {
  const rendered = `${markdownReport(JSON.parse(readFileSync(resolve(reportInput), "utf8")))}\n`;
  if (markdown) writeFileSync(resolve(markdown), rendered);
  process.stdout.write(rendered);
  process.exit(0);
}

const runtimes = requestedRuntime === "all"
  ? [["sagejs", sagejs], ["sage", sage]]
  : requestedRuntime === "sage"
    ? [["sage", sage]]
    : [["sagejs", sagejs]];

const directory = mkdtempSync(join(tmpdir(), "sagejs-macos-arm64-witness-"));
const measurements = {};
try {
  for (const [runtime, executable] of runtimes) {
    const command = runtime === "sagejs" ? executable : sage;
    measurements[runtime] = [];
    for (const entry of selectedCases) {
      const measurement = runCase(runtime, command, entry, directory);
      measurements[runtime].push(measurement);
      const marker = measurement.ok ? measurement.warm_ms.toFixed(3) : "FAILED";
      process.stderr.write(`${runtime.padEnd(6)} ${entry.name.padEnd(32)} ${marker} ms\n`);
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}

const report = {
  schema: "sagejs.benchmark/macos-arm64-math-witness-v1",
  generated_at: new Date().toISOString(),
  host: {
    platform: process.platform,
    architecture: process.arch,
    uname: commandOutput("uname", ["-a"]),
    macos: process.platform === "darwin" ? commandOutput("sw_vers", []) : null,
    cpu: process.platform === "darwin" ? commandOutput("sysctl", ["-n", "machdep.cpu.brand_string"]) : null,
    memory_bytes: process.platform === "darwin" ? Number(commandOutput("sysctl", ["-n", "hw.memsize"])) : null,
  },
  repository: {
    commit: commandOutput("git", ["rev-parse", "HEAD"]),
    branch: commandOutput("git", ["branch", "--show-current"]),
    dirty: commandOutput("git", ["status", "--porcelain"]) !== "",
  },
  toolchain: {
    pnpm: commandOutput("pnpm", ["--version"]),
    clang: commandOutput("clang", ["--version"])?.split("\n")[0] || null,
    flint: flintVersion(),
    native_artifacts: nativeArtifactEvidence(),
  },
  configuration: {
    samples,
    quick,
    filter: filterText || null,
    timing: "fresh-process first invocation and same-process warmed median; setup excluded",
    threads: 1,
  },
  runtimes: Object.fromEntries(runtimes.map(([runtime, command]) => [runtime, {
    executable: runtime === "sagejs" ? sagejs : command,
    version: runtimeVersion(runtime, command),
    node_version: runtime === "sagejs" ? process.version : undefined,
  }])),
  measurements,
};

if (measurements.sagejs && measurements.sage) {
  const sageByName = new Map(measurements.sage.map((entry) => [entry.name, entry]));
  report.comparison = measurements.sagejs.map((entry) => {
    const oracle = sageByName.get(entry.name);
    const summariesMatch = !entry.comparable || !entry.ok || !oracle?.ok
      ? null
      : JSON.stringify(entry.summary) === JSON.stringify(oracle.summary);
    return {
      name: entry.name,
      comparable: entry.comparable,
      sagejs_over_sage: entry.comparable && entry.ok && oracle?.ok
        ? entry.warm_ms / oracle.warm_ms
        : null,
      summaries_match: summariesMatch,
    };
  });
}

const encoded = `${JSON.stringify(report, null, 2)}\n`;
if (output) writeFileSync(resolve(output), encoded);
if (markdown) writeFileSync(resolve(markdown), `${markdownReport(report)}\n`);

if (check) {
  if (requireMacos) {
    assert.equal(process.platform, "darwin", "the recorded witness must run on macOS");
    assert.equal(process.arch, "arm64", "the recorded witness must run on arm64");
    assert.match(report.toolchain.clang || "", /^Apple clang version /);
    assert.ok(report.toolchain.flint, "the recorded witness requires a FLINT version");
    const artifacts = new Map(report.toolchain.native_artifacts.map((entry) => [entry.library, entry]));
    assert.match(artifacts.get("flint")?.file_identity || "", /Mach-O 64-bit bundle arm64/);
    assert.match(artifacts.get("fflas")?.file_identity || "", /Mach-O 64-bit bundle arm64/);
    assert.ok(
      artifacts.get("fflas")?.linked_libraries?.some((path) => path.includes("Accelerate.framework")),
      "the recorded FFLAS witness must link Apple's Accelerate framework",
    );
  }
  for (const [runtime, entries] of Object.entries(measurements)) {
    assert.equal(entries.filter((entry) => !entry.ok).length, 0, `${runtime} has failed cases`);
    assert.equal(entries.filter((entry) => entry.ok && !entry.first_summary_matches).length, 0, `${runtime} has unstable summaries`);
  }
  for (const entry of report.comparison || []) {
    assert.notEqual(entry.summaries_match, false, `${entry.name} differs from SageMath`);
  }
}

process.stdout.write(encoded);
