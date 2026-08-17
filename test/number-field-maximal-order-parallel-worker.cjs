"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test(
  "the pointer-free local worker is exactly sequential-equivalent",
  { timeout: 120_000 },
  async (t) => {
    const session = await createSage();
    try {
      const capability = await session.evaluate(
        "from multiprocessing import worker_module_available\nworker_module_available('sagejs.number_fields.local_parallel_worker')",
      );
      if (capability.repr !== "True") {
        t.skip("optional precompiled worker module graph is unavailable");
        return;
      }
      const result = await session.evaluate(
        [
          "import random",
          "from sagejs.number_fields.local_parallel import assemble_local_run, make_local_job",
          "from sagejs.number_fields.local_parallel_worker import run_public_local_jobs",
          "coefficients = [-88200, 0, 1]",
          "primes = [2, 3, 5, 7]",
          "jobs = [make_local_job(coefficients, prime, ordinal, [0, 1], 4, 10000000, 1000000, algorithm='round2') for ordinal, prime in enumerate(primes)]",
          "forced_pool = ('sagejs.number-fields.local-policy.v1', 3, 1, 1, 4, 536870912, 'test/number-field-maximal-order-parallel-worker.cjs:v1')",
          "sequential = run_public_local_jobs(jobs, worker_capability=False, cpu_count=4, policy=forced_pool)",
          "parallel = run_public_local_jobs(jobs, worker_capability=True, cpu_count=4, policy=forced_pool)",
          "rng = random.Random(20260817)",
          "randomized_equivalent = True",
          "for iteration in range(20):",
          "    completion_order = list(parallel[2])",
          "    rng.shuffle(completion_order)",
          "    replay = assemble_local_run(jobs, completion_order, parallel[1])",
          "    randomized_equivalent = randomized_equivalent and replay[2:] == parallel[2:]",
          "[(sequential[1][1], sequential[1][2], sequential[1][6]), (parallel[1][1], parallel[1][2], parallel[1][6]), sequential[2] == parallel[2], sequential[3] == parallel[3], randomized_equivalent, parallel[4][0], parallel[4][5] > sequential[4][5], [(result[1][1], result[2], result[5]) for result in parallel[2]]]",
        ].join("\n"),
      );
      assert.equal(
        result.repr,
        "[('sequential', 1, 'worker-capability-unavailable'), ('parallel', 4, 'parallel-threshold-met'), True, True, True, 'sagejs.number-fields.local-resources.v1', True, [(2, 'ok', 2), (3, 'ok', 3), (5, 'ok', 5), (7, 'ok', 7)]]",
      );
    } finally {
      await session.close();
    }
  },
);

test("worker arithmetic failures cancel with one stable error", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.number_fields.local_parallel import LocalCertificationError, make_local_job",
        "from sagejs.number_fields.local_parallel_worker import run_public_local_jobs",
        "jobs = [make_local_job([0, 0, 1], prime, ordinal, [0, 1], 2, 10000000, 1000000, algorithm='round2') for ordinal, prime in enumerate([2, 3, 5])]",
        "policy = ('sagejs.number-fields.local-policy.v1', 3, 1, 1, 3, 536870912, 'test-fatal')",
        "try:",
        "    run_public_local_jobs(jobs, worker_capability=True, cpu_count=3, policy=policy)",
        "except LocalCertificationError as error:",
        "    answer = (type(error).__name__, str(error))",
        "answer",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "('LocalCertificationError', 'local maximal-order certification failed')",
    );
  } finally {
    await session.close();
  }
});
