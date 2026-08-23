// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");
const corpus = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const largePrime = corpus.cases.find(
  (entry) => entry.id === "pari-large-prime-quadratic-compositum",
);
assert.ok(largePrime, "missing large-prime compositum fixture");

test("coprime composite local orders construct independently and merge exactly", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "from sagejs.number_fields.composite_local_merge import certified_composite_overorder_from_equation, merge_certified_coprime_composite_order",
      "from sagejs.number_fields.maximal_order_certification import check_order_lattice",
      "from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent",
      "import sagejs._baselib.number_fields as nf_baselib",
      "eng = nf_baselib._nf_maximal_order_engine_module()",
      "R = PolynomialRing(QQ, 'x')",
      `coefficients = [${largePrime.polynomial.coefficients.join(",")}]`,
      "K = NumberField(R(coefficients), 'a')",
      "integral_coefficients, scale = eng._integral_polynomial_data(K)",
      "equation_order = K.equation_order()",
      "equation_discriminant = eng._exact_integer(equation_order.discriminant())",
      "decomposition = eng.decompose_discriminant(integral_coefficients, equation_discriminant)",
      "records = [record for record in decomposition['components'] if record['state'] != 'proven-prime']",
      "assert len(records) == 2",
      "order = equation_order",
      "supports = ()",
      "results = []",
      "def materialize(basis, discriminant):",
      "    return eng._order_from_basis(K, basis, scale, discriminant)",
      "def merge(left, right):",
      "    return eng._merge_orders(K, left, right)",
      "for record in records:",
      "    component = DiscriminantComponent(int(record['base']), str(record['state']), evidence={'source_component':int(record['value'])})",
      "    local_result = certified_composite_overorder_from_equation(integral_coefficients, component, equation_discriminant)",
      "    assert local_result.state == 'complete'",
      "    order, supports = merge_certified_coprime_composite_order(order, supports, local_result, materialize_local_order=materialize, merge_orders=merge)",
      "    results.append(local_result)",
      "merged_basis = eng._basis_from_order(order, scale)",
      "merged_discriminant = eng._exact_integer(order.discriminant())",
      "merged_index = eng._index_from_discriminants(equation_discriminant, merged_discriminant)",
      "expected_index = results[0].index * results[1].index",
      "assert merged_index == expected_index",
      "assert equation_discriminant == merged_discriminant * merged_index * merged_index",
      "lattice = check_order_lattice(integral_coefficients, merged_basis.numerator, merged_basis.denominator)",
      "assert lattice['valid']",
      "try:",
      "    merge_certified_coprime_composite_order(order, supports, results[0], materialize_local_order=materialize, merge_orders=merge)",
      "    refused_overlap = False",
      "except ArithmeticError:",
      "    refused_overlap = True",
      "assert refused_overlap",
      "[(result.state, result.index > 1, result.evidence['stage']) for result in results], [support.bit_length() for support in supports], merged_index == expected_index, lattice['reason'], refused_overlap",
    ].join("\n"));
    assert.equal(
      result.repr,
      "([('complete', True, 'composite-dedekind'), " +
        "('complete', False, 'composite-dedekind')], [387, 731], True, " +
        "'checked', True)",
    );
  } finally {
    await session.close();
  }
});
