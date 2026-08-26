#!/usr/bin/env node
"use strict";

const { arch, platform } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const executable = process.env.SAGEJS_BENCH_EXECUTABLE || join(root, "bin", "sagejs");
const check = process.argv.includes("--check");
const repetitions = check ? 5 : 20;

const source = String.raw`
import json
import time
import sagejs.native as native_module
import sagejs.number_fields.class_unit_analytic as analytic
import sagejs.number_fields.zeta_coefficient_kernel as kernels

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 + 4*x - 1, "a")
O = K.maximal_order()
workspace = analytic.ZetaLogResidueWorkspace(
    abs(int(O.discriminant())), 3, O.splitting_records
)
threshold, _tail, _evaluations = workspace.threshold(
    analytic.RationalEndpoint(1, 16), 128, 1_000_000
)
primes = workspace.rational_primes_below(threshold)
splitting = workspace.splitting_types(primes, 4096)
kernel = kernels.assemble_bf_prime_power_plan_in_place
assert native_module.is_compiled(kernel)

def measure(builder):
    timings = []
    answer = None
    for _repetition in range(${repetitions}):
        started = time.perf_counter_ns()
        answer = builder(threshold, splitting)
        timings.append((time.perf_counter_ns() - started) / 1_000_000)
    timings.sort()
    return answer, timings, timings[len(timings) // 2]

readable, readable_samples, readable_median = measure(
    analytic._build_bf_plan_readable
)
packed, packed_samples, packed_median = measure(analytic._build_bf_plan_kernel)
assert packed is not None
assert packed.terms == readable.terms
assert packed.raw_terms == readable.raw_terms
print(json.dumps({
    "schema": "sagejs.number-fields/bf-prime-power-plan-benchmark-v1",
    "field_polynomial": "x^3 + 4*x - 1",
    "discriminant": int(O.discriminant()),
    "threshold": threshold,
    "rational_primes": len(primes),
    "raw_terms": readable.raw_terms,
    "aggregated_terms": readable.aggregated_terms,
    "repetitions": ${repetitions},
    "readable_samples_ms": readable_samples,
    "readable_median_ms": readable_median,
    "packed_samples_ms": packed_samples,
    "packed_median_ms": packed_median,
    "speedup": readable_median / packed_median,
}, separators=(",", ":")))
`;

const result = spawnSync(executable, ["--python", "-"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: 120_000,
});
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}
const report = {
  ...JSON.parse(result.stdout.trim()),
  host: { platform: platform(), arch: arch() },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!(report.speedup > 1.2)) {
  throw new Error(`packed BF plan did not improve the readable path: ${report.speedup}`);
}
