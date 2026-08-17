"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("the maximal-order selector is deterministic and input-derived", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.number_fields.maximal_order_engine import inspect_maximal_order_selection",
        "tiny = inspect_maximal_order_selection([-8, 0, 1], 32, [2], algorithm='auto', cpu_count=8)",
        "repeat = inspect_maximal_order_selection([-8, 0, 1], 32, [2], algorithm='auto', cpu_count=8)",
        "forced = inspect_maximal_order_selection([-8, 0, 1], 32, [2], algorithm='om-maxmin', cpu_count=8)",
        "decision = tiny['local_decisions'][0]",
        "[tiny == repeat, tiny['primary'], decision['algorithm'], decision['metrics']['degree'], decision['metrics']['local_discriminant_valuation'], decision['metrics']['factor_degrees'], decision['metrics']['expected_output_bytes'] > 0, tiny['schedule'][1], tiny['schedule'][6], forced['local_decisions'][0]['algorithm'], forced['local_decisions'][0]['forced']]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "[True, 'native', 'round2', 2, 5, [1], True, 'sequential', 'worker-capability-unavailable', 'om-maxmin', True]",
    );
  } finally {
    await session.close();
  }
});

test("the public fallback uses canonical jobs and preserves forced equivalence", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R.<x> = QQ[]",
        "summaries = []",
        "for algorithm in ['round2', 'polygon', 'round4', 'om-maxmin']:",
        "    K.<a> = NumberField(x^2 - 8)",
        "    O = K.maximal_order(algorithm=algorithm, trace=True)",
        "    events = O.maximal_order_trace()['events']",
        "    schedule = [event for event in events if event['stage'] == 'local-schedule'][0]",
        "    summaries.append((algorithm, O.basis(), O.discriminant(), O.is_maximal(), schedule['details']['schedule'][1], schedule['details']['schedule'][6], schedule['details']['resources'][0], schedule['details']['merge_plan'][0]))",
        "summaries",
      ].join("\n"),
    );
    assert.match(result.repr, /^\[\('round2', \[1, 1\/2\*a\], 8, True/);
    assert.match(result.repr, /\('polygon', \[1, 1\/2\*a\], 8, True/);
    assert.match(result.repr, /\('round4', \[1, 1\/2\*a\], 8, True/);
    assert.match(result.repr, /\('om-maxmin', \[1, 1\/2\*a\], 8, True/);
    assert.equal((result.repr.match(/'sequential'/g) || []).length, 4);
    assert.equal(
      (result.repr.match(/'worker-capability-unavailable'/g) || []).length,
      4,
    );
    assert.equal(
      (result.repr.match(/'sagejs.number-fields.local-resources.v1'/g) || [])
        .length,
      4,
    );
    assert.equal(
      (result.repr.match(/'sagejs.number-fields.local-merge-plan.v1'/g) || [])
        .length,
      4,
    );
  } finally {
    await session.close();
  }
});

test("the measured scheduler crossover is inspectable without enabling it", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.number_fields.maximal_order_engine import inspect_maximal_order_selection",
        "degree = 64",
        "coefficients = [-2] + [0] * (degree - 1) + [1]",
        "primes = [2, 3, 5, 7]",
        "discriminant = 1",
        "for p in primes:",
        "    discriminant = discriminant * p^128",
        "disabled = inspect_maximal_order_selection(coefficients, discriminant, primes, worker_capability=False, cpu_count=8)",
        "capable = inspect_maximal_order_selection(coefficients, discriminant, primes, worker_capability=True, cpu_count=8)",
        "[disabled['schedule'][1:3], disabled['schedule'][6], capable['schedule'][1:3], capable['schedule'][6], [entry['algorithm'] for entry in capable['local_decisions']], [entry['metrics']['auto_eligibility']['om-maxmin']['eligible'] for entry in capable['local_decisions']], capable['schedule'][4] >= 35000000, capable['schedule'][5] <= 536870912]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "[('sequential', 1), 'worker-capability-unavailable', ('parallel', 4), 'parallel-threshold-met', ['round4', 'round4', 'round4', 'round4'], [False, False, False, False], True, True]",
    );
  } finally {
    await session.close();
  }
});

test("a general BL split restarts only its certified branch", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.number_fields.buchmann_lenstra import BuchmannLenstraResult",
        "from sagejs.number_fields.discriminant_components import decompose_discriminant, check_decomposition_certificate",
        "from sagejs.number_fields.maximal_order_contracts import ComponentSplit, DiscriminantComponent, MaximalOrderTrace",
        "from sagejs.number_fields.maximal_order_engine import _replace_component_by_certified_split",
        "split = BuchmannLenstraResult('split', DiscriminantComponent(35, 'composite'), split=ComponentSplit(35, 5, 7, {'coefficient':5}))",
        "decomposition = decompose_discriminant(None, 35, small_prime_bound=2, rho_steps=0)",
        "trace = MaximalOrderTrace(True)",
        "children = _replace_component_by_certified_split(decomposition, decomposition['components'][0], split, trace)",
        "[split.state, split.split.left, split.split.right, [(entry['base'], entry['exponent'], entry['state']) for entry in children], check_decomposition_certificate(decomposition, require_proven=True), trace.to_dict()['events'][0]['stage'], decomposition['events'][-1]['kind']]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "['split', 5, 7, [(5, 1, 'proven-prime'), (7, 1, 'proven-prime')], True, 'component-split-restart', 'branch-local-component-split']",
    );
  } finally {
    await session.close();
  }
});
