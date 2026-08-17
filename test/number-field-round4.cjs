"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "number-field-round4.json"), "utf8"),
);
const primaryFixture = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures", "number-field-round4-primary.json"),
    "utf8",
  ),
);

function sageCase(record) {
  return `{` +
    `'id': ${JSON.stringify(record.id)}, ` +
    `'coefficients': [${record.coefficients.join(",")}], ` +
    `'prime': ${record.prime}, ` +
    `'polynomial_discriminant': ${record.polynomial_discriminant}, ` +
    `'field_discriminant': ${record.field_discriminant}, ` +
    `'local_discriminant_valuation': ${record.local_discriminant_valuation}, ` +
    `'local_index_valuation': ${record.local_index_valuation}, ` +
    `'local_output_discriminant': ${record.local_output_discriminant}, ` +
    `'factor_degrees': ${JSON.stringify(record.factor_degrees)}, ` +
    `'factor_multiplicities': ${JSON.stringify(record.factor_multiplicities)}` +
    `}`;
}

test("modified Round-4 plans reproduce frozen PARI stage invariants", async () => {
  const session = await createSage();
  try {
    const cases = `[${fixture.cases.map(sageCase).join(",")}]`;
    const result = await session.evaluate(
      [
        "R.<x> = ZZ[]",
        "from sagejs.number_fields.round4 import round4_local_plan",
        `cases = ${cases}`,
        "summary = []",
        "for case in cases:",
        "    f = R(case['coefficients'])",
        "    p = case['prime']",
        "    plan = round4_local_plan(f, p)",
        "    assert f.discriminant() == case['polynomial_discriminant']",
        "    assert plan.discriminant_valuation == case['local_discriminant_valuation']",
        "    actual = sorted(zip([len(g)-1 for g in plan.irreducible_factors], plan.multiplicities))",
        "    expected = sorted(zip(case['factor_degrees'], case['factor_multiplicities']))",
        "    assert actual == expected",
        "    assert plan.required_precision >= case['local_discriminant_valuation'] + 1",
        "    names = [stage.name for stage in plan.stages]",
        "    assert names == ['factor-mod-p', 'refine-primary-factors', 'dedekind-coefficient-ring', 'selector']",
        "    assert plan.stages[1].evidence['product_certified']",
        "    summary.append((case['id'], plan.required_precision, plan.selector.recommendation))",
        "summary",
      ].join("\n"),
    );
    assert.match(result.repr, /pari-1710-p3/);
    assert.match(result.repr, /pari-2510-p2/);
    assert.match(result.repr, /ford-letard-example-2-p3/);
  } finally {
    await session.close();
  }
});

test("canonical polynomial/HNF boundary returns exact local evidence", async () => {
  const session = await createSage();
  try {
    const cases = fixture.cases.filter((entry) =>
      [
        "ford-letard-example-1-p2",
        "ford-letard-example-2-p3",
        "pari-1735-p20533",
        "pari-2510-p2",
      ].includes(entry.id),
    );
    const sourceCases = `[${cases.map(sageCase).join(",")}]`;
    const result = await session.evaluate(
      [
        "from sagejs.number_fields.round4 import modified_round4_hnf, verify_round4_local_result",
        `cases = ${sourceCases}`,
        "answer = []",
        "for case in cases:",
        "    n = len(case['coefficients']) - 1",
        "    identity = [[1 if i == j else 0 for j in range(n)] for i in range(n)]",
        "    result = modified_round4_hnf(case['coefficients'], identity, 1, case['prime'])",
        "    certificate = result.certificate",
        "    assert result.order.discriminant() == case['local_output_discriminant']",
        "    assert certificate.local_index_valuation == case['local_index_valuation']",
        "    assert certificate.input_discriminant_valuation == case['local_discriminant_valuation']",
        "    assert certificate.input_discriminant_valuation == certificate.output_discriminant_valuation + 2*certificate.local_index_valuation",
        "    assert certificate.closure_checked",
        "    assert len(certificate.basis_numerator) == n",
        "    if n <= 5:",
        "        assert verify_round4_local_result(result)",
        "    answer.append((case['id'], certificate.algorithm, certificate.local_index, certificate.basis_denominator))",
        "answer",
      ].join("\n"),
    );
    assert.match(result.repr, /modified-round4/);
    assert.match(result.repr, /modified-round4-dedekind-discriminant-certified/);
    assert.match(result.repr, /262144/); // 2^18 for PARI #2510.
  } finally {
    await session.close();
  }
});

test("deep primary Round-4 stages construct frozen PARI local orders", async () => {
  const session = await createSage();
  try {
    const cases = primaryFixture.cases
      .map(
        (record) =>
          `{` +
          `'id': ${JSON.stringify(record.id)}, ` +
          `'coefficients': [${record.coefficients.join(",")}], ` +
          `'prime': ${record.prime}, ` +
          `'ramification_degree': ${record.ramification_degree}, ` +
          `'residue_degree': ${record.residue_degree}, ` +
          `'local_index': ${record.local_index}, ` +
          `'local_index_valuation': ${record.local_index_valuation}, ` +
          `'local_output_discriminant': ${record.local_output_discriminant}, ` +
          `'required_power_stages': ${JSON.stringify(record.required_power_stages)}` +
          `}`,
      )
      .join(",");
    const result = await session.evaluate(
      [
        "R.<x> = ZZ[]",
        "from sagejs.number_fields.round4 import modified_round4_local_order",
        `cases = [${cases}]`,
        "answer = []",
        "for case in cases:",
        "    K = NumberField(R(case['coefficients']), 'a')",
        "    result = modified_round4_local_order(K.equation_order(), case['prime'], strict=True)",
        "    certificate = result.certificate",
        "    assert certificate.algorithm == 'modified-round4-primary-power-basis'",
        "    assert certificate.fallback_reason is None",
        "    assert certificate.local_index == case['local_index']",
        "    assert certificate.local_index_valuation == case['local_index_valuation']",
        "    assert result.order.discriminant() == case['local_output_discriminant']",
        "    power_stages = [stage for stage in result.plan.stages if 'power-basis' in stage.name]",
        "    names = [stage.name for stage in power_stages]",
        "    for required in case['required_power_stages']:",
        "        assert required in names",
        "    final = power_stages[-1].evidence",
        "    assert final['ramification_degree'] == case['ramification_degree']",
        "    assert final['residue_degree'] == case['residue_degree']",
        "    assert final['local_index'] == case['local_index']",
        "    assert final['p_maximality_verifier'] == 'ford-letard-ef-degree-certificate'",
        "    assert final['closure_witness'].startswith('nested local orders')",
        "    answer.append((case['id'], names, final['output_discriminant']))",
        "answer",
      ].join("\n"),
    );
    assert.match(result.repr, /pari-2510-p2/);
    assert.match(result.repr, /pari-round4-vector-008-p2/);
    assert.match(result.repr, /power-basis-ramification-composition/);
  } finally {
    await session.close();
  }
});

test("bounded residue matching returns a complete Frobenius root orbit", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "from sagejs.number_fields.round4 import _bounded_residue_roots, _quotient_polynomial_evaluate, _quotient_polynomial_power",
            "polynomial = [1, 1, 1]",
            "modulus = [1, 1, 0, 0, 1]",
            "roots = _bounded_residue_roots(polynomial, modulus, 2)",
            "assert roots == [[0, 1, 1], [1, 1, 1]]",
            "assert all(_quotient_polynomial_evaluate(polynomial, root, modulus, 2) == [0] for root in roots)",
            "assert _quotient_polynomial_power(roots[0], 2, modulus, 2) == roots[1]",
            "assert _quotient_polynomial_power(roots[1], 2, modulus, 2) == roots[0]",
            "roots",
          ].join("\n"),
        )
      ).repr,
      "[[0, 1, 1], [1, 1, 1]]",
    );
  } finally {
    await session.close();
  }
});

test("Round-4 and Round-2 agree on deterministic randomized low-degree fields", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "from sagejs.number_fields.round4 import modified_round4_local_order",
            "from sagejs.number_fields.maximal_order import p_maximal_overorder_dynamic",
            "state = 1729",
            "checked = 0",
            "nontrivial = 0",
            "for degree in [2, 3, 4]:",
            "    for sample in range(10):",
            "        coefficients = []",
            "        for j in range(degree):",
            "            state = (1103515245*state + 12345) % 2147483648",
            "            coefficients.append((state % 11) - 5)",
            "        coefficients.append(1)",
            "        f = R(coefficients)",
            "        if f.discriminant() == 0 or not f.is_irreducible():",
            "            continue",
            "        for p in [2, 3, 5]:",
            "            K = NumberField(f, 'a')",
            "            E = K.equation_order()",
            "            r4 = modified_round4_local_order(E, p, 'dynamic-round2').order",
            "            r2 = p_maximal_overorder_dynamic(E, p)",
            "            assert r4._basis_rows == r2._basis_rows",
            "            assert r4.discriminant() == r2.discriminant()",
            "            checked += 1",
            "            if r4._basis_rows != E._basis_rows:",
            "                nontrivial += 1",
            "[checked >= 30, nontrivial >= 1]",
          ].join("\n"),
        )
      ).repr,
      "[True, True]",
    );
  } finally {
    await session.close();
  }
});

test("strict Round-4 mode fails closed on an unfinished primary branch", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "R.<x> = QQ[]",
            "from sagejs.number_fields.round4 import modified_round4_local_order, Round4Unsupported",
            "K = NumberField(x^4+3*x^3-x^2+8*x+8, 'a')",
            "failed_closed = False",
            "try:",
            "    modified_round4_local_order(K.equation_order(), 2, strict=True)",
            "except Round4Unsupported as error:",
            "    failed_closed = 'power-basis search' in str(error)",
            "failed_closed",
          ].join("\n"),
        )
      ).repr,
      "True",
    );
  } finally {
    await session.close();
  }
});
