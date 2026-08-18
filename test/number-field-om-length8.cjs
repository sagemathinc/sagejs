"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const corpusPath = join(
  root,
  "test/fixtures/number-field-maximal-order-corpus.json",
);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const polynomial = corpus.cases.find(
  (item) => item.id === "pari-round4-vector-429",
).polynomial.coefficients;

const witness = String.raw`
import json
import sys
sys.path.append("${join(root, "src/lib")}")

from sagejs.number_fields.local_polygons import _row_hermite
from sagejs.number_fields.om_maxmin import (
    TriangularBasisElement,
    regular_local_basis,
    validate_triangular_basis,
)
from sagejs.number_fields.om_types import build_om_type_tree, validate_type_tree

fixture = json.load(open("${corpusPath}"))
case = next(item for item in fixture["cases"] if item["id"] == "pari-round4-vector-429")
polynomial = tuple(int(value) for value in case["polynomial"]["coefficients"])
result = regular_local_basis(polynomial, 2, local_discriminant_valuation=880)
if result.status != "complete" or result.certificate is None or result.order_basis is None:
    raise AssertionError(result.reason)
tree = result.type_tree
if not tree.complete or tree.expected_index_valuation != 332:
    raise AssertionError((tree.complete, tree.expected_index_valuation))
if not validate_type_tree(tree).valid:
    raise AssertionError("the independently rebuilt length-eight type tree differs")
if [branch.branch_degree for branch in tree.types] != [32, 32]:
    raise AssertionError("the terminal binary branches have wrong local degrees")

active = [
    [level for level in branch.levels if not level.optimized_away]
    for branch in tree.types
]
if [[level.order for level in levels] for levels in active] != [[1, 2, 3, 4]] * 2:
    raise AssertionError("the recursive linear towers have wrong depth")
if any(level.residual_field_modulus != (1, 1, 1) for levels in active for level in levels):
    raise AssertionError("the recursive residual evidence left F4")
if active[0][1].residual_polynomial != ((0, 1), (0,), (0,), (0,), (0, 1)):
    raise AssertionError(active[0][1].residual_polynomial)
if "active=(0, 4)" not in active[0][1].index_evidence:
    raise AssertionError(active[0][1].index_evidence)
if [level.slope.to_pair() for levels in active for level in levels[-2:]] != [
    (-18, 1), (-9, 2), (-17, 1), (-11, 2)
]:
    raise AssertionError("the terminal Montes slopes differ")
if [level.index_contribution for levels in active for level in levels] != [
    96, 12, 172, 8, 0, 0, 34, 10
]:
    raise AssertionError("the exact polygon-index decomposition differs")
if [
    sum(level.optimized_away and level.order == order for level in branch.levels)
    for branch in tree.types
    for order in (3, 4)
] != [10, 2, 10, 2]:
    raise AssertionError("the bounded representative trace differs")

certificate = result.certificate
if certificate.local_index_valuation != 332:
    raise AssertionError(certificate.local_index_valuation)
if certificate.maxmin.selection_kind != "gmn-mixed-radix-quotient-hnf":
    raise AssertionError(certificate.maxmin.selection_kind)
if not certificate.validation.valid or not certificate.validation.multiplication_closed:
    raise AssertionError(certificate.validation.failures)

# Localize the frozen PARI maximal-order basis at 2 and compare canonical row
# HNFs, proving equality of lattices rather than only matching their indices.
denominator = int(case["basis"]["denominator"])
oracle_exponent = 0
while denominator % 2 == 0:
    denominator //= 2
    oracle_exponent += 1
oracle_denominator = 2 ** oracle_exponent
degree = len(polynomial) - 1
oracle_hnf = [
    [oracle_denominator if row == column else 0 for column in range(degree)]
    for row in range(degree)
]
for row in case["basis"]["numerator"]:
    oracle_hnf = _row_hermite(
        oracle_hnf + [[int(value) % oracle_denominator for value in row]],
        degree,
    )
if oracle_exponent != 11 or result.order_basis.denominator != oracle_denominator:
    raise AssertionError("the p-local denominator differs from PARI")
if result.order_basis.numerator != oracle_hnf:
    raise AssertionError("the certified OM lattice differs from the PARI lattice")

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
    raise AssertionError("a corrupted mixed-radix quotient basis passed closure")

# Every domain limit remains explicit and independently replayable.
shallow = build_om_type_tree(polynomial, 2, max_type_depth=3)
if shallow.complete or set(shallow.incomplete_states()) != {"type-depth-bound"}:
    raise AssertionError(shallow.incomplete_states())
short = build_om_type_tree(polynomial, 2, max_representative_refinements=8)
if short.complete or short.incomplete_states() != ("representative-refinement-bound",):
    raise AssertionError(short.incomplete_states())

print("P2-LENGTH-EIGHT-EXACT")
`;

const sagejsWitness = String.raw`
from dataclasses import dataclass
from sagejs.number_fields.om_maxmin import regular_local_basis
from sagejs.number_fields.om_types import build_om_type_tree, validate_type_tree

polynomial = tuple(int(value) for value in ${JSON.stringify(polynomial)})
result = regular_local_basis(polynomial, 2, local_discriminant_valuation=880)
tree = result.type_tree
if result.status != "complete" or result.certificate is None or result.order_basis is None:
    raise AssertionError(result.reason)
if not tree.complete or tree.expected_index_valuation != 332:
    raise AssertionError((tree.complete, tree.expected_index_valuation))
if not validate_type_tree(tree).valid:
    raise AssertionError("the Sage.js recursive type tree differs")
if [branch.branch_degree for branch in tree.types] != [32, 32]:
    raise AssertionError("the Sage.js branch degrees differ")
if result.certificate.maxmin.selection_kind != "gmn-mixed-radix-quotient-hnf":
    raise AssertionError(result.certificate.maxmin.selection_kind)
if not result.certificate.validation.valid or not result.certificate.validation.multiplication_closed:
    raise AssertionError(result.certificate.validation.failures)
if result.order_basis.denominator != 2048:
    raise AssertionError(result.order_basis.denominator)
shallow = build_om_type_tree(polynomial, 2, max_type_depth=3)
if shallow.complete or set(shallow.incomplete_states()) != {"type-depth-bound"}:
    raise AssertionError(shallow.incomplete_states())
print("P2-LENGTH-EIGHT-SAGEJS")
`;

test("length-eight F4 residues equal the frozen PARI p-local lattice", () => {
  const result = spawnSync("python3", ["-"], {
    cwd: root,
    encoding: "utf8",
    input: witness,
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "P2-LENGTH-EIGHT-EXACT");
});

test("the exact length-eight F4 OM path runs through Sage.js", () => {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin/sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      input: sagejsWitness,
      timeout: 180_000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "P2-LENGTH-EIGHT-SAGEJS");
});
