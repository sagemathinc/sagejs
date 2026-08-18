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

from sagejs.native import execution_mode
import sagejs.number_fields.discriminant_components as dc
from sagejs.number_fields.discriminant_prefactor_kernel import (
    packed_composite_polynomial_split_hint_in_place,
)

coefficients = [${degree90.polynomial.coefficients.join(",")}]
equation_discriminant = ${degree90.equationDiscriminant}
kernel = packed_composite_polynomial_split_hint_in_place
dynamic = getattr(kernel, "__sagejs_native_source__", kernel)
diagnostic_only = ${process.argv.includes("--optimized-diagnostic") ? "True" : "False"}

def median(values):
    return sorted(values)[len(values) // 2]

def measure(operation, samples=5, rounds=1, warmups=1):
    for _warmup in range(warmups):
        operation()
    values = []
    result = None
    for _sample in range(samples):
        started = time.perf_counter_ns()
        for _round in range(rounds):
            result = operation()
        values.append((time.perf_counter_ns() - started) / (1000 * rounds))
    return {"median_us": median(values), "samples_us": values}, result

def normalized(result):
    if result["status"] == "split":
        return ("split", int(result["divisor"]))
    if result["status"] == "unresolved":
        return ("unresolved", 0)
    return ("gcd", 0)

if diagnostic_only:
    started = time.perf_counter_ns()
    certificate = dc.decompose_discriminant(coefficients, equation_discriminant)
    elapsed_us = (time.perf_counter_ns() - started) / 1000
    fingerprint = [
        (int(entry["base"]), int(entry["exponent"]), str(entry["state"]))
        for entry in certificate["components"]
    ]
    print(json.dumps({
        "schema": "sagejs.number-fields/discriminant-prefactor-diagnostic-v1",
        "kernel_execution_mode": execution_mode(kernel),
        "elapsed_us": elapsed_us,
        "certificate_valid": dc.check_decomposition_certificate(
            certificate, require_proven=False
        ),
        "components": fingerprint,
    }, sort_keys=True))
    raise SystemExit(0)

remaining = abs(equation_discriminant)
for prime in dc._small_primes(1000):
    while remaining % prime == 0:
        remaining //= prime
component = dc._classify_component(remaining, True, 200000)
modulus = component.base
residual_modulus = modulus
derivative = dc.polynomial_derivative(coefficients)

dynamic_timing, dynamic_result = measure(
    lambda: dc._packed_polynomial_split_hint(
        coefficients, derivative, modulus, kernel=dynamic
    ),
    samples=1,
    warmups=0,
)
compiled_timing, compiled_result = measure(
    lambda: dc._packed_polynomial_split_hint(
        coefficients, derivative, modulus, kernel=kernel
    ),
    samples=5,
)
oracle_timing, oracle_result = measure(
    lambda: dc.polynomial_gcd_mod_composite(
        coefficients, derivative, modulus
    ),
    samples=1,
    warmups=0,
)
assert dynamic_result is not None and compiled_result is not None
assert normalized(dynamic_result) == normalized(oracle_result)
assert normalized(compiled_result) == normalized(oracle_result)

saved_compiled = dc.is_compiled
dc.is_compiled = lambda function: False
try:
    readable_decomposition_timing, readable = measure(
        lambda: dc.decompose_discriminant(coefficients, equation_discriminant),
        samples=1,
        warmups=0,
    )
finally:
    dc.is_compiled = saved_compiled

compiled_decomposition_timing, compiled = measure(
    lambda: dc.decompose_discriminant(coefficients, equation_discriminant),
    samples=3,
)
def component_fingerprint(certificate):
    return [
        (int(entry["base"]), int(entry["exponent"]), str(entry["state"]))
        for entry in certificate["components"]
    ]

readable_fingerprint = component_fingerprint(readable)
compiled_fingerprint = component_fingerprint(compiled)
if readable["original"] != compiled["original"] or readable_fingerprint != compiled_fingerprint:
    raise AssertionError(json.dumps({
        "readable_components": readable_fingerprint,
        "compiled_components": compiled_fingerprint,
    }, sort_keys=True))
if not dc.check_decomposition_certificate(readable, require_proven=False):
    raise AssertionError("readable decomposition certificate failed replay")
if not dc.check_decomposition_certificate(compiled, require_proven=False):
    raise AssertionError("compiled decomposition certificate failed replay")

controls = []
for identifier, left, right, modulus in (
    ("small-split", [1, 0, 1], [1, 2], 6),
    ("small-no-split", [1, 0, 1], [1, 1], 15),
    ("small-unresolved", [21], [42], 21),
):
    timing, result = measure(
        lambda: dc._packed_polynomial_split_hint(
            left, right, modulus, kernel=kernel
        ),
        samples=7,
        rounds=100,
    )
    expected = dc.polynomial_gcd_mod_composite(left, right, modulus)
    assert result is not None and normalized(result) == normalized(expected)
    controls.append({"id": identifier, "timing": timing, "exact": True})

print(json.dumps({
    "schema": "sagejs.number-fields/discriminant-prefactorization-benchmark-v1",
    "case": "hecke-degree-90",
    "degree": len(coefficients) - 1,
    "residual_component_bits": residual_modulus.bit_length(),
    "kernel_execution_mode": execution_mode(kernel),
    "dynamic_kernel": dynamic_timing,
    "compiled_kernel": compiled_timing,
    "readable_gcd_oracle": oracle_timing,
    "readable_full_decomposition": readable_decomposition_timing,
    "compiled_full_decomposition": compiled_decomposition_timing,
    "speedup_kernel_vs_oracle": (
        oracle_timing["median_us"] / compiled_timing["median_us"]
    ),
    "speedup_full_decomposition": (
        readable_decomposition_timing["median_us"]
        / compiled_decomposition_timing["median_us"]
    ),
    "components_exact": readable_fingerprint == compiled_fingerprint,
    "controls": controls,
}, sort_keys=True))
`;

const temporary = mkdtempSync(join(tmpdir(), "sagejs-discriminant-prefactor-"));
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
      "bench",
      "results",
      "number-field-discriminant-prefactorization-2026-08-18.json",
    ),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
