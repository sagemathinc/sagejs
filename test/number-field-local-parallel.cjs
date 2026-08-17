"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");
function runCPython(source) {
  const setup = [
    "import sys",
    `sys.path.append(${JSON.stringify(join(root, "src", "lib"))})`,
    "from sagejs.number_fields.local_parallel import *",
  ].join("\n");
  const result = spawnSync("python3", ["-c", `${setup}\n${source}`], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const fixtureSource = String.raw`
jobs = [
    make_local_job([17, -3, 0, 1], 2, 1, [1, 1], 5, 9500000, 1000),
    make_local_job([17, -3, 0, 1], 2, 0, [1, 0, 1], 5, 9300000, 2000),
    make_local_job([17, -3, 0, 1], 3, 0, [2, 1], 3, 9100000, 3000),
    make_local_job([17, -3, 0, 1], 5, 0, [4, 1], 2, 8900000, 4000),
]
def answer(job):
    p = local_job_key(job)[1]
    return make_local_result(
        job,
        [[1, 0, 0], [0, p, 0], [0, 0, p]],
        p,
        p,
        p ** 3,
        (("certified", True), ("prime", p)),
        peak_bytes=10000 + p,
        elapsed_micros=1000 + p,
    )
results = [answer(job) for job in jobs]
`;

test("P5 payloads are canonical, immutable, and reject host objects", () => {
  const output = runCPython(String.raw`
${fixtureSource}
job = jobs[0]
assert isinstance(job, tuple)
assert all(isinstance(value, tuple) for value in (job[1], job[2], job[2][3]))
assert validate_local_job(job) is not None
assert validate_local_result(results[0]) is not None
assert local_job_component(job).to_dict()["value"] == 2
assert local_result_contract(results[0]).to_dict()["state"] == "complete"
assert job == make_local_job([17, -3, 0, 1], 2, 1, [1, 1], 5, 9500000, 1000)
try:
    validate_local_job(("sagejs.number-fields.local-job.v1", object()))
except LocalPayloadError:
    pass
else:
    raise AssertionError("accepted a host object")
try:
    make_local_result(job, [[object()]], 1, 1, 2, ())
except LocalPayloadError:
    pass
else:
    raise AssertionError("accepted a host object in a result")
print("canonical-wire-ok")
`);
  assert.equal(output, "canonical-wire-ok");
});

test("scheduling is measured, bounded, capability-aware, and memory-aware", () => {
  const output = runCPython(String.raw`
${fixtureSource}
parallel = make_schedule(jobs, max_workers=99, cpu_count=3)
assert parallel[1:3] == ("parallel", 3)
assert parallel[6] == "parallel-threshold-met"
tiny = [make_local_job([1, 0, 1], 2, 0, [1, 1], 1, 1, 100)]
assert make_schedule(tiny, max_workers=4, cpu_count=8)[1:3] == ("sequential", 1)
assert make_schedule(jobs, worker_capability=False)[6] == "worker-capability-unavailable"
memory_policy = (
    "sagejs.number-fields.local-policy.v1", 3, 1, 1, 4, 5000, "test-memory-policy"
)
memory = make_schedule(jobs, max_workers=4, cpu_count=8, policy=memory_policy)
assert memory[1:3] == ("sequential", 1)
assert memory[6] == "peak-memory-worker-bound"
assert parallel[7] == "bench/number-field-local-parallel.cjs:v1"
print("schedule-policy-ok")
`);
  assert.equal(output, "schedule-policy-ok");
});

test("randomized completion order has exact sequential merge equivalence", () => {
  const output = runCPython(String.raw`
${fixtureSource}
import random
schedule = make_schedule(jobs, max_workers=3, cpu_count=8)
baseline = assemble_local_run(jobs, results, schedule)
for seed in range(100):
    shuffled = list(results)
    random.Random(seed).shuffle(shuffled)
    assert assemble_local_run(reversed(jobs), shuffled, schedule) == baseline
plan = baseline[3]
operations = [step[2] for step in plan[2]]
assert operations == [
    "same-prime-intersection-hnf",
    "coprime-crt-hnf",
    "coprime-crt-hnf",
]
assert plan[3] == 2**3 * 3**3 * 5**3
assert plan[4] == 2 * 2 * 3 * 5
assert plan[5][-1] == "integer-hnf-after-every-merge"
resources = baseline[4]
assert resources[0] == "sagejs.number-fields.local-resources.v1"
assert resources[5] >= resources[1] + resources[2]
print("completion-order-equivalence-ok")
`);
  assert.equal(output, "completion-order-equivalence-ok");
});

test("fatal certification and worker errors terminate sibling work", () => {
  const output = runCPython(String.raw`
${fixtureSource}
class FakePool:
    last = None
    def __init__(self, workers):
        self.workers = workers
        self.terminated = False
        self.closed = False
        self.joined = False
        FakePool.last = self
    class Handle:
        def __init__(self, worker, values):
            self.worker = worker
            self.values = values
        def get(self):
            return [self.worker(value) for value in self.values]
    def map_async(self, worker, values, chunksize=1):
        return FakePool.Handle(worker, list(values))
    def terminate(self):
        self.terminated = True
    def close(self):
        self.closed = True
    def join(self):
        self.joined = True

fatal_key = local_job_key(sorted(jobs, key=local_job_key)[0])
def fatal_worker(job):
    if local_job_key(job) == fatal_key:
        return make_fatal_result(job, "bad certificate")
    return answer(job)
try:
    run_local_jobs(jobs, fatal_worker, max_workers=3, cpu_count=8, pool_factory=FakePool)
except LocalCertificationError as error:
    assert str(error) == "local maximal-order certification failed"
else:
    raise AssertionError("fatal certification was ignored")
assert FakePool.last.terminated and FakePool.last.joined

class BrokenPool(FakePool):
    def map_async(self, worker, values, chunksize=1):
        raise OSError("transport lost")
try:
    run_local_jobs(jobs, answer, max_workers=3, cpu_count=8, pool_factory=BrokenPool)
except LocalWorkerError as error:
    assert str(error) == "local maximal-order worker execution failed"
else:
    raise AssertionError("worker failure was ignored")
assert FakePool.last.terminated and FakePool.last.joined
print("cancellation-ok")
`);
  assert.equal(output, "cancellation-ok");
});

test("Sage.js executes the strict module through its worker serialization contract", async (t) => {
  const session = await createSage({ mode: "sage" });
  t.after(() => session.close());
  const result = await session.evaluate(String.raw`
from sagejs.number_fields.local_parallel import (
    local_job_key, make_local_job, make_local_result, run_local_jobs
)
jobs = [
    make_local_job([1, 0, 0, 1], p, 0, [1, 1], 3, 10000000, 4096)
    for p in (2, 3, 5, 7)
]
def local_identity(job):
    p = local_job_key(job)[1]
    return make_local_result(
        job,
        [[1, 0, 0], [0, p, 0], [0, 0, p]],
        p,
        p,
        p ** 2,
        (("sagejs-worker", True),),
        peak_bytes=8192,
    )
sequential = run_local_jobs(jobs, local_identity, worker_capability=False)
parallel = run_local_jobs(jobs, local_identity, max_workers=2, cpu_count=8)
print(sequential[2] == parallel[2])
print(sequential[3] == parallel[3])
print(parallel[1][1:3])
print(parallel[4][5] > 0)
`);
  assert.equal(
    result.stdout.trim(),
    "True\nTrue\n('parallel', 2)\nTrue",
  );
});
