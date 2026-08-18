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
import sagejs.number_fields.discriminant_primality_kernel as screen

coefficients = [${degree90.polynomial.coefficients.join(",")}]
equation_discriminant = ${degree90.equationDiscriminant}
bases = list(dc._PROBABLE_BASES)
kernel = screen.packed_strong_probable_prime_screen_in_place
dynamic = getattr(kernel, "__sagejs_native_source__", kernel)

def median(values):
    return sorted(values)[len(values) // 2]

def measure(operation, samples=1, warmups=0):
    for _warmup in range(warmups):
        operation()
    values = []
    result = None
    for _sample in range(samples):
        started = time.perf_counter_ns()
        result = operation()
        values.append((time.perf_counter_ns() - started) / 1000)
    return {"median_us": median(values), "samples_us": values}, result

def fingerprint(certificate):
    return [
        (int(entry["base"]), int(entry["exponent"]), str(entry["state"]))
        for entry in certificate["components"]
    ]

def readable_status(number):
    value = int(number)
    if value < 2:
        return dc.COMPOSITE, {"kind": "less-than-two", "value": value}
    for prime in dc._small_primes(47):
        if value == prime:
            return dc.PROVEN_PRIME, {"kind": "trial-prime", "prime": value}
        if value % prime == 0:
            return dc.COMPOSITE, {"kind": "factor", "factor": prime}
    theorem_bases = dc._MR64_BASES if value < (1 << 64) else bases
    for base in theorem_bases:
        if dc._miller_rabin_witness(value, base):
            return dc.COMPOSITE, {"kind": "miller-rabin-witness", "base": base}
    if value < (1 << 64):
        return dc.PROVEN_PRIME, {
            "kind": "deterministic-miller-rabin-64",
            "prime": value,
            "bases": list(dc._MR64_BASES),
        }
    return dc.PROBABLE_PRIME, {
        "kind": "strong-probable-prime",
        "value": value,
        "bases": list(bases),
    }

readable_phase_ns = 0
readable_calls = []
def timed_readable(number):
    global readable_phase_ns
    started = time.perf_counter_ns()
    result = readable_status(number)
    readable_phase_ns += time.perf_counter_ns() - started
    readable_calls.append(int(number))
    return result

dc.primality_status = timed_readable
try:
    readable_full, readable = measure(
        lambda: dc.decompose_discriminant(coefficients, equation_discriminant)
    )
finally:
    dc.primality_status = readable_status

def accelerated_status(number):
    value = int(number)
    if value < (1 << 64):
        return readable_status(value)
    for prime in dc._small_primes(47):
        if value == prime:
            return dc.PROVEN_PRIME, {"kind": "trial-prime", "prime": value}
        if value % prime == 0:
            return dc.COMPOSITE, {"kind": "factor", "factor": prime}
    outcome = screen.validated_strong_probable_prime_screen(
        value, bases, dc._miller_rabin_witness, kernel=kernel
    )
    if outcome is None:
        return readable_status(value)
    if outcome["status"] == "witness":
        return dc.COMPOSITE, {
            "kind": "miller-rabin-witness",
            "base": int(outcome["base"]),
        }
    return dc.PROBABLE_PRIME, {
        "kind": "strong-probable-prime",
        "value": value,
        "bases": list(bases),
    }

compiled_phase_ns = 0
compiled_calls = []
def timed_accelerated(number):
    global compiled_phase_ns
    started = time.perf_counter_ns()
    result = accelerated_status(number)
    compiled_phase_ns += time.perf_counter_ns() - started
    compiled_calls.append(int(number))
    return result

dc.primality_status = timed_accelerated
try:
    compiled_full, compiled = measure(
        lambda: dc.decompose_discriminant(coefficients, equation_discriminant)
    )
finally:
    dc.primality_status = readable_status

readable_fingerprint = fingerprint(readable)
compiled_fingerprint = fingerprint(compiled)
assert readable_fingerprint == compiled_fingerprint
assert dc.check_decomposition_certificate(readable, require_proven=False)
assert dc.check_decomposition_certificate(compiled, require_proven=False)
assert readable_calls == compiled_calls

large_inputs = [number for number in readable_calls if number >= (1 << 64)]
assert large_inputs
representative = max(large_inputs, key=lambda number: number.bit_length())

def readable_batch():
    for index, base in enumerate(bases):
        if dc._miller_rabin_witness(representative, base):
            return ("witness", index, base)
    return ("survivor", -1, -1)

def packed_batch(candidate):
    outcome = screen.validated_strong_probable_prime_screen(
        representative, bases, dc._miller_rabin_witness, kernel=candidate
    )
    assert outcome is not None
    if outcome["status"] == "witness":
        return ("witness", int(outcome["index"]), int(outcome["base"]))
    return ("survivor", -1, -1)

readable_batch_timing, readable_batch_result = measure(readable_batch)
dynamic_batch_timing, dynamic_batch_result = measure(lambda: packed_batch(dynamic))
compiled_batch_timing, compiled_batch_result = measure(
    lambda: packed_batch(kernel), samples=5, warmups=1
)
assert dynamic_batch_result == readable_batch_result
assert compiled_batch_result == readable_batch_result

controls = []
for identifier, number in (
    ("first-witness", 18446744073709551619),
    ("later-witness", 18446744073709551617),
    ("survivor", 18446744073709551629),
):
    expected = next(
        (
            ("witness", index, base)
            for index, base in enumerate(bases)
            if dc._miller_rabin_witness(number, base)
        ),
        ("survivor", -1, -1),
    )
    outcome = screen.validated_strong_probable_prime_screen(
        number, bases, dc._miller_rabin_witness, kernel=kernel
    )
    assert outcome is not None
    actual = (
        ("witness", int(outcome["index"]), int(outcome["base"]))
        if outcome["status"] == "witness"
        else ("survivor", -1, -1)
    )
    assert actual == expected
    controls.append({"id": identifier, "exact": True})

print(json.dumps({
    "schema": "sagejs.number-fields/discriminant-primality-screen-benchmark-v1",
    "case": "hecke-degree-90",
    "degree": len(coefficients) - 1,
    "kernel_execution_mode": execution_mode(kernel),
    "readable_full_decomposition": readable_full,
    "compiled_full_decomposition": compiled_full,
    "readable_primality_phase_us": readable_phase_ns / 1000,
    "compiled_primality_phase_us": compiled_phase_ns / 1000,
    "primality_call_count": len(readable_calls),
    "representative_bits": representative.bit_length(),
    "readable_batch": readable_batch_timing,
    "dynamic_batch": dynamic_batch_timing,
    "compiled_batch": compiled_batch_timing,
    "speedup_full_decomposition": (
        readable_full["median_us"] / compiled_full["median_us"]
    ),
    "speedup_primality_phase": (
        readable_phase_ns / compiled_phase_ns
    ),
    "speedup_representative_batch": (
        readable_batch_timing["median_us"] / compiled_batch_timing["median_us"]
    ),
    "components_exact": readable_fingerprint == compiled_fingerprint,
    "certificate_replay": True,
    "controls": controls,
}, sort_keys=True))
`;

const temporary = mkdtempSync(join(tmpdir(), "sagejs-discriminant-primality-"));
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
      "number-field-discriminant-primality-screen-2026-08-18.json",
    ),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
