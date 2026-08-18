"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const corpus = JSON.parse(
  readFileSync(
    join(root, "test/fixtures/number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const vector429 = corpus.cases.find(
  (item) => item.id === "pari-round4-vector-429",
);
const script = String.raw`
import json
import time
from sagejs.number_fields.local_parallel import (
    authenticate_local_proof_result,
    make_om_proof_job,
    wire_size,
)
from sagejs.number_fields.local_parallel_worker import (
    PUBLIC_PROOF_BENCHMARK,
    finish_public_local_proof_jobs,
    public_local_proof_worker_decision,
    start_public_local_proof_jobs,
)

case = json.loads(r'''${JSON.stringify(vector429)}''')
polynomial = tuple(int(value) for value in case["polynomial"]["coefficients"])
job = make_om_proof_job(
    polynomial,
    7,
    1008,
    3500000,
    64 << 20,
)
decision = public_local_proof_worker_decision(
    (job,),
    parent_native_predicted_micros=1900000,
)
started = time.perf_counter_ns()
handle = start_public_local_proof_jobs(
    (job,),
    worker_capability=False,
)
run = finish_public_local_proof_jobs(handle)
elapsed_micros = (time.perf_counter_ns() - started) // 1000
result = run[2][0]
authenticated = authenticate_local_proof_result(job, result)
if authenticated is None:
    raise AssertionError("proof benchmark result was not parent-authenticated")
print(json.dumps({
    "schema": "sagejs.number-fields/local-proof-worker-benchmark-v1",
    "benchmark": PUBLIC_PROOF_BENCHMARK,
    "workload": "vector429 complete p=7 OM proof envelope",
    "fresh_public_cache": True,
    "worker_mode": run[1][1],
    "elapsed_micros": elapsed_micros,
    "actual_timing": handle.timing_evidence,
    "job_wire_bytes": wire_size(job),
    "result_wire_bytes": wire_size(result),
    "authenticated_wire_bytes": wire_size(authenticated.to_wire()),
    "predicted_proof_wire_bytes": decision["predicted_proof_wire_bytes"],
    "predicted_peak_rss_bytes": decision["predicted_peak_rss_bytes"],
    "setup_predicted_micros": decision["setup_predicted_micros"],
    "decision_selected": decision["selected"],
    "decision_reason": decision["reason"],
    "certificate_id": authenticated.om_selection[1],
    "exact_basis_index_discriminants_bound": True,
}, sort_keys=True))
`;

const result = spawnSync(
  process.execPath,
  [join(root, "bin/sagejs"), "--python"],
  {
    cwd: root,
    encoding: "utf8",
    input: script,
    timeout: 180_000,
    maxBuffer: 64 * 1024 * 1024,
  },
);
assert.equal(result.status, 0, result.stderr || result.stdout);
process.stdout.write(result.stdout.trim() + "\n");
