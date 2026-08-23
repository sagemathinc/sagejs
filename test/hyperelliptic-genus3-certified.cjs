// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("deterministic primary and twist witnesses uniquely complete a genus-3 factor", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^7+x+1)",
            "from sagejs.hyperelliptic_curves.certified_genus3 import rforest_genus3_local_factor",
            "events = []",
            "def observe(event, details):",
            "    events.append(event)",
            "def forbidden_fallback(_curve, _prime):",
            "    raise AssertionError('unique completion used its fallback')",
            "answer = rforest_genus3_local_factor(",
            "    C, 5, exact_fallback=forbidden_fallback,",
            "    max_x_values=5, max_elements=1, stage_observer=observe)",
            "primary = answer['certificate']['jacobian']",
            "twist = answer['certificate']['twist']",
            "[(answer['status'], answer['coefficients'],",
            "  answer['certificate']['initial_candidate_count']),",
            " (primary['surviving_candidates'],",
            "  tuple(c['element_order'] for c in primary['certificates']),",
            "  primary['certificates'][0]['verification'],",
            "  primary['recheck_scalar_multiplications']),",
            " (twist['surviving_candidates'],",
            "  tuple(c['element_order'] for c in twist['certificates'])),",
            " events]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[('unique', (1, 3, 9, 17, 45, 75, 125), 28), " +
        "(2, (55,), 'native_exact_factor_and_strip', 0), (1, (17,)), " +
        "['residue_start', 'residue_end', 'candidate_start', " +
        "'candidate_end', 'primary_start', " +
        "'primary_end', 'twist_start', 'twist_end']]",
    );
  } finally {
    await session.close();
  }
});

test("generalized odd models normalize while even models fall back exactly", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "h = x^3+1",
            "C = HyperellipticCurve((x^7+x+1-h^2)/4, h)",
            "E = HyperellipticCurve(x^8+x+1)",
            "from sagejs.hyperelliptic_curves.certified_genus3 import (",
            "    complete_genus3_residues_with_jacobian, rforest_genus3_local_factor)",
            "generalized = complete_genus3_residues_with_jacobian(",
            "    C, 5, (3,4,2),",
            "    exact_fallback=lambda _curve,_p:(1,3,9,17,45,75,125),",
            "    max_x_values=5, max_elements=1)",
            "fallback_calls = []",
            "def even_fallback(_curve, prime):",
            "    fallback_calls.append(prime)",
            "    return (1,3,10,20,50,75,125)",
            "even = complete_genus3_residues_with_jacobian(",
            "    E, 5, (3,0,0), exact_fallback=even_fallback,",
            "    max_x_values=5, max_elements=1)",
            "at_two = rforest_genus3_local_factor(",
            "    C, 2, exact_fallback=lambda _curve,_p:(1,0,0,0,0,0,8))",
            "limited = complete_genus3_residues_with_jacobian(",
            "    C, 5, (3,4,2),",
            "    exact_fallback=lambda _curve,_p:(1,3,9,17,45,75,125),",
            "    order_certificate_provider=lambda _J,_D,_b,_s,_c,_k,_r:None,",
            "    max_x_values=5, max_elements=1, max_trial_divisions=1)",
            "[(generalized['status'], generalized['coefficients']),",
            " (even['status'], even['diagnostics']['fallback_reason'],",
            "  even['coefficients'], fallback_calls),",
            " (at_two['status'], at_two['diagnostics']['fallback_reason']),",
            " (limited['status'], limited['diagnostics']['fallback_reason'])]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[('unique', (1, 3, 9, 17, 45, 75, 125)), " +
        "('fallback', 'unsupported_jacobian_model', " +
        "(1, 3, 10, 20, 50, 75, 125), [5]), " +
        "('fallback', 'characteristic_two'), " +
        "('fallback', 'certification_resource_limit')]",
    );
  } finally {
    await session.close();
  }
});

test("native order evidence is rechecked and survivor hints are ignored", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^7+x+1)",
            "from sagejs.hyperelliptic_curves.certified_genus3 import complete_genus3_residues_with_jacobian",
            "def provider(_J, element, _base, _stride, _count, kind, _budgets):",
            "    e = 55 if kind == 'jacobian' else 17",
            "    factors = ((5,1),(11,1)) if kind == 'jacobian' else ((17,1),)",
            "    return {'status':'found', 'certificate': {'divisor':element,",
            "        'element_order':e, 'prime_factors':factors},",
            "        'survivors': ()}",
            "answer = complete_genus3_residues_with_jacobian(",
            "    C, 5, (3,4,2),",
            "    exact_fallback=lambda _curve,_p:(1,3,9,17,45,75,125),",
            "    order_certificate_provider=provider,",
            "    max_x_values=5, max_elements=1)",
            "def composite_factor(_J, element, _base, _stride, _count, _kind, _budgets):",
            "    return {'status':'found', 'certificate': {'divisor':element,",
            "        'element_order':55, 'prime_factors':((55,1),)}}",
            "try:",
            "    complete_genus3_residues_with_jacobian(",
            "        C, 5, (3,4,2),",
            "        exact_fallback=lambda _curve,_p:(1,3,9,17,45,75,125),",
            "        order_certificate_provider=composite_factor,",
            "        max_x_values=5, max_elements=1)",
            "except Exception as error:",
            "    rejected = (type(error).__name__, str(error))",
            "[(answer['status'], answer['coefficients'],",
            "  answer['certificate']['jacobian']['backend'],",
            "  answer['certificate']['twist']['backend']), rejected]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[('unique', (1, 3, 9, 17, 45, 75, 125), 'kernel', 'kernel'), " +
        "('ArithmeticError', " +
        "'order-certificate factors must be increasing primes')]",
    );
  } finally {
    await session.close();
  }
});

test("an interval uses one residue traversal and falls back per row", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^7+x+1)",
            "from sagejs.hyperelliptic_curves.certified_genus3 import rforest_genus3_local_factors",
            "events = []",
            "def observe(event, _details):",
            "    events.append(event)",
            "def exact(_curve, prime):",
            "    if prime == 5:",
            "        return (1,3,9,17,45,75,125)",
            "    return (1,0,21,0,147,0,343)",
            "rows = rforest_genus3_local_factors(",
            "    C, 5, 11, exact_fallback=exact,",
            "    max_combinations=1, max_x_values=7, max_elements=1,",
            "    stage_observer=observe)",
            "([(p, row['status'], row['coefficients']) for p,row in rows],",
            " events.count('residue_start'), events.count('residue_end'),",
            " events.count('fallback_start'))",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "([(5, 'fallback', (1, 3, 9, 17, 45, 75, 125)), " +
        "(7, 'fallback', (1, 0, 21, 0, 147, 0, 343)), " +
        "(11, 'omitted', None)], 1, 1, 2)",
    );
  } finally {
    await session.close();
  }
});

test("auto selects only the measured complete odd-degree genus-3 pipeline", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "C = HyperellipticCurve(x^7+x+1)",
            "E = HyperellipticCurve(x^8+x+1)",
            "from sagejs.hyperelliptic_curves.frobenius import _select_rational_algorithm",
            "import sagejs.hyperelliptic_curves.certified_genus3 as certified",
            "selected = (_select_rational_algorithm(C,'auto',5,5),",
            "            _select_rational_algorithm(C,'auto',2,101),",
            "            _select_rational_algorithm(C,'auto',2,100000),",
            "            _select_rational_algorithm(C,'auto',2,100002),",
            "            _select_rational_algorithm(C,'auto',2,2),",
            "            _select_rational_algorithm(E,'auto',5,5))",
            "auto = C.local_lpolynomial(5)",
            "explicit = C.local_lpolynomial(5, algorithm='rforest')",
            "sorted_factors = C.local_lpolynomial(2833, algorithm='rforest')",
            "verification = C._local_lpolynomial_cache[('rforest',5)]",
            "candidate_capability = certified.genus3_candidate_kernel_available",
            "certified.genus3_candidate_kernel_available = lambda: False",
            "disabled = certified.rforest_genus3_auto_supported(C,5,5)",
            "certified.genus3_candidate_kernel_available = candidate_capability",
            "(selected, disabled, auto == explicit, tuple(verification), sorted_factors)",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "(('rforest', 'rforest', 'rforest', 'exhaustive', 'exhaustive', " +
        "'exhaustive'), " +
        "False, True, (1, 3, 9, 17, 45, 75, 125), " +
        "22737343537*T^6 - 441423895*T^5 + 14230159*T^4 - " +
        "205077*T^3 + 5023*T^2 - 55*T + 1)",
    );
  } finally {
    await session.close();
  }
});
