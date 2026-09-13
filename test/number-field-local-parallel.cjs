// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
function runCPython(source) {
  const setup = [
    "import sys",
    `sys.path.append(${JSON.stringify(join(root, "src", "lib"))})`,
    "from sagejs.number_fields.local_parallel import *",
  ].join("\n");
  const result = spawnSync(pythonExecutable(), ["-c", `${setup}\n${source}`], {
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
assert results[0][12] in jobs
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
other = make_local_job([19, -3, 0, 1], 2, 1, [1, 1], 5, 9500000, 1000)
tampered = results[0][0:12] + (other,)
try:
    validate_local_result(tampered)
except LocalPayloadError:
    pass
else:
    raise AssertionError("accepted a result rebound to another complete job")
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

test("parallel execution queues longest jobs first without wave barriers", () => {
  const output = runCPython(String.raw`
${fixtureSource}
submitted = []
first_get_submission_count = []
class TrackingPool:
    class Handle:
        def __init__(self, value):
            self.value = value
        def ready(self):
            return True
        def wait(self, timeout=None):
            return None
        def get(self):
            if not first_get_submission_count:
                first_get_submission_count.append(len(submitted))
            return self.value
    def __init__(self, workers):
        self.workers = workers
    def apply_async(self, worker, arguments):
        submitted.append(arguments[0])
        return TrackingPool.Handle(worker(*arguments))
    def close(self):
        pass
    def join(self):
        pass
    def terminate(self):
        pass
run = run_local_jobs(
    jobs,
    answer,
    max_workers=3,
    cpu_count=8,
    pool_factory=TrackingPool,
)
assert [job[4] for job in submitted] == [9500000, 9300000, 9100000, 8900000]
assert first_get_submission_count == [len(jobs)]
assert run[2] == assemble_local_run(
    jobs,
    results,
    make_schedule(jobs, max_workers=3, cpu_count=8),
)[2]
print("lpt-no-wave-barrier-ok")
`);
  assert.equal(output, "lpt-no-wave-barrier-ok");
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
        def __init__(self, worker, arguments):
            self.value = worker(*arguments)
        def ready(self):
            return True
        def wait(self, timeout=None):
            return None
        def get(self):
            return self.value
    def apply_async(self, worker, arguments):
        return FakePool.Handle(worker, arguments)
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
    def apply_async(self, worker, arguments):
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

test("a fatal result promptly cancels a sleeping process-pool sibling", (t) => {
  if (process.platform === "win32") {
    t.skip("CPython has no fork process context on native Windows");
    return;
  }
  const output = runCPython(String.raw`
${fixtureSource}
import time
import multiprocessing
def fatal_or_sleep(job):
    if local_job_key(job)[1] == 2:
        return make_fatal_result(job, "deterministic fatal")
    time.sleep(30)
    return answer(job)
started = time.monotonic()
try:
    run_local_jobs(
        jobs,
        fatal_or_sleep,
        max_workers=3,
        cpu_count=8,
        pool_factory=multiprocessing.get_context("fork").Pool,
    )
except LocalCertificationError:
    elapsed = time.monotonic() - started
else:
    raise AssertionError("fatal certification was ignored")
assert elapsed < 3.0, elapsed
print("prompt-cancellation-ok")
`);
  assert.equal(output, "prompt-cancellation-ok");
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
