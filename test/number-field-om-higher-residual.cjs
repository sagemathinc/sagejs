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
const polynomial = corpus.cases.find(
  (item) => item.id === "pari-round4-vector-429",
).polynomial.coefficients;

const witness = String.raw`
import json
import sys
sys.path.append(${JSON.stringify(join(root, "src/lib"))})

from sagejs.number_fields.local_polygons import _row_hermite
from sagejs.number_fields.om_higher_residue import order_two_residual_evidence
from sagejs.number_fields.om_maxmin import (
    TriangularBasisElement,
    regular_local_basis,
    validate_triangular_basis,
)
from sagejs.number_fields.om_types import (
    OMResourceError,
    build_om_type_tree,
    higher_newton_polygon,
    representative_from_level,
    validate_type_tree,
)

fixture = json.load(open(${JSON.stringify(join(root, "test/fixtures/number-field-maximal-order-corpus.json"))}))
case = next(item for item in fixture["cases"] if item["id"] == "pari-round4-vector-429")
polynomial = tuple(int(value) for value in case["polynomial"]["coefficients"])
result = regular_local_basis(polynomial, 5, local_discriminant_valuation=312)
if result.status != "complete" or result.certificate is None or result.order_basis is None:
    raise AssertionError(result.reason)
tree = result.type_tree
if not tree.complete or tree.expected_index_valuation != 132:
    raise AssertionError((tree.complete, tree.expected_index_valuation))
if not validate_type_tree(tree).valid:
    raise AssertionError("the independently rebuilt type tree differs")
if [branch.branch_degree for branch in tree.types] != [16, 16, 16, 16]:
    raise AssertionError("the nonlinear residual factors have wrong local degrees")
if [len(branch.levels) for branch in tree.types] != [2, 2, 2, 2]:
    raise AssertionError("the order-two trace is missing")
last = tree.types[-1].levels[-1]
if last.residual_polynomial != ((4, 0, 1), (1, 0, 2), (1,)):
    raise AssertionError(last.residual_polynomial)
if last.residual_factor != ((3, 0, 2), (1,)):
    raise AssertionError(last.residual_factor)
if "components=(2, 1, 0)" not in last.index_evidence:
    raise AssertionError(last.index_evidence)
if "twists=(-4, -4, -4)" not in last.index_evidence:
    raise AssertionError(last.index_evidence)

prior = tree.types[-1].levels[0]
higher_key = representative_from_level(prior, 5)
side = higher_newton_polygon(polynomial, 5, higher_key, (prior,))[0]
residual = order_two_residual_evidence(polynomial, 5, higher_key, prior, side)
if residual.polynomial != last.residual_polynomial:
    raise AssertionError("public residual evidence differs from the type trace")
if residual.component_abscissas != (2, 1, 0) or residual.twist_exponents != (-4, -4, -4):
    raise AssertionError(residual)

certificate = result.certificate
if certificate.local_index_valuation != 132:
    raise AssertionError(certificate.local_index_valuation)
if certificate.maxmin.selection_kind != "gmn-order-two-quotient-hnf":
    raise AssertionError(certificate.maxmin.selection_kind)
if not certificate.maxmin.maximality_checked or not certificate.validation.valid:
    raise AssertionError(certificate.validation.failures)
if result.local_result.state != "complete" or result.local_result.algorithm != "om-maxmin":
    raise AssertionError(result.local_result.to_dict())

# The frozen basis is a PARI-certified global maximal-order lattice.  Localize
# it at 5, add the equation order, and compare canonical row-HNF lattices.
denominator = int(case["basis"]["denominator"])
oracle_exponent = 0
while denominator % 5 == 0:
    denominator //= 5
    oracle_exponent += 1
oracle_denominator = 5 ** oracle_exponent
degree = len(polynomial) - 1
oracle_rows = [
    [int(value) % oracle_denominator for value in row]
    for row in case["basis"]["numerator"]
]
oracle_rows.extend(
    [
        [oracle_denominator if row == column else 0 for column in range(degree)]
        for row in range(degree)
    ]
)
oracle_hnf = _row_hermite(oracle_rows, degree)
if result.order_basis.denominator != oracle_denominator:
    raise AssertionError("the p-local common denominator differs from PARI")
if oracle_hnf != result.order_basis.numerator:
    raise AssertionError("the certified OM lattice differs from the PARI lattice")

# Independent basis validation must reject a coefficient corruption while the
# exact type tree remains valid.
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
bad = validate_triangular_basis(polynomial, 5, tree, corrupted, 132)
if bad.valid or bad.multiplication_closed:
    raise AssertionError("a corrupted quotient-HNF basis passed closure")

for prime, expected_index, expected_degrees in (
    (2, 332, [32, 32]),
    (3, 544, [8] * 8),
):
    adjacent = build_om_type_tree(polynomial, prime)
    if (
        not adjacent.complete
        or adjacent.expected_index_valuation != expected_index
        or [branch.branch_degree for branch in adjacent.types] != expected_degrees
    ):
        raise AssertionError((prime, adjacent.incomplete_states()))
    if not validate_type_tree(adjacent).valid:
        raise AssertionError("an adjacent recursive type tree does not replay")

try:
    build_om_type_tree(polynomial, 5, max_enumerated_candidates=1)
except OMResourceError:
    pass
else:
    raise AssertionError("the nonlinear residual factorization ignored its work bound")

print("P5-ORDER-TWO-EXACT")
`;

const sagejsWitness = String.raw`
# Preload the lazy standard-library dependency before the strict mathematical
# modules, just as the bundled runtime does for ordinary baselib imports.
from dataclasses import dataclass
from sagejs.number_fields.om_higher_residue import order_two_residual_evidence
from sagejs.number_fields.om_maxmin import regular_local_basis
from sagejs.number_fields.om_types import higher_newton_polygon, representative_from_level, validate_type_tree

polynomial = tuple(int(value) for value in ${JSON.stringify(polynomial)})
result = regular_local_basis(polynomial, 5, local_discriminant_valuation=312)
tree = result.type_tree
if result.status != "complete" or result.certificate is None or result.order_basis is None:
    raise AssertionError(result.reason)
if not tree.complete or tree.expected_index_valuation != 132 or not validate_type_tree(tree).valid:
    raise AssertionError("the Sage.js type certificate differs")
if result.certificate.maxmin.selection_kind != "gmn-order-two-quotient-hnf":
    raise AssertionError(result.certificate.maxmin.selection_kind)
if result.certificate.local_index_valuation != 132 or not result.certificate.validation.valid:
    raise AssertionError(result.certificate.validation.failures)
if result.order_basis.denominator != 3125:
    raise AssertionError(result.order_basis.denominator)
prior = tree.types[-1].levels[0]
higher_key = representative_from_level(prior, 5)
side = higher_newton_polygon(polynomial, 5, higher_key, (prior,))[0]
residual = order_two_residual_evidence(polynomial, 5, higher_key, prior, side)
if residual.polynomial != ((4, 0, 1), (1, 0, 2), (1,)):
    raise AssertionError(residual.polynomial)
if residual.twist_exponents != (-4, -4, -4):
    raise AssertionError(residual.twist_exponents)
print("P5-ORDER-TWO-SAGEJS")
`;

test("nonlinear order-two OM quotients equal the frozen PARI p-local lattice", () => {
  const result = spawnSync("python3", ["-"], {
    cwd: root,
    encoding: "utf8",
    input: witness,
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "P5-ORDER-TWO-EXACT");
});

test("the exact nonlinear order-two path runs through Sage.js", () => {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin/sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      input: sagejsWitness,
      timeout: 120_000,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "P5-ORDER-TWO-SAGEJS");
});
