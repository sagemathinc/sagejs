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
from sagejs.number_fields import prime_ideals

R = PolynomialRing(QQ, "x")
x = R.gen()
polynomial = x**3 - x**2 - 6*x - 12
kernel = prime_ideals._candidate_kernel.packed_prime_ideal_candidate_hnf_in_place

def build(variable):
    order = NumberField(polynomial, variable).maximal_order()
    started = time.perf_counter()
    plan = factor_bases.factor_base_plan(order, proof=True, theorem="minkowski")
    records = factor_bases.build_factor_base(plan)
    elapsed = time.perf_counter() - started
    payload = [record.to_dict() for record in records]
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return elapsed, hashlib.sha256(encoded).hexdigest()

# Warm module, native, maximal-order, and polynomial-factor paths once.
warm_seconds, digest = build("warm")
native = []
for index in range(${samples}):
    elapsed, current = build("native" + str(index))
    assert current == digest
    native.append(elapsed)

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
readable.sort()
print(json.dumps({
    "execution_mode": execution_mode(kernel),
    "warmup_seconds": warm_seconds,
    "native_samples_seconds": native,
    "native_median_seconds": native[len(native) // 2],
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
  schema: "sagejs.number-fields/prime-ideal-candidate-kernel-benchmark-v1",
  workload:
    "exact Minkowski factor-base plan and five-record construction for x^3-x^2-6*x-12, excluding maximal-order construction",
  base_commit: "62afd585cacae7b543bbe36a50fd39ac1cea9405",
  baseline_warm_seconds: 0.6085,
  sample_policy:
    "one warmup then fresh isomorphic fields; medians compare the production kernel with forced readable candidate construction",
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
    !["native", "native-capable", "compiled"].includes(measured.execution_mode)
  ) {
    throw new Error("candidate-kernel benchmark did not use the exact native path");
  }
}
