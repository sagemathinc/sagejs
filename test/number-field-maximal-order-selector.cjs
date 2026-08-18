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
        "tiny = inspect_maximal_order_selection([-8, 0, 1], 32, [2], algorithm='auto', cpu_count=8, memory_budget_bytes=2^31)",
        "repeat = inspect_maximal_order_selection([-8, 0, 1], 32, [2], algorithm='auto', cpu_count=8, memory_budget_bytes=2^31)",
        "forced = inspect_maximal_order_selection([-8, 0, 1], 32, [2], algorithm='om-maxmin', cpu_count=8, memory_budget_bytes=2^31)",
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

test(
  "arbitrary-prime selection skips estimates but exact polygons certify the lattice",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(
        [
          "from sagejs.number_fields.maximal_order_certification import check_order_lattice",
          "from sagejs.number_fields.maximal_order_engine import _basis_from_order, inspect_maximal_order_selection",
          "import sagejs.number_fields.local_polygons as polygons",
          "p = 18446744073709551629",
          "coefficients = [-2*p^2, 0, 1]",
          "equation_discriminant = 8*p^2",
          "original_factor = polygons.factor_mod_prime",
          "calls = []",
          "def trapped_factor(*args):",
          "    calls.append(args[1])",
          "    raise AssertionError('selector started finite-field factorization')",
          "polygons.factor_mod_prime = trapped_factor",
          "large = inspect_maximal_order_selection(coefficients, equation_discriminant, [p], algorithm='auto')",
          "large_decision = large['local_decisions'][0]",
          "polygons.factor_mod_prime = original_factor",
          "def counted_factor(*args):",
          "    calls.append(args[1])",
          "    return original_factor(*args)",
          "polygons.factor_mod_prime = counted_factor",
          "word = inspect_maximal_order_selection([-8, 0, 1], 32, [2], algorithm='auto')",
          "polygons.factor_mod_prime = original_factor",
          "R.<x> = QQ[]",
          "K.<a> = NumberField(R(coefficients))",
          "O = K.maximal_order(v=p, trace=True)",
          "basis = _basis_from_order(O, 1)",
          "lattice = check_order_lattice(coefficients, basis.numerator, basis.denominator)",
          "corrupt_numerator = [list(row) for row in basis.numerator]",
          "corrupt_numerator[-1][0] = corrupt_numerator[-1][0] + 1",
          "corrupt = check_order_lattice(coefficients, corrupt_numerator, basis.denominator)",
          "stages = [event['stage'] for event in O.maximal_order_trace()['events']]",
          "[calls, large_decision['algorithm'], large_decision['metrics']['finite_field_factorization'], large_decision['metrics']['factor_degrees'], word['local_decisions'][0]['metrics']['finite_field_factorization']['performed'], O.basis(), O.discriminant(), O._maximal_order_local_evidence['certified'], lattice['valid'], corrupt['valid'], 'arbitrary-prime-local-order' in stages]",
        ].join("\n"),
      );
      assert.equal(
        result.repr,
        "[[2], 'polygon', {'performed': False, 'reason': 'arbitrary-prime capability forces the exact polygon path'}, [], True, [1, 1/18446744073709551629*a], 8, True, True, False, True]",
      );
    } finally {
      await session.close();
    }
  },
);

test(
  "irregular arbitrary primes continue through exact multiplier evidence",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(
        [
          "from sagejs.number_fields.maximal_order_certification import check_order_lattice",
          "from sagejs.number_fields.maximal_order_engine import _basis_from_order",
          "from sagejs.number_fields.buchmann_lenstra import BuchmannLenstraResult",
          "import sagejs.number_fields.maximal_order as maximal_order_module",
          "import sagejs.number_fields.maximal_order_engine as maximal_order_engine",
          "p = 18446744073709551629",
          "coefficients = [p^3 + p^4, 3*p^2, 3*p, 1]",
          "R.<x> = QQ[]",
          "K.<a> = NumberField(R(coefficients))",
          "saved_dynamic = maximal_order_module.p_maximal_overorder_dynamic",
          "def forbid_arbitrary_matrix(order, prime):",
          "    if prime > 18446744073709551615:",
          "        raise AssertionError('arbitrary prime entered the dynamic matrix path')",
          "    return saved_dynamic(order, prime)",
          "maximal_order_module.p_maximal_overorder_dynamic = forbid_arbitrary_matrix",
          "try:",
          "    local = K.maximal_order(v=p, trace=True)",
          "    global_order = K.maximal_order(trace=True)",
          "finally:",
          "    maximal_order_module.p_maximal_overorder_dynamic = saved_dynamic",
          "saved_cycle = maximal_order_engine.buchmann_lenstra_multiplier_cycle",
          "blocked_states = []",
          "for blocked_state in ['resource-error', 'stalled', 'certification-error']:",
          "    def bounded_cycle(coefficients, component, basis, **kwargs):",
          "        return BuchmannLenstraResult(blocked_state, component, message='bounded fixture')",
          "    maximal_order_engine.buchmann_lenstra_multiplier_cycle = bounded_cycle",
          "    try:",
          "        maximal_order_engine._arbitrary_prime_local_order(K, coefficients, 1, -27*p^8, p)",
          "    except ArithmeticError:",
          "        blocked_states.append(blocked_state)",
          "    else:",
          "        blocked_states.append('promoted-' + blocked_state)",
          "maximal_order_engine.buchmann_lenstra_multiplier_cycle = saved_cycle",
          "local_basis = _basis_from_order(local, 1)",
          "global_basis = _basis_from_order(global_order, 1)",
          "lattice = check_order_lattice(coefficients, local_basis.numerator, local_basis.denominator)",
          "corrupt_rows = [list(row) for row in local_basis.numerator]",
          "corrupt_rows[0][0] = corrupt_rows[0][0] + 1",
          "corrupt = check_order_lattice(coefficients, corrupt_rows, local_basis.denominator)",
          "local_event = [event for event in local.maximal_order_trace()['events'] if event['stage'] == 'arbitrary-prime-local-order'][0]",
          "details = local_event['details']",
          "fallback_stages = [event['stage'] for event in details['fallback_events']]",
          "certificate = global_order.maximality_certificate()",
          "local_index = local_basis.denominator^3 // abs(local_basis.determinant_numerator)",
          "[local.basis(), local.discriminant(), local_basis.denominator == p^2, local_basis.numerator == [[p^2,0,0],[0,p,0],[0,0,1]], lattice['valid'], local_index == p^3, corrupt['valid'], details['used_algorithm'], details['fallback'], details['polygon_state'], details['polygon_result_state'], details['fallback_certificate'], fallback_stages, blocked_states, global_order.basis(), global_order.discriminant(), global_basis.canonical_key() == local_basis.canonical_key(), global_order.is_maximal(), certificate['certified'], sorted([w['prime'] for w in certificate['local_witnesses']])]",
        ].join("\n"),
      );
      assert.equal(
        result.repr,
        "[[1, 1/18446744073709551629*a, 1/340282366920938463942989953348216553641*a^2], -9187623906865338526460728740401846948307, True, True, True, True, False, 'buchmann-lenstra', True, 'fallback-required', 'not-applicable', 'p-radical-multiplier-fixed-point', ['component-reduction', 'q-radical', 'multiplier-ring', 'component-reduction', 'q-radical', 'multiplier-ring', 'component-reduction', 'q-radical'], ['resource-error', 'stalled', 'certification-error'], [1, 1/18446744073709551629*a, 1/340282366920938463942989953348216553641*a^2], -9187623906865338526460728740401846948307, True, True, True, [3, 18446744073709551629]]",
      );
    } finally {
      await session.close();
    }
  },
);

test(
  "mixed support keeps word primes native and certifies only the exact fallback",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(
        [
          "from sagejs.number_fields.maximal_order_certification import check_order_lattice",
          "from sagejs.number_fields.maximal_order_engine import _basis_from_order",
          "import sagejs.number_fields.local_polygons as polygons",
          "p = 18446744073709551629",
          "q = 3",
          "coefficients = [-2*(p*q)^2, 0, 1]",
          "original_factor = polygons.factor_mod_prime",
          "factor_primes = []",
          "def arbitrary_only_factor(coefficients, prime):",
          "    factor_primes.append(prime)",
          "    if prime <= 18446744073709551615:",
          "        raise AssertionError('word prime escaped the native batch')",
          "    return original_factor(coefficients, prime)",
          "polygons.factor_mod_prime = arbitrary_only_factor",
          "R.<x> = QQ[]",
          "K.<a> = NumberField(R(coefficients))",
          "O = K.maximal_order(trace=True)",
          "polygons.factor_mod_prime = original_factor",
          "basis = _basis_from_order(O, 1)",
          "lattice = check_order_lattice(coefficients, basis.numerator, basis.denominator)",
          "corrupt_numerator = [list(row) for row in basis.numerator]",
          "corrupt_numerator[-1][0] = corrupt_numerator[-1][0] + 1",
          "corrupt = check_order_lattice(coefficients, corrupt_numerator, basis.denominator)",
          "events = O.maximal_order_trace()['events']",
          "native = [event for event in events if event['stage'] == 'native-local-orders'][0]",
          "partition = [event for event in events if event['stage'] == 'local-capability-partition'][0]",
          "stages = [event['stage'] for event in events]",
          "certificate = O.maximality_certificate()",
          "[factor_primes, O.basis(), O.discriminant(), O.is_maximal(), certificate['certified'], sorted([w['prime'] for w in certificate['local_witnesses']]), native['details']['resolved_prime_count'], native['details']['deferred_arbitrary_prime_count'], native['details']['capability_partitioned'], partition['details']['native_word_primes'], partition['details']['exact_fallback_primes'], 'arbitrary-prime-local-order' in stages, 'round2-local-order' in stages, lattice['valid'], corrupt['valid']]",
        ].join("\n"),
      );
      assert.equal(
        result.repr,
        "[[18446744073709551629], [1, 1/55340232221128654887*a], 8, True, True, [2, 3, 18446744073709551629], 2, 1, True, [2, 3], [18446744073709551629], True, False, True, False]",
      );
    } finally {
      await session.close();
    }
  },
);

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
