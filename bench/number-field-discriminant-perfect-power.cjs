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
import sagejs.number_fields.discriminant_perfect_power_kernel as packed_power

coefficients = [${degree90.polynomial.coefficients.join(",")}]
equation_discriminant = ${degree90.equationDiscriminant}
kernel = packed_power.packed_perfect_power_data_in_place
dynamic = getattr(kernel, "__sagejs_native_source__", kernel)
readable_power = dc.perfect_power_data

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

readable_phase_ns = 0
readable_calls = []
def timed_readable(number):
    global readable_phase_ns
    started = time.perf_counter_ns()
    result = readable_power(number)
    readable_phase_ns += time.perf_counter_ns() - started
    readable_calls.append(int(number))
    return result

dc.perfect_power_data = timed_readable
try:
    readable_full, readable = measure(
        lambda: dc.decompose_discriminant(coefficients, equation_discriminant)
    )
finally:
    dc.perfect_power_data = readable_power

def accelerated_power(number):
    outcome = packed_power.validated_perfect_power_data(
        number, readable_power, kernel=kernel
    )
    return readable_power(number) if outcome is None else outcome

compiled_phase_ns = 0
compiled_calls = []
def timed_accelerated(number):
    global compiled_phase_ns
    started = time.perf_counter_ns()
    result = accelerated_power(number)
    compiled_phase_ns += time.perf_counter_ns() - started
    compiled_calls.append(int(number))
    return result

dc.perfect_power_data = timed_accelerated
try:
    compiled_full, compiled = measure(
        lambda: dc.decompose_discriminant(coefficients, equation_discriminant)
    )
finally:
    dc.perfect_power_data = readable_power

readable_fingerprint = fingerprint(readable)
compiled_fingerprint = fingerprint(compiled)
assert readable_fingerprint == compiled_fingerprint
assert dc.check_decomposition_certificate(readable, require_proven=False)
assert dc.check_decomposition_certificate(compiled, require_proven=False)
assert readable_calls == compiled_calls

representative = max(readable_calls, key=lambda number: abs(number).bit_length())
readable_batch, readable_result = measure(lambda: readable_power(representative))
compiled_batch, compiled_result = measure(
    lambda: packed_power.validated_perfect_power_data(
        representative, readable_power, kernel=kernel
    )
)
assert compiled_result == readable_result

dynamic_control, dynamic_result = measure(
    lambda: packed_power.validated_perfect_power_data(
        17**35, readable_power, kernel=dynamic
    )
)
assert dynamic_result == readable_power(17**35)

controls = []
for identifier, number in (
    ("positive-mixed-power", 6**30),
    ("negative-odd-power", -(19**21)),
    ("negative-even-magnitude", -(2**45)),
    ("large-nonpower", 170141183460469231731687303715884105727),
):
    expected = readable_power(number)
    actual = packed_power.validated_perfect_power_data(
        number, readable_power, kernel=kernel
    )
    assert actual == expected
    controls.append({"id": identifier, "exact": True})

print(json.dumps({
    "schema": "sagejs.number-fields/discriminant-perfect-power-benchmark-v1",
    "case": "hecke-degree-90",
    "degree": len(coefficients) - 1,
    "kernel_execution_mode": execution_mode(kernel),
    "readable_full_decomposition": readable_full,
    "compiled_full_decomposition": compiled_full,
    "readable_perfect_power_phase_us": readable_phase_ns / 1000,
    "compiled_perfect_power_phase_us": compiled_phase_ns / 1000,
    "perfect_power_call_count": len(readable_calls),
    "representative_bits": abs(representative).bit_length(),
    "representative_readable": readable_batch,
    "representative_compiled": compiled_batch,
    "dynamic_control": dynamic_control,
    "speedup_full_decomposition": (
        readable_full["median_us"] / compiled_full["median_us"]
    ),
    "speedup_perfect_power_phase": (
        readable_phase_ns / compiled_phase_ns
    ),
    "speedup_representative": (
        readable_batch["median_us"] / compiled_batch["median_us"]
    ),
    "components_exact": readable_fingerprint == compiled_fingerprint,
    "certificate_replay": True,
    "controls": controls,
}, sort_keys=True))
`;

const temporary = mkdtempSync(join(tmpdir(), "sagejs-discriminant-perfect-power-"));
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
      "number-field-discriminant-perfect-power-2026-08-18.json",
    ),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
}
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
