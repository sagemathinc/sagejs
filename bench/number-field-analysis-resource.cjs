#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { cpus, loadavg, release, tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.platform === "win32") {
  throw new Error("the cross-platform lifecycle test covers Windows; this timing witness is Unix-only");
}

const root = resolve(__dirname, "..");
const sagejs = resolve(process.env.SAGEJS_BIN || join(root, "bin", "sagejs"));
const prefix = resolve(process.env.SAGEJS_FLINT_PREFIX ||
  join(root, "packages", "flint", ".native", "prefix"));
const ids = [
  "motivating-degree-7",
  "sage-essential-discriminant",
  "lmfdb-3.1.431.1",
  "lmfdb-5.1.17161.1",
  "pari-2510",
  "pari-1710",
];
const rounds = [5000, 5000, 5000, 2000, 100, 20];
const samples = Number(process.env.SAGEJS_NF_ANALYSIS_SAMPLES || 7);
const warmups = Number(process.env.SAGEJS_NF_ANALYSIS_WARMUPS || 4);
assert(Number.isSafeInteger(samples) && samples >= 3);
assert(Number.isSafeInteger(warmups) && warmups >= 0);

function run(command, args, timeout = 300_000, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout,
    env: {
      ...process.env,
      OPENBLAS_NUM_THREADS: "1",
      OMP_NUM_THREADS: "1",
      ...extraEnv,
    },
  });
  assert.equal(result.status, 0,
    `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function compile(source, output) {
  const libraries = ["flint", "openblas", "mpc", "mpfr", "gmp"]
    .map((name) => join(prefix, "lib", `lib${name}.a`));
  run(process.env.CC || "cc", [
    "-std=c11", "-O3", "-Wall", "-Wextra", "-Werror",
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(prefix, "include")}`,
    join(root, "bench", source),
    ...libraries, "-lm", "-lpthread", "-o", output,
  ], 120_000);
}

function median(values) {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)];
}

function integer(buffer, cursor) {
  const header = buffer.readUInt32LE(cursor.offset);
  cursor.offset += 4;
  const length = header & 0x7fffffff;
  let value = 0n;
  for (let index = 0; index < length; index++) {
    value |= BigInt(buffer[cursor.offset + index]) << BigInt(8 * index);
  }
  cursor.offset += length;
  return (header & 0x80000000) === 0 ? value : -value;
}

function evidence(report, fused) {
  const buffer = Buffer.from(report.payloadHex, "hex");
  const cursor = { offset: fused ? 80 : 64 };
  const values = Array.from({ length: fused ? 5 : 4 }, () => integer(buffer, cursor));
  const selected = fused
    ? [values[1], values[2], values[3], values[4]]
    : [values[0], values[1], values[2], values[3]];
  return {
    denominator: selected[0].toString(),
    index: selected[1].toString(),
    equationDiscriminant: selected[2].toString(),
    orderDiscriminant: selected[3].toString(),
  };
}

function measure(executable, caseIndex, fused) {
  const timings = [];
  let final;
  for (let sample = 0; sample < samples; sample++) {
    final = JSON.parse(run(executable, [String(caseIndex), String(warmups), String(rounds[caseIndex])]));
    timings.push(final.meanUs);
  }
  return {
    medianUs: median(timings),
    samplesUs: timings,
    payloadBytes: Buffer.from(final.payloadHex, "hex").length,
    evidence: evidence(final, fused),
  };
}

function measureGeneratedHost(temporary, nativeEnvironment) {
  const script = join(temporary, "generated-host.py");
  const coefficients = [
    [3, -2, 0, 0, 0, 0, 0, 1],
    [8, -2, 1, 1],
    [-8, -1, 0, 1],
    [2, 1, -1, 2, -1, 1],
    [3136, 0, -3136, 0, 840, 0, -56, 0, 1],
    [-25772600, 0, 0, 0, 0, -29080, 0, 0, 0, 0, 1],
  ];
  const hostRounds = [3, 5, 5, 3, 1, 1];
  writeFileSync(script, `
import json
import os
import time
import sagejs.ffi.flint as flint
import sagejs.number_fields.field_analysis_resource as analysis
from sagejs.native import is_compiled
from sagejs.number_fields.field_analysis_resource import decode_field_analysis_resource, native_field_analysis

identifiers = ${JSON.stringify(ids)}
coefficient_cases = ${JSON.stringify(coefficients)}
round_cases = ${JSON.stringify(hostRounds)}
warmups = ${warmups}
samples = ${samples}
include_public = os.getenv("SAGEJS_NF_ANALYSIS_PUBLIC_CONTROL") == "1"

def median(values):
    return sorted(values)[len(values) // 2]

def measure(operation, rounds):
    for _warmup in range(warmups):
        operation()
    values = []
    for _sample in range(samples):
        started = time.perf_counter()
        for _round in range(rounds):
            operation()
        values.append(1000000 * (time.perf_counter() - started) / rounds)
    return {"medianUs": median(values), "samplesUs": values}

results = []
for identifier, coefficients, rounds in zip(identifiers, coefficient_cases, round_cases):
    polynomial = flint.fmpz_polynomial(len(coefficients))
    for index, value in enumerate(coefficients):
        flint.fmpz_polynomial_set_coefficient(polynomial, index, value)
    flint.fmpz_polynomial_seal(polynomial)

    def transfer():
        resource = flint.number_field_analyze_resource(polynomial, 1, 1000)
        try:
            return list(resource.copy_bytes())
        finally:
            resource.close()

    payload = transfer()
    checked = decode_field_analysis_resource(
        payload, expected_polynomial=coefficients, expected_scale=1
    )
    transfer_timing = measure(transfer, rounds)
    checker_timing = measure(
        lambda: decode_field_analysis_resource(
            payload, expected_polynomial=coefficients, expected_scale=1
        ),
        rounds,
    )
    end_to_end_timing = measure(
        lambda: native_field_analysis(coefficients, 1, 1000), rounds
    )
    polynomial.close()
    results.append({
        "id": identifier,
        "roundsPerSample": rounds,
        "generatedHostTransfer": transfer_timing,
        "independentChecker": checker_timing,
        "endToEnd": end_to_end_timing,
        "certified": checked.certified,
        "locallyCertifiedPrimes": checked.locally_certified_primes,
    })

public_results = []
if include_public:
    ring = PolynomialRing(QQ, "x")
    NumberField(ring([-1, -1, 1]), "warm").maximal_order()
    for identifier, coefficients, rounds in zip(
        identifiers, coefficient_cases, round_cases
    ):
        def public_maximal_order():
            field = NumberField(ring(coefficients), "a")
            order = field.maximal_order()
            assert order.is_maximal()
            return order
        public_results.append({
            "id": identifier,
            "freshPublicMaximalOrder": measure(public_maximal_order, rounds),
        })

print(json.dumps({
    "checkerCompiled": is_compiled(
        analysis.packed_field_analysis_fixed_points_are_valid
    ),
    "results": results,
    "publicControl": public_results,
}))
`);
  return JSON.parse(run(process.execPath, [sagejs, script], 300_000, nativeEnvironment)
    .trim().split(/\r?\n/).at(-1));
}

const temporary = mkdtempSync(join(tmpdir(), "sagejs-nf-analysis-bench-"));
try {
  const fusedExecutable = join(temporary, "fused");
  const directExecutable = join(temporary, "direct");
  compile("number-field-analysis-resource-witness.c", fusedExecutable);
  compile("number-field-order-resource-witness.c", directExecutable);
  const cases = ids.map((id, index) => {
    const fused = measure(fusedExecutable, index, true);
    const direct = measure(directExecutable, index, false);
    assert.deepEqual(fused.evidence, direct.evidence,
      `${id}: fused partial order differs from the certified direct resource`);
    return {
      id,
      roundsPerSample: rounds[index],
      fused,
      directWithPrimeHints: direct,
      fusedToDirectRatio: fused.medianUs / direct.medianUs,
    };
  });
  const checkerSource = join(
    root,
    "src",
    "lib",
    "sagejs",
    "number_fields",
    "field_analysis_resource.py",
  );
  const nativeCache = join(temporary, "native-cache");
  const explanation = run(process.execPath, [
    sagejs,
    "native",
    "explain",
    checkerSource,
    "--function",
    "packed_field_analysis_fixed_points_are_valid",
  ]);
  assert.match(explanation, /source-transparent: yes/);
  assert.match(explanation, /host boundary: 1 public crossing\/call/);
  assert.match(explanation, /0 callbacks inside core/);
  run(process.execPath, [
    sagejs,
    "native",
    "compile",
    checkerSource,
    "--cache-root",
    nativeCache,
  ], 120_000);
  const generatedHost = measureGeneratedHost(temporary, {
    SAGEJS_NATIVE_CACHE_DIR: nativeCache,
    SAGEJS_NF_ANALYSIS_PUBLIC_CONTROL: "1",
  });
  const dynamicControl = measureGeneratedHost(temporary, {
    SAGEJS_NATIVE_DISABLE: "1",
  });
  assert.equal(generatedHost.checkerCompiled, true);
  assert.equal(dynamicControl.checkerCompiled, false);
  const checkerSpeedups = generatedHost.results.map((result, index) => ({
    id: result.id,
    checker: dynamicControl.results[index].independentChecker.medianUs /
      result.independentChecker.medianUs,
    endToEnd: dynamicControl.results[index].endToEnd.medianUs /
      result.endToEnd.medianUs,
    versusPublic: generatedHost.publicControl[index]
      .freshPublicMaximalOrder.medianUs / result.endToEnd.medianUs,
  }));
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.number-field-analysis-resource-benchmark/v2",
    commit: run("git", ["rev-parse", "HEAD"]),
    environment: {
      platform: `${process.platform}-${process.arch}`,
      osRelease: release(),
      cpu: cpus()[0]?.model || "unknown",
      loadAverageAtReport: loadavg(),
      node: process.version,
      compiler: run(process.env.CC || "cc", ["--version"]).split("\n")[0],
      flint: "3.6.0",
      openblasThreads: 1,
    },
    policy: {
      samples,
      warmups,
      trialBound: 1000,
      timedBoundary: "already sealed integral polynomial to allocated immutable resource",
      caveat: "The fused path discovers bounded components; the direct oracle receives exact local index-prime hints. Generated host transfer and independent Python authentication are outside both kernel timings.",
      checkerKernel: "one source-transparent GMP crossing with zero callbacks; dynamic control executes the identical Python body",
    },
    cases,
    generatedHost: generatedHost.results,
    dynamicControl: dynamicControl.results,
    publicControl: generatedHost.publicControl,
    checkerSpeedups,
  }, null, 2)}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
