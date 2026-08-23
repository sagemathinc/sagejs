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
import dataclasses
import decimal
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

fixture = json.load(open("${join(root, "test/fixtures/number-field-maximal-order-corpus.json")}"))
case = next(item for item in fixture["cases"] if item["id"] == "pari-round4-vector-429")
polynomial = tuple(int(value) for value in case["polynomial"]["coefficients"])
result = regular_local_basis(polynomial, 3, local_discriminant_valuation=880)
if result.status != "complete" or result.certificate is None or result.order_basis is None:
    raise AssertionError(result.reason)
tree = result.type_tree
if not tree.complete or tree.expected_index_valuation != 544:
    raise AssertionError((tree.complete, tree.expected_index_valuation))
if not validate_type_tree(tree).valid:
    raise AssertionError("the independently rebuilt length-four type tree differs")
if [branch.branch_degree for branch in tree.types] != [8] * 8:
    raise AssertionError("the nonlinear higher residues have wrong local degrees")

second = tree.types[0].levels[1]
if second.residual_polynomial != (
    (1,), (0,), (2,), (0,), (2,), (0,), (2,), (0,), (1,)
):
    raise AssertionError(second.residual_polynomial)
if second.residual_factor != ((1,), (0,), (1,)):
    raise AssertionError(second.residual_factor)
if "active=(0, 2, 4, 6, 8)" not in second.index_evidence:
    raise AssertionError(second.index_evidence)
if "components=(0, 2, 0, 2, 0)" not in second.index_evidence:
    raise AssertionError(second.index_evidence)
if "twists=(-18, -17, -17, -16, -16)" not in second.index_evidence:
    raise AssertionError(second.index_evidence)

third = tree.types[0].levels[2]
if third.key_polynomial != (9, 0, 9, 0, 6, 0, 0, 0, 1):
    raise AssertionError(third.key_polynomial)
if third.residual_field_modulus != (1, 0, 1):
    raise AssertionError(third.residual_field_modulus)
if third.residual_polynomial != ((2,), (0, 2), (2,)):
    raise AssertionError(third.residual_polynomial)
if "active=(0, 1, 2);components=(0, 1, 0);twists=(0, 1, 0)" not in third.index_evidence:
    raise AssertionError(third.index_evidence)
refined = tree.types[4].levels
if [level.optimized_away for level in refined[2:]] != [True, True, False]:
    raise AssertionError("the repeated F9 residue did not retain its refinement trace")
if refined[-1].key_polynomial != (63, 0, 45, 0, 12, 0, 6, 0, 1):
    raise AssertionError(refined[-1].key_polynomial)

certificate = result.certificate
if certificate.local_index_valuation != 544:
    raise AssertionError(certificate.local_index_valuation)
if certificate.maxmin.selection_kind != "gmn-mixed-radix-quotient-hnf":
    raise AssertionError(certificate.maxmin.selection_kind)
if not certificate.maxmin.maximality_checked or not certificate.validation.valid:
    raise AssertionError(certificate.validation.failures)
if not certificate.validation.multiplication_closed:
    raise AssertionError("the independently checked quotient lattice is not closed")

# The frozen basis was produced by PARI's maximal-order implementation. Localize
# it at 3 and compare canonical HNF lattices, not merely index valuations.
denominator = int(case["basis"]["denominator"])
oracle_exponent = 0
while denominator % 3 == 0:
    denominator //= 3
    oracle_exponent += 1
oracle_denominator = 3 ** oracle_exponent
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
if oracle_exponent != 18 or result.order_basis.denominator != oracle_denominator:
    raise AssertionError("the p-local denominator differs from PARI")
if result.order_basis.numerator != oracle_hnf:
    raise AssertionError("the certified OM lattice differs from the PARI lattice")

# The independent checker must reject a coefficient corruption even though the
# exact type tree and its index evidence are unchanged.
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
bad = validate_triangular_basis(polynomial, 3, tree, corrupted, 544)
if bad.valid or bad.multiplication_closed:
    raise AssertionError("a corrupted mixed-radix quotient basis passed closure")

# The adjacent effective length-eight F4 tower is now complete as well. Keep
# this cross-check here so later length-four changes cannot silently regress
# the shared recursive residual operator.
p2_tree = build_om_type_tree(polynomial, 2)
if not p2_tree.complete or p2_tree.expected_index_valuation != 332:
    raise AssertionError((p2_tree.complete, p2_tree.expected_index_valuation))
if [branch.branch_degree for branch in p2_tree.types] != [32, 32]:
    raise AssertionError([branch.branch_degree for branch in p2_tree.types])
if not validate_type_tree(p2_tree).valid:
    raise AssertionError("the p=2 length-eight tree does not replay")

print("P3-LENGTH-FOUR-EXACT")
`;

const sagejsWitness = String.raw`
from dataclasses import dataclass
from sagejs.number_fields.om_maxmin import regular_local_basis
from sagejs.number_fields.om_types import build_om_type_tree, validate_type_tree

polynomial = tuple(int(value) for value in ${JSON.stringify(polynomial)})
result = regular_local_basis(polynomial, 3, local_discriminant_valuation=880)
tree = result.type_tree
if result.status != "complete" or result.certificate is None or result.order_basis is None:
    raise AssertionError(result.reason)
if not tree.complete or tree.expected_index_valuation != 544:
    raise AssertionError((tree.complete, tree.expected_index_valuation))
if not validate_type_tree(tree).valid:
    raise AssertionError("the Sage.js type tree differs")
if [branch.branch_degree for branch in tree.types] != [8] * 8:
    raise AssertionError("the Sage.js branch degrees differ")
if result.certificate.maxmin.selection_kind != "gmn-mixed-radix-quotient-hnf":
    raise AssertionError(result.certificate.maxmin.selection_kind)
if result.certificate.local_index_valuation != 544:
    raise AssertionError(result.certificate.local_index_valuation)
if not result.certificate.validation.valid or not result.certificate.validation.multiplication_closed:
    raise AssertionError(result.certificate.validation.failures)
if result.order_basis.denominator != 387420489:
    raise AssertionError(result.order_basis.denominator)
if tree.types[0].levels[2].residual_polynomial != ((2,), (0, 2), (2,)):
    raise AssertionError(tree.types[0].levels[2].residual_polynomial)
p2_tree = build_om_type_tree(polynomial, 2)
if not p2_tree.complete or p2_tree.expected_index_valuation != 332:
    raise AssertionError((p2_tree.complete, p2_tree.expected_index_valuation))
if [branch.branch_degree for branch in p2_tree.types] != [32, 32]:
    raise AssertionError([branch.branch_degree for branch in p2_tree.types])
if not validate_type_tree(p2_tree).valid:
    raise AssertionError("the Sage.js p=2 length-eight tree differs")
print("P3-LENGTH-FOUR-SAGEJS")
`;

test("length-four higher residues equal the frozen PARI p-local lattice", () => {
  const result = spawnSync("python3", ["-"], {
    cwd: root,
    encoding: "utf8",
    input: witness,
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "P3-LENGTH-FOUR-EXACT");
});

test("the exact length-four OM path runs through Sage.js", () => {
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
  assert.equal(result.stdout.trim(), "P3-LENGTH-FOUR-SAGEJS");
});
