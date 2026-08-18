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
          "from sagejs.number_fields.local_parallel import assemble_local_run, make_local_job",
          "from sagejs.number_fields.local_parallel_worker import public_worker_decision, run_public_local_jobs",
          "coefficients = [-88200, 0, 1]",
          "primes = [2, 3, 5, 7]",
          "jobs = [make_local_job(coefficients, prime, ordinal, [0, 1], 4, 10000000, 1000000, algorithm='round2') for ordinal, prime in enumerate(primes)]",
          "forced_pool = ('sagejs.number-fields.local-policy.v1', 3, 1, 1, 4, 536870912, 'test/number-field-maximal-order-parallel-worker.cjs:v1')",
          "sequential = run_public_local_jobs(jobs, worker_capability=False, cpu_count=4, policy=forced_pool)",
          "parallel = run_public_local_jobs(jobs, worker_capability=True, cpu_count=4, policy=forced_pool)",
          "native_first = public_worker_decision(jobs, after_native_fallback=False, cpu_count=4)",
          "fallback_parallel = public_worker_decision(jobs, after_native_fallback=True, cpu_count=4, memory_budget_bytes=2 * 1024 * 1024 * 1024)",
          "exact_memory = public_worker_decision(jobs, after_native_fallback=True, cpu_count=4, memory_budget_bytes=fallback_parallel['predicted_peak_rss_bytes'])",
          "just_short_memory = public_worker_decision(jobs, after_native_fallback=True, cpu_count=4, memory_budget_bytes=fallback_parallel['predicted_peak_rss_bytes'] - 1)",
          "memory_declined = public_worker_decision(jobs, after_native_fallback=True, cpu_count=4, memory_budget_bytes=1)",
          "capability_declined = public_worker_decision(jobs, after_native_fallback=True, cpu_count=4, worker_capability=False)",
          "assert fallback_parallel['memory_budget_source'] == 'caller-explicit'",
          "state = 20260817",
          "randomized_equivalent = True",
          "for iteration in range(20):",
          "    completion_order = list(parallel[2])",
          "    for offset in range(len(completion_order) - 1, 0, -1):",
          "        state = (1103515245 * state + 12345) & 0x7fffffff",
          "        swap = state % (offset + 1)",
          "        completion_order[offset], completion_order[swap] = completion_order[swap], completion_order[offset]",
          "    replay = assemble_local_run(jobs, completion_order, parallel[1])",
          "    randomized_equivalent = randomized_equivalent and replay[2:] == parallel[2:]",
          "[(sequential[1][1], sequential[1][2], sequential[1][6]), (parallel[1][1], parallel[1][2], parallel[1][6]), sequential[2] == parallel[2], sequential[3] == parallel[3], randomized_equivalent, (native_first['selected'], native_first['reason']), (fallback_parallel['selected'], fallback_parallel['reason']), (memory_declined['selected'], memory_declined['reason']), (capability_declined['selected'], capability_declined['reason']), (exact_memory['selected'], just_short_memory['reason']), fallback_parallel['wire_and_branch_peak_bytes'] > 0, fallback_parallel['predicted_peak_rss_bytes'] == fallback_parallel['fixed_runtime_peak_rss_bytes'] + fallback_parallel['wire_and_branch_peak_bytes'], fallback_parallel['useful_job_count'], parallel[4][0], parallel[4][5] > sequential[4][5], [(result[1][1], result[2], result[5]) for result in parallel[2]]]",
        ].join("\n"),
      );
      assert.equal(
        result.repr,
        "[('sequential', 1, 'worker-capability-unavailable'), ('parallel', 4, 'parallel-threshold-met'), True, True, True, (False, 'native-first-boundary'), (True, 'measured-native-fallback-crossover'), (False, 'measured-peak-exceeds-memory-budget'), (False, 'precompiled-worker-module-unavailable'), (True, 'measured-peak-exceeds-memory-budget'), True, True, 4, 'sagejs.number-fields.local-resources.v1', True, [(2, 'ok', 2), (3, 'ok', 3), (5, 'ok', 5), (7, 'ok', 7)]]",
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

test(
  "the public engine uses workers only after a measured native fallback",
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
          "import sagejs.number_fields.maximal_order_engine as engine",
          "R.<x> = QQ[]",
          "K.<a> = NumberField(x^2 - 88200)",
          "expected = K.maximal_order()",
          "native = engine.native_order_from_polynomial",
          "decision = engine.public_worker_decision",
          "micros_per_unit = engine._ROUND2_MICROS_PER_UNIT",
          "def unavailable(coefficients, primes):",
          "    raise RuntimeError('forced native unavailability')",
          "def enough_memory(jobs, **options):",
          "    options['memory_budget_bytes'] = 2 * 1024 * 1024 * 1024",
          "    return decision(jobs, **options)",
          "engine.native_order_from_polynomial = unavailable",
          "engine.public_worker_decision = enough_memory",
          "engine._ROUND2_MICROS_PER_UNIT = 2000000",
          "try:",
          "    L.<b> = NumberField(x^2 - 88200)",
          "    actual = L.maximal_order()",
          "    cached = actual is L.maximal_order()",
          "    traced = L.maximal_order(trace=True)",
          "finally:",
          "    engine.native_order_from_polynomial = native",
          "    engine.public_worker_decision = decision",
          "    engine._ROUND2_MICROS_PER_UNIT = micros_per_unit",
          "events = traced.maximal_order_trace()['events']",
          "native_event = [event for event in events if event['stage'] == 'native-local-orders'][-1]",
          "schedule_event = [event for event in events if event['stage'] == 'local-schedule'][-1]",
          "decision = schedule_event['details']['parallel_decision']",
          "(engine._basis_from_order(actual, 1).canonical_key() == engine._basis_from_order(expected, 1).canonical_key(), actual.discriminant() == expected.discriminant(), actual.maximality_certificate()['index'] == expected.maximality_certificate()['index'], cached, native_event['state'], schedule_event['details']['schedule'][1:3], decision['selected'], decision['reason'], decision['after_native_fallback'])",
        ].join("\n"),
      );
      assert.equal(
        result.repr,
        "(True, True, True, True, 'unavailable', ['parallel', 4], True, 'measured-native-fallback-crossover', True)",
      );
    } finally {
      await session.close();
    }
  },
);
