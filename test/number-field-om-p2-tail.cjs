// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const corpus = JSON.parse(
  readFileSync(
    join(root, "test/fixtures/number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const vector = corpus.cases.find(
  (item) => item.id === "pari-round4-vector-429",
);
const polynomial = vector.polynomial.coefficients;
const oracleNumerator = vector.basis.numerator;
const oracleDenominator = vector.basis.denominator;

const common = String.raw`
import json
import sys
sys.path.append("${join(root, "src/lib")}")

from sagejs.number_fields.om_maxmin import (
    TriangularBasisElement,
    regular_local_basis,
    validate_triangular_basis,
)

polynomial = tuple(int(value) for value in ${JSON.stringify(polynomial)})
result = regular_local_basis(
    polynomial,
    2,
    local_discriminant_valuation=792,
    differential_evidence=True,
)
if result.status != "complete" or result.certificate is None or result.order_basis is None:
    raise AssertionError(result.reason)
certificate = result.certificate
tree = result.type_tree
if not tree.complete or tree.expected_index_valuation != 332:
    raise AssertionError((tree.complete, tree.expected_index_valuation))
if [branch.branch_degree for branch in tree.types] != [32, 32]:
    raise AssertionError("the binary higher branches have the wrong degrees")
if certificate.maxmin.selection_kind != "gmn-mixed-radix-quotient-hnf":
    raise AssertionError(certificate.maxmin.selection_kind)
if not certificate.validation.valid or not certificate.maxmin.maximality_checked:
    raise AssertionError(certificate.validation.failures)

element = certificate.basis[-1]
corrupted_numerator = list(element.numerator)
corrupted_numerator[0] += 1
corrupted = certificate.basis[:-1] + (
    TriangularBasisElement(
        element.degree,
        tuple(corrupted_numerator),
        element.denominator_exponent,
        element.denominator,
        element.certified_valuation,
    ),
)
bad = validate_triangular_basis(polynomial, 2, tree, corrupted, 332)
if bad.valid or bad.multiplication_closed:
    raise AssertionError("a corrupted binary quotient basis passed closure")
`;

const cpython =
  common +
  String.raw`
from sagejs.number_fields.local_polygons import _row_hermite

oracle_denominator = int(${JSON.stringify(oracleDenominator)})
oracle_exponent = 0
while oracle_denominator % 2 == 0:
    oracle_denominator //= 2
    oracle_exponent += 1
local_denominator = 2 ** oracle_exponent
degree = len(polynomial) - 1
oracle_rows = [
    [int(value) % local_denominator for value in row]
    for row in ${JSON.stringify(oracleNumerator)}
]
oracle_rows.extend(
    [
        [local_denominator if row == column else 0 for column in range(degree)]
        for row in range(degree)
    ]
)
oracle_hnf = _row_hermite(oracle_rows, degree)
if result.order_basis.denominator != local_denominator:
    raise AssertionError("the p=2 denominator differs from the frozen PARI basis")
if result.order_basis.numerator != oracle_hnf:
    raise AssertionError("the p=2 lattice differs from the frozen PARI lattice")
print(json.dumps({
    "certificate_id": tree.certificate_id,
    "denominator": result.order_basis.denominator,
    "numerator": result.order_basis.numerator,
    "region": result.selector.measured_crossover_region,
    "auto": result.selector.auto_selectable,
}))
`;

const sagejs =
  String.raw`
from dataclasses import dataclass
` +
  common +
  String.raw`
from sagejs.native import is_compiled
from sagejs.number_fields.om_maxmin import (
    packed_incremental_row_hnf_in_place,
    packed_maxmin_valuations_are_maximal,
    packed_triangular_basis_is_closed,
)

compiled = (
    is_compiled(packed_incremental_row_hnf_in_place)
    and is_compiled(packed_maxmin_valuations_are_maximal)
    and is_compiled(packed_triangular_basis_is_closed)
)
print(json.dumps({
    "certificate_id": tree.certificate_id,
    "denominator": result.order_basis.denominator,
    "numerator": result.order_basis.numerator,
    "region": result.selector.measured_crossover_region,
    "auto": result.selector.auto_selectable,
    "compiled": compiled,
}))
`;

function run(command, args, input, timeout) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input,
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}

test("vector429 p=2 OM equals the frozen local HNF and rejects corruption", () => {
  const expected = run("python3", ["-"], cpython, 30_000);
  const actual = run(
    process.execPath,
    [join(root, "bin/sagejs"), "--python"],
    sagejs,
    30_000,
  );
  assert.equal(expected.auto, false);
  assert.equal(actual.compiled, true);
  assert.equal(actual.region, "");
  assert.equal(actual.auto, false);
  assert.equal(actual.certificate_id, expected.certificate_id);
  assert.equal(actual.denominator, expected.denominator);
  assert.deepEqual(actual.numerator, expected.numerator);
});
