#!/usr/bin/env node
"use strict";

const { cpus, platform, arch } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const executable = process.env.SAGEJS_TEST_EXECUTABLE || join(root, "bin", "sagejs");
const samples = Number.parseInt(process.env.SAGEJS_BENCH_SAMPLES || "7", 10);
if (!Number.isSafeInteger(samples) || samples < 3 || samples > 25) {
  throw new Error("SAGEJS_BENCH_SAMPLES must be an integer in 3..25");
}

const source = String.raw`
import hashlib
import json
import time

from sagejs.native import execution_mode
from sagejs.number_fields import class_group_factor_base as factor_bases
from sagejs.number_fields import cubic_class_number
from sagejs.number_fields import prime_ideals

R = PolynomialRing(QQ, "x")
x = R.gen()
polynomial = x**3 - x**2 - 6*x - 12
kernel = prime_ideals._candidate_kernel.packed_prime_ideal_candidate_hnf_in_place
cubic_kernel = prime_ideals._candidate_kernel.packed_cubic_reduced_algebra_factors_in_place

def build(variable):
    order = NumberField(polynomial, variable).maximal_order()
    started = time.perf_counter()
    plan = factor_bases.factor_base_plan(order, proof=True, theorem="minkowski")
    records = factor_bases.build_factor_base(plan)
    elapsed = time.perf_counter() - started
    payload = [record.to_dict() for record in records]
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return elapsed, hashlib.sha256(encoded).hexdigest()

def build_packed_cubic(variable):
    order = NumberField(polynomial, variable).maximal_order()
    plan = factor_bases.factor_base_plan(order, proof=True, theorem="minkowski")
    started = time.perf_counter()
    records = cubic_class_number.packed_cubic_factor_records(plan)
    elapsed = time.perf_counter() - started
    assert records is not None
    payload = [record.to_dict() for record in records]
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return elapsed, hashlib.sha256(encoded).hexdigest()

# Warm module, native, maximal-order, and polynomial-factor paths once.
warm_seconds, digest = build("warm")
packed_warm_seconds, packed_digest = build_packed_cubic("packed_warm")
assert packed_digest == digest
native = []
for index in range(${samples}):
    elapsed, current = build("native" + str(index))
    assert current == digest
    native.append(elapsed)

cubic_native = []
for index in range(${samples}):
    elapsed, current = build_packed_cubic("cubic_native" + str(index))
    assert current == digest
    cubic_native.append(elapsed)

prime_ideals._cubic_reduced_algebra_kernel_override = False
cubic_readable_finite_algebra = []
try:
    for index in range(${samples}):
        elapsed, current = build_packed_cubic("cubic_readable" + str(index))
        assert current == digest
        cubic_readable_finite_algebra.append(elapsed)
finally:
    prime_ideals._cubic_reduced_algebra_kernel_override = None

saved = prime_ideals._packed_candidate_rows
def rejected(*args):
    return None
prime_ideals._packed_candidate_rows = rejected
readable = []
try:
    for index in range(${samples}):
        elapsed, current = build("readable" + str(index))
        assert current == digest
        readable.append(elapsed)
finally:
    prime_ideals._packed_candidate_rows = saved

native.sort()
cubic_native.sort()
cubic_readable_finite_algebra.sort()
readable.sort()
print(json.dumps({
    "execution_modes": {
        "candidate_hnf": execution_mode(kernel),
        "cubic_reduced_algebra": execution_mode(cubic_kernel),
    },
    "warmup_seconds": warm_seconds,
    "packed_cubic_warmup_seconds": packed_warm_seconds,
    "native_samples_seconds": native,
    "native_median_seconds": native[len(native) // 2],
    "cubic_native_samples_seconds": cubic_native,
    "cubic_native_median_seconds": cubic_native[len(cubic_native) // 2],
    "cubic_readable_finite_algebra_samples_seconds": cubic_readable_finite_algebra,
    "cubic_readable_finite_algebra_median_seconds": cubic_readable_finite_algebra[len(cubic_readable_finite_algebra) // 2],
    "cubic_reduced_algebra_speedup": cubic_readable_finite_algebra[len(cubic_readable_finite_algebra) // 2] / cubic_native[len(cubic_native) // 2],
    "readable_samples_seconds": readable,
    "readable_median_seconds": readable[len(readable) // 2],
    "speedup": readable[len(readable) // 2] / native[len(native) // 2],
    "payload_sha256": digest,
}, separators=(",", ":")))
`;

const result = spawnSync(executable, ["--python", "-"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: 180_000,
  maxBuffer: 10 * 1024 * 1024,
});
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const measured = JSON.parse(result.stdout.trim());
const report = {
  schema: "sagejs.number-fields/prime-ideal-candidate-kernel-benchmark-v2",
  workload:
    "exact Minkowski factor-base plan and five-record construction for x^3-x^2-6*x-12, excluding maximal-order construction",
  base_commit: "69d1d7e2b848ca3fe001e7084cbba9f7c47a4413",
  baseline_warm_seconds: 0.6085,
  sample_policy:
    "one warmup then fresh isomorphic fields; the generic factor-base samples isolate packed HNF materialization while the class-number packed-record samples isolate compiled cubic finite-algebra splitting",
  host: {
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    node: process.version,
  },
  measured,
};
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--check")) {
  if (
    measured.payload_sha256 !==
      "2262d9dce3278741e3b73e9d95eb70a2d81c2b86cc3436198cda58efcbfc5456" ||
    !Object.values(measured.execution_modes).every((mode) =>
      ["native", "native-capable", "compiled"].includes(mode),
    )
  ) {
    throw new Error("candidate-kernel benchmark did not use the exact native path");
  }
}
