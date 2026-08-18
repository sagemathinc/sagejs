#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { cpus, platform, arch } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..");
const python =
  process.env.SAGEJS_PYTHON ??
  (existsSync("/usr/bin/python3") ? "/usr/bin/python3" : "python3");
const check = process.argv.includes("--check");
const program = String.raw`
import json,time,sys;sys.path.insert(0,${JSON.stringify(join(root, "src", "lib"))})
from sagejs.number_fields.local_polygons import analyze_local_polygons

workloads = [
    ("six-oracle-fixtures", [
        ([8,-2,1,1],2), ([3,-1,5,1],2), ([-1,5,8,1],7),
        ([2,1,-1,2,-1,1],2), ([28,8,-7,1],2),
        ([5,-19,-14,1],3),
    ], 100),
    ("degree-32-polygon", [([4,2]+[0]*30+[1],2)], 500),
    ("large-prime-no-trial-division", [([1,0,1],18446744073709551557)], 100),
]
results=[]
for name,cases,repetitions in workloads:
    for f,p in cases:
        analyze_local_polygons(f,p)
    samples=[]
    digest=None
    for sample in range(7):
        start=time.perf_counter_ns()
        for repetition in range(repetitions):
            for f,p in cases:
                result=analyze_local_polygons(f,p)
                digest=(result.status,result.predicted_index_exponent,result.basis_denominator)
        samples.append((time.perf_counter_ns()-start)/1e6)
    samples.sort()
    results.append({"name":name,"repetitions":repetitions,"cases":len(cases),
                    "median_ms":samples[len(samples)//2],"samples_ms":samples,
                    "digest":digest})
print(json.dumps(results,separators=(',',':')))
`;

const raw = execFileSync(python, ["-c", program], {
  cwd: root,
  env: process.env,
  encoding: "utf8",
  timeout: 30_000,
});
const results = JSON.parse(raw);
const report = {
  schema: "sagejs.number-fields.local-polygons-benchmark/v1",
  boundary: "ordinary CPython same-source fallback",
  warmup: "one complete workload",
  samples: 7,
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
  const ceilings = {
    "six-oracle-fixtures": 1500,
    "degree-32-polygon": 1500,
    "large-prime-no-trial-division": 1000,
  };
  for (const result of results) {
    if (result.median_ms > ceilings[result.name]) {
      throw new Error(
        `${result.name} ${result.median_ms}ms exceeds ${ceilings[result.name]}ms`,
      );
    }
  }
}
