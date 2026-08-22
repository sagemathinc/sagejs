#!/usr/bin/env node
"use strict";

const { arch, platform } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const executable = process.env.SAGEJS_BENCH_EXECUTABLE || join(root, "bin", "sagejs");
const check = process.argv.includes("--check");
const repetitions = check ? 4 : 32;
const samples = check ? 2 : 5;

const source = String.raw`
import json
import time

import sagejs.number_fields.ideal_arithmetic as ideals
from sagejs.number_fields.class_group_factor_base import build_factor_base, factor_base_plan
from sagejs.number_fields.class_group_relations import ExactRelationCollector, LLLRelationSearch

R = PolynomialRing(QQ, "x")
x = R.gen()
K = NumberField(x**3 + 4*x - 1, "a")
O = K.maximal_order()
plan = factor_base_plan(O, proof=True, theorem="minkowski")
factor_base = tuple(record.prime_ideal for record in build_factor_base(plan))
collector = ExactRelationCollector(O, factor_base)
search = LLLRelationSearch(collector, seed=0, max_candidates_per_ideal=64)
elements = []
for target in range(len(factor_base)):
    row = tuple(1 if index == target else 0 for index in range(len(factor_base)))
    ideal = collector.reconstruct_factor_base_ideal(row)
    for element in search.iter_short_elements(ideal):
        if any(ideals.element_valuations(element, factor_base)):
            elements.append(element)
            break
assert len(elements) == len(factor_base) == 3

expected = [ideals.element_valuations(element, factor_base) for element in elements]

def measure(force_readable):
    timings = []
    saved = ideals._element_valuations_kernel_override
    if force_readable:
        ideals._element_valuations_kernel_override = False
    for _sample in range(${samples}):
        started = time.perf_counter_ns()
        observed = None
        for _repetition in range(${repetitions}):
            observed = [
                ideals.element_valuations(element, factor_base)
                for element in elements
            ]
        timings.append((time.perf_counter_ns() - started) / 1_000_000)
        assert observed == expected
    ideals._element_valuations_kernel_override = saved
    timings.sort()
    return {"samples_ms": timings, "median_ms": timings[len(timings) // 2]}

packed = measure(False)
readable = measure(True)
print(json.dumps({
    "schema": "sagejs.number-fields/element-valuations-benchmark-v1",
    "polynomial": [ -1, 4, 0, 1 ],
    "discriminant": int(K.discriminant()),
    "factor_base_bound": int(plan.bound),
    "factor_base_size": len(factor_base),
    "candidate_count": len(elements),
    "repetitions": ${repetitions},
    "expected": [list(row) for row in expected],
    "packed": packed,
    "readable": readable,
    "speedup": readable["median_ms"] / packed["median_ms"],
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
if (!(report.speedup > 1)) {
  throw new Error(`packed valuation kernel did not improve the readable path: ${report.speedup}`);
}
