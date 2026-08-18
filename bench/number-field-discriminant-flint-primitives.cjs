#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { cpus, loadavg, platform, release, tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const sagejs = resolve(process.env.SAGEJS_BIN || join(root, "bin", "sagejs"));
const corpus = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const degree90 = corpus.cases.find(({ id }) => id === "hecke-degree-90");
assert.ok(degree90);

const program = String.raw`
import json
import time

import sagejs.number_fields.discriminant_components as dc
from sagejs.number_fields.discriminant_flint_primitives import (
    large_primality_hint,
    perfect_power_hint,
)

coefficients = [${degree90.polynomial.coefficients.join(",")}]
equation_discriminant = ${degree90.equationDiscriminant}
readable_power = dc.perfect_power_data
readable_primality = dc.primality_status

def median(values):
    return sorted(values)[len(values) // 2]

def measure(operation, samples=3, warmups=1):
    for _warmup in range(warmups):
        operation()
    values = []
    result = None
    for _sample in range(samples):
        started = time.perf_counter_ns()
        result = operation()
        values.append((time.perf_counter_ns() - started) / 1000)
    return {"median_us": median(values), "samples_us": values}, result

def accelerated_power(value):
    result = perfect_power_hint(value, readable_power)
    return readable_power(value) if result is None else result

def accelerated_primality(value):
    number = int(value)
    # Preserve the readable small-prime evidence before consulting a
    # scheduling-only FLINT screen.
    if number < 2 or number < 1 << 64:
        return readable_primality(number)
    for prime in dc._small_primes(47):
        if number == prime or number % prime == 0:
            return readable_primality(number)
    result = large_primality_hint(number, dc._miller_rabin_witness, dc._PROBABLE_BASES)
    return readable_primality(number) if result is None else result

def fingerprint(certificate):
    return [
        (int(entry["base"]), int(entry["exponent"]), str(entry["state"]))
        for entry in certificate["components"]
    ]

remaining = abs(equation_discriminant)
for small_prime in dc._small_primes(1000):
    while remaining % small_prime == 0:
        remaining //= small_prime

readable_power_phase, readable_power_result = measure(
    lambda: readable_power(remaining), samples=1, warmups=0
)
flint_power_phase, flint_power_result = measure(
    lambda: accelerated_power(remaining), samples=5, warmups=1
)
if readable_power_result != flint_power_result:
    raise AssertionError("perfect-power phase result mismatch")

readable_prime_phase, readable_prime_result = measure(
    lambda: readable_primality(remaining), samples=1, warmups=0
)
flint_prime_phase, flint_prime_result = measure(
    lambda: accelerated_primality(remaining), samples=5, warmups=1
)
if readable_prime_result[0] != flint_prime_result[0]:
    raise AssertionError("primality phase classification mismatch")

readable_full_phase, readable_certificate = measure(
    lambda: dc.decompose_discriminant(coefficients, equation_discriminant),
    samples=1,
    warmups=0,
)
dc.perfect_power_data = accelerated_power
dc.primality_status = accelerated_primality
try:
    flint_full_phase, flint_certificate = measure(
        lambda: dc.decompose_discriminant(coefficients, equation_discriminant),
        samples=3,
        warmups=1,
    )
finally:
    dc.perfect_power_data = readable_power
    dc.primality_status = readable_primality

readable_fingerprint = fingerprint(readable_certificate)
flint_fingerprint = fingerprint(flint_certificate)
if readable_fingerprint != flint_fingerprint:
    raise AssertionError(json.dumps({
        "readable": readable_fingerprint,
        "flint": flint_fingerprint,
    }, sort_keys=True))
if not dc.check_decomposition_certificate(readable_certificate, require_proven=False):
    raise AssertionError("readable certificate failed")
if not dc.check_decomposition_certificate(flint_certificate, require_proven=False):
    raise AssertionError("FLINT-scheduled certificate failed")

print(json.dumps({
    "schema": "sagejs.number-fields/discriminant-flint-primitives-benchmark-v1",
    "case": "hecke-degree-90",
    "degree": len(coefficients) - 1,
    "residual_bits": remaining.bit_length(),
    "readable_perfect_power": readable_power_phase,
    "flint_perfect_power": flint_power_phase,
    "readable_primality": readable_prime_phase,
    "flint_primality": flint_prime_phase,
    "readable_full_decomposition": readable_full_phase,
    "flint_full_decomposition": flint_full_phase,
    "perfect_power_speedup": (
        readable_power_phase["median_us"] / flint_power_phase["median_us"]
    ),
    "primality_speedup": (
        readable_prime_phase["median_us"] / flint_prime_phase["median_us"]
    ),
    "full_speedup": (
        readable_full_phase["median_us"] / flint_full_phase["median_us"]
    ),
    "components_exact": readable_fingerprint == flint_fingerprint,
}, sort_keys=True))
`;

const temporary = mkdtempSync(join(tmpdir(), "sagejs-discriminant-flint-"));
const script = join(temporary, "benchmark.py");
writeFileSync(script, program);
const run = spawnSync(process.execPath, [sagejs, script], {
  cwd: root,
  encoding: "utf8",
  timeout: 120_000,
  env: {
    ...process.env,
    OPENBLAS_NUM_THREADS: "1",
    OMP_NUM_THREADS: "1",
  },
});
rmSync(temporary, { recursive: true, force: true });
assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);

const measured = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
const receipt = {
  ...measured,
  generated_at: new Date().toISOString(),
  source_commit: spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).stdout.trim(),
  host: {
    platform: platform(),
    release: release(),
    architecture: process.arch,
    node: process.version,
    cpu: cpus()[0]?.model ?? "unknown",
    load_average: loadavg(),
  },
};

if (process.argv.includes("--write-receipt")) {
  writeFileSync(
    join(
      root,
      "bench/results/number-field-discriminant-flint-primitives-2026-08-18.json",
    ),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
