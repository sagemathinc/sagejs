#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { cpus, platform, arch } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..");
const python =
  process.env.SAGEJS_PYTHON ??
  (existsSync("/usr/bin/python3") ? "/usr/bin/python3" : "python3");
const check = process.argv.includes("--check");
const fixture = JSON.parse(
  readFileSync(
    join(
      root,
      "test",
      "fixtures",
      "number-field-buchmann-lenstra-fallback.json",
    ),
    "utf8",
  ),
);

const program = String.raw`
import json,time,sys
sys.path.insert(0,${JSON.stringify(join(root, "src", "lib"))})
from sagejs.number_fields.buchmann_lenstra import buchmann_lenstra_multiplier_cycle
from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent,OrderBasis

fixtures=json.loads(${JSON.stringify(JSON.stringify(fixture))})
jobs=[]
for name in ("irregular_prime_fixed","irregular_prime_enlarge"):
    case=fixtures[name]
    f=[int(value) for value in case["coefficients_low_to_high"]]
    degree=len(f)-1
    identity=OrderBasis([[1 if row==column else 0 for column in range(degree)] for row in range(degree)],1)
    partial=OrderBasis(case["input_basis"]["numerator"],int(case["input_basis"]["denominator"]))
    component=DiscriminantComponent(int(case["prime"]),"proven-prime")
    jobs.append((name+"-equation-order",f,component,identity))
    jobs.append((name+"-polygon-order",f,component,partial))
results=[]
repetitions=200
for name,f,component,basis in jobs:
    warm=buchmann_lenstra_multiplier_cycle(f,component,basis)
    warm_iterations=sum(event["stage"]=="q-radical" for event in warm.evidence["events"])
    samples=[]
    digest=None
    for sample in range(7):
        started=time.perf_counter_ns()
        for repetition in range(repetitions):
            result=buchmann_lenstra_multiplier_cycle(f,component,basis)
            iteration_count=sum(event["stage"]=="q-radical" for event in result.evidence["events"])
            digest=(result.index,result.discriminant,iteration_count)
        samples.append((time.perf_counter_ns()-started)/1e6)
    samples.sort()
    results.append({"name":name,"repetitions":repetitions,
                    "median_ms":samples[len(samples)//2],"samples_ms":samples,
                    "iterations":warm_iterations,"digest":digest})
print(json.dumps(results,separators=(",",":")))
`;

const raw = execFileSync(python, ["-c", program], {
  cwd: root,
  env: process.env,
  encoding: "utf8",
  timeout: 60_000,
});
const results = JSON.parse(raw);
const byName = Object.fromEntries(results.map((entry) => [entry.name, entry]));
const crossover = {};
for (const stem of ["irregular_prime_fixed", "irregular_prime_enlarge"]) {
  const equation = byName[`${stem}-equation-order`];
  const polygon = byName[`${stem}-polygon-order`];
  crossover[stem] = {
    equation_order_median_ms: equation.median_ms,
    polygon_order_median_ms: polygon.median_ms,
    speedup_from_polygon_evidence: equation.median_ms / polygon.median_ms,
    saved_iterations: equation.iterations - polygon.iterations,
  };
}
const report = {
  schema: "sagejs.number-fields/buchmann-lenstra-fallback-benchmark/v1",
  boundary: "ordinary CPython exact-integer fallback",
  selector_question:
    "cost of starting the multiplier cycle at the equation order versus a polygon-produced current order",
  warmup: "one complete cycle per workload",
  samples: 7,
  host: {
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    node: process.version,
  },
  results,
  crossover,
};
console.log(JSON.stringify(report, null, 2));

if (check) {
  for (const result of results) {
    if (result.median_ms > 5000) {
      throw new Error(`${result.name} ${result.median_ms}ms exceeds 5000ms`);
    }
  }
  for (const value of Object.values(crossover)) {
    if (value.saved_iterations < 1) {
      throw new Error("polygon/current-order selector failed to save an iteration");
    }
    if (value.polygon_order_median_ms > value.equation_order_median_ms * 1.5) {
      throw new Error("reusing a current order regressed selector crossover cost");
    }
  }
}
