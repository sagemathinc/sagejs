"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { join } = require("node:path");

const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const session = await createSage({ mode: "sage" });
  try {
    const result = await session.evaluate(String.raw`
from sagejs.number_fields.local_parallel import (
    local_job_key, make_local_job, make_local_result, run_local_jobs
)
from time import time

primes = (2, 3, 5, 7, 11, 13, 17, 19)
jobs = [
    make_local_job([29, -17, 3, 0, 1], p, 0, [1, 1], 4, 6000000, 32768)
    for p in primes
]

def synthetic_local_branch(job):
    p = local_job_key(job)[1]
    # Deterministic CPU work stands in for a local polygon/basis branch.  The
    # result remains small so this benchmark measures worker setup and useful
    # parallel computation rather than large-result serialization.
    state = p
    for k in range(4000000):
        state = (state * 1103515245 + 12345 + k) % 2147483647
    return make_local_result(
        job,
        [[1, 0, 0, 0], [0, p, 0, 0], [0, 0, p, 0], [0, 0, 0, p]],
        p,
        p,
        p ** 3,
        (("synthetic-checksum", state),),
        peak_bytes=65536,
    )

# Warm both paths so module compilation and worker creation are not attributed
# to exactly one observation.
run_local_jobs(jobs[:1], synthetic_local_branch, worker_capability=False)
run_local_jobs(jobs, synthetic_local_branch, max_workers=4, cpu_count=8)

def measured(worker_capability):
    samples = []
    answer = None
    for _ in range(1):
        start = time()
        answer = run_local_jobs(
            jobs,
            synthetic_local_branch,
            max_workers=4,
            cpu_count=8,
            worker_capability=worker_capability,
        )
        samples.append((time() - start) * 1000)
    return samples[0], answer

sequential_ms, sequential = measured(False)
parallel_ms, parallel = measured(True)
print(sequential_ms)
print(parallel_ms)
print(sequential[2] == parallel[2])
print(sequential[3] == parallel[3])
print(parallel[1][2])
print(parallel[4][5])
`);
    const lines = result.stdout.trim().split("\n");
    const sequentialMs = Number(lines[0]);
    const parallelMs = Number(lines[1]);
    assert.equal(lines[2], "True", "parallel results differ from sequential");
    assert.equal(lines[3], "True", "parallel merge plan differs from sequential");
    assert.equal(lines[4], "4", "P5 worker ceiling was not selected");
    assert.ok(Number(lines[5]) > 0, "peak-resource evidence is missing");
    assert.ok(Number.isFinite(sequentialMs) && sequentialMs > 0);
    assert.ok(Number.isFinite(parallelMs) && parallelMs > 0);
    assert.ok(
      parallelMs < sequentialMs,
      `parallel local work did not beat sequential: ${parallelMs.toFixed(1)} >= ${sequentialMs.toFixed(1)} ms`,
    );
    const evidence = {
      schema: "sagejs.number-fields.local-parallel-benchmark.v1",
      workload: "8 deterministic independent CPU-bound local branches",
      warmup: "one sequential branch and one four-worker batch",
      samples: 1,
      statistic: "single warm observation",
      sequential_ms: sequentialMs,
      parallel_ms: parallelMs,
      speedup: sequentialMs / parallelMs,
      results_equal: true,
      merge_plan_equal: true,
      selected_workers: 4,
      conservative_peak_bytes: Number(lines[5]),
      threshold_policy: "bench/number-field-local-parallel.cjs:v1",
      elapsed_ms: performance.now(),
    };
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
