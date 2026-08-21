#!/usr/bin/env node
"use strict";

const { cpus, platform, arch } = require("node:os");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const root = join(__dirname, "..");
const executable = process.env.SAGEJS_BENCH_EXECUTABLE || join(root, "bin", "sagejs");
const check = process.argv.includes("--check");

const source = String.raw`
import json
import time

from sagejs.number_fields.class_group_relations import (
    ExactRelationCollector,
    LLLRelationSearch,
    minkowski_lll_lattice,
    plan_automorphism_orbits,
)

R = PolynomialRing(QQ, "x")
x = R.gen()
workloads = (
    ("real-quadratic", x**2 - x - 1, (2, 5)),
    ("nonreal-cubic", x**3 + 2, (2, 3, 5)),
)
results = []
for name, polynomial, rational_primes in workloads:
    K = NumberField(polynomial, "a")
    O = K.maximal_order()
    factor_base = []
    for rational_prime in rational_primes:
        factor_base.extend(O.factor_rational_prime(rational_prime).prime_ideals())
    collector = ExactRelationCollector(O, factor_base)
    ideal = O.ideal(1)
    warm = minkowski_lll_lattice(ideal, precision=128)
    assert warm.verify(ideal)
    samples = []
    repetitions = 8
    digest = None
    for _sample in range(5):
        started = time.perf_counter_ns()
        for _repetition in range(repetitions):
            plan = minkowski_lll_lattice(ideal, precision=128)
            search = LLLRelationSearch(
                collector,
                seed=17,
                max_candidates_per_ideal=12,
                embedding_precision=128,
            )
            candidates = search.short_elements(ideal)
            assert plan.verify(ideal)
            assert search.last_lattice_plan.verify(ideal)
            digest = {
                "signature": list(plan.signature),
                "transform": [list(row) for row in plan.transform],
                "candidate_count": len(candidates),
                "first_candidate": str(candidates[0]),
            }
        samples.append((time.perf_counter_ns() - started) / 1000000)
    samples.sort()
    results.append({
        "kind": "minkowski-lll",
        "name": name,
        "degree": K.degree(),
        "repetitions": repetitions,
        "median_ms": samples[len(samples) // 2],
        "samples_ms": samples,
        "digest": digest,
    })

# Representative exact orbit workload: construct and authenticate the split
# factor-base action, admit one parent relation, derive its conjugate, and
# replay the detached result.
K = NumberField(x**2 - x - 1, "a")
O = K.maximal_order()
split_base = O.factor_rational_prime(11).prime_ideals()
parent_element = K(4) * K.gen() + K(1)
warm_orbit = plan_automorphism_orbits(K, split_base)
assert warm_orbit.available and warm_orbit.useful and warm_orbit.verify()
samples = []
repetitions = 8
digest = None
for _sample in range(5):
    started = time.perf_counter_ns()
    for _repetition in range(repetitions):
        plan = plan_automorphism_orbits(K, split_base)
        collector = ExactRelationCollector(O, split_base)
        parent = collector.admit_witness(parent_element)
        derived = collector.admit_automorphism_orbit(parent, plan=plan)
        assert derived is not None
        replay = derived.record.verify(O, split_base)
        assert replay["certified"]
        digest = {
            "permutation": list(plan.permutation),
            "parent_row": list(parent.record.row),
            "derived_row": list(derived.record.row),
            "detached_replay": replay["certified"],
        }
    samples.append((time.perf_counter_ns() - started) / 1000000)
samples.sort()
results.append({
    "kind": "quadratic-automorphism-orbit",
    "name": "real-quadratic-split-prime",
    "degree": K.degree(),
    "repetitions": repetitions,
    "median_ms": samples[len(samples) // 2],
    "samples_ms": samples,
    "digest": digest,
})
print(json.dumps(results, separators=(",", ":")))
`;

const result = spawnSync(executable, ["--python", "-"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: 120_000,
  env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const results = JSON.parse(result.stdout.trim());
const report = {
  schema: "sagejs.number-fields/class-relation-search-benchmark-v2",
  boundary:
    "128-bit Minkowski LLL search plus authenticated quadratic factor-base permutation, exact conjugate admission, and detached replay",
  samples: 5,
  host: {
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    node: process.version,
  },
  results,
};
console.log(JSON.stringify(report, null, 2));

if (check) {
  for (const entry of results) {
    if (entry.median_ms > 10_000) {
      throw new Error(`${entry.name} ${entry.median_ms}ms exceeds 10000ms`);
    }
    if (entry.kind === "minkowski-lll") {
      if (entry.digest.candidate_count < entry.degree) {
        throw new Error(`${entry.name} did not retain a full reduced basis`);
      }
      if (entry.digest.first_candidate !== "1") {
        throw new Error(`${entry.name} lost the deterministic unit candidate`);
      }
    } else {
      if (
        JSON.stringify(entry.digest.permutation) !== "[1,0]" ||
        JSON.stringify(entry.digest.parent_row) !== "[1,0]" ||
        JSON.stringify(entry.digest.derived_row) !== "[0,1]" ||
        entry.digest.detached_replay !== true
      ) {
        throw new Error(`${entry.name} lost exact quadratic orbit replay`);
      }
    }
  }
}
