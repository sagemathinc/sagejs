"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const vector429 = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures/number-field-maximal-order-corpus.json"),
    "utf8",
  ),
).cases.find((item) => item.id === "pari-round4-vector-429");

const witness = String.raw`
import json
import sys
sys.path.append("${join(root, "src/lib")}")

from sagejs.native import is_compiled
from sagejs.number_fields.om_authenticated_projection import (
    AuthenticatedOMTreeProjection,
    authenticate_first_order_om_type_tree,
    authenticated_om_tree_projection_matches,
    validate_triangular_basis_with_authenticated_tree,
)
from sagejs.number_fields.om_maxmin import (
    _basis_coordinates_are_integral,
    packed_maxmin_valuations_are_maximal,
    packed_triangular_basis_is_closed,
    regular_local_basis,
)
from sagejs.number_fields.om_types import (
    _certificate_text,
    build_om_type_tree,
    stable_certificate_id,
)

def replace(record, **changes):
    fields = {
        name: getattr(record, name)
        for name in type(record).__annotations__
    }
    fields.update(changes)
    return type(record)(**fields)

def reseal(tree):
    text = _certificate_text(
        tree.polynomial,
        tree.prime,
        tree.initial_factors,
        tree.types,
        tree.expected_index_valuation,
        tree.max_enumerated_candidates,
        tree.max_representative_refinements,
        tree.max_type_depth,
    )
    return replace(tree, certificate_id=stable_certificate_id(text))

def replace_level(tree, branch_index, level_index, level):
    branches = list(tree.types)
    levels = list(branches[branch_index].levels)
    levels[level_index] = level
    branches[branch_index] = replace(branches[branch_index], levels=tuple(levels))
    return reseal(replace(tree, types=tuple(branches)))

def rejected(tree):
    return authenticate_first_order_om_type_tree(tree) is None

# A shallow ramified family supplies inexpensive relation-level corruptions.
small_polynomial = tuple([-512] + [0] * 7 + [1])
small = build_om_type_tree(small_polynomial, 2)
small_projection = authenticate_first_order_om_type_tree(small)
if small_projection is None:
    raise AssertionError("the shallow first-order tree was not authenticated")
branch = small.types[0]
level = branch.levels[-1]
corruptions = {}
corruptions["source-polynomial"] = rejected(
    reseal(replace(small, polynomial=(small.polynomial[0] + 2,) + small.polynomial[1:]))
)
factor = small.initial_factors[0]
corruptions["initial-factor-multiplicity"] = rejected(
    reseal(replace(small, initial_factors=(replace(factor, multiplicity=factor.multiplicity - 1),)))
)
bad_key = (level.key_polynomial[0] + small.prime,) + level.key_polynomial[1:]
corruptions["predecessor-key"] = rejected(
    replace_level(small, 0, len(branch.levels) - 1, replace(level, key_polynomial=bad_key))
)
corruptions["slope"] = rejected(
    replace_level(small, 0, len(branch.levels) - 1, replace(level, slope=-level.slope))
)
residual_factor = list(level.residual_factor)
first_coefficient = list(residual_factor[0])
first_coefficient[0] = (first_coefficient[0] + 1) % small.prime
residual_factor[0] = tuple(first_coefficient)
corruptions["residual-factor"] = rejected(
    replace_level(
        small,
        0,
        len(branch.levels) - 1,
        replace(level, residual_factor=tuple(residual_factor)),
    )
)
corruptions["side-index"] = rejected(
    replace_level(
        reseal(replace(small, expected_index_valuation=small.expected_index_valuation + 1)),
        0,
        len(branch.levels) - 1,
        replace(level, index_contribution=level.index_contribution + 1),
    )
)
branches = list(small.types)
branches[0] = replace(branch, branch_degree=branch.branch_degree - 1)
corruptions["local-degree"] = rejected(reseal(replace(small, types=tuple(branches))))
corruptions["precision"] = rejected(
    reseal(replace(small, precision=small.precision + 1))
)
corruptions["completeness"] = rejected(
    reseal(replace(small, complete=False))
)
corruptions["certificate-id"] = rejected(
    replace(small, certificate_id="om2-0000000000000000")
)

# Same-degree representative updates are checked from the retained predecessor.
optimized_polynomial = tuple([-768] + [0] * 7 + [1])
optimized = build_om_type_tree(optimized_polynomial, 2)
optimized_projection = authenticate_first_order_om_type_tree(optimized)
if optimized_projection is None:
    raise AssertionError("the optimized first-order tree was not authenticated")
optimized_branch = optimized.types[0]
optimized_level = next(
    level for level in optimized_branch.levels if level.optimized_away
)
optimized_index = optimized_branch.levels.index(optimized_level)
corruptions["representative-update"] = rejected(
    replace_level(
        optimized,
        0,
        optimized_index,
        replace(optimized_level, representative_step=optimized_level.representative_step + 1),
    )
)

# Higher types remain on the established reconstruction fallback.
deep = build_om_type_tree((4, 4, 0, 0, 1), 2)
deep_falls_back = authenticate_first_order_om_type_tree(deep) is None

# A live seal invalidates after source or projection mutation.
saved_precision = small.precision
small.__dict__["precision"] = saved_precision + 1
source_mutation_rejected = not small_projection.certified
small.__dict__["precision"] = saved_precision
projection_restored = small_projection.certified
small_projection.__dict__["precision"] = saved_precision + 1
projection_mutation_rejected = not small_projection.certified
constructor_rejected = False
try:
    AuthenticatedOMTreeProjection(object(), small)
except TypeError:
    constructor_rejected = True

# The production target: exact vector429 p=7 tree, basis, and frozen PARI HNF.
case = json.loads(r'''${JSON.stringify(vector429)}''')
polynomial = tuple(int(value) for value in case["polynomial"]["coefficients"])
result = regular_local_basis(
    polynomial,
    7,
    local_discriminant_valuation=1008,
    differential_evidence=True,
)
if result.status != "complete" or result.certificate is None:
    raise AssertionError(result.reason)
projection = authenticate_first_order_om_type_tree(result.type_tree)
if projection is None:
    raise AssertionError("vector429 p=7 did not satisfy the retained theorem")
authenticated_validation = validate_triangular_basis_with_authenticated_tree(
    polynomial,
    7,
    projection,
    result.certificate.basis,
    result.type_tree.expected_index_valuation,
)
external_denominator = int(case["basis"]["denominator"])
external_exponent = 0
while external_denominator % 7 == 0:
    external_denominator //= 7
    external_exponent += 1
primary_denominator = 7 ** external_exponent
external_rows = [
    [int(value) % primary_denominator for value in row]
    for row in case["basis"]["numerator"]
]
external_contained = all(
    _basis_coordinates_are_integral(
        tuple(row), primary_denominator, result.certificate.basis
    )
    for row in external_rows
)
expected_index = next(
    int(item["valuation"])
    for item in case["localIndexFactors"]
    if int(item["value"]) == 7
)
bad_basis = list(result.certificate.basis)
bad_basis[1] = replace(
    bad_basis[1], denominator_exponent=bad_basis[1].denominator_exponent + 1
)
bad_validation = validate_triangular_basis_with_authenticated_tree(
    polynomial,
    7,
    projection,
    tuple(bad_basis),
    result.type_tree.expected_index_valuation,
)

print(json.dumps({
    "small_certified": projection_restored,
    "optimized_depth": len(optimized_branch.levels),
    "corruptions": corruptions,
    "deep_falls_back": deep_falls_back,
    "source_mutation_rejected": source_mutation_rejected,
    "projection_mutation_rejected": projection_mutation_rejected,
    "constructor_rejected": constructor_rejected,
    "vector429": {
        "certified": projection.certified,
        "matches": authenticated_om_tree_projection_matches(
            projection,
            tree=result.type_tree,
            polynomial=polynomial,
            prime=7,
            expected_index_valuation=480,
        ),
        "index": result.certificate.local_index_valuation,
        "expected_index": expected_index,
        "validation": authenticated_validation.valid,
        "same_validation": authenticated_validation == result.certificate.validation,
        "primary_denominator": primary_denominator,
        "frozen_hnf_contained": external_contained,
        "bad_basis_rejected": not bad_validation.valid,
        "certificate_id": projection.certificate_id,
        "maxmin_native": is_compiled(packed_maxmin_valuations_are_maximal),
        "closure_native": is_compiled(packed_triangular_basis_is_closed),
    },
}, sort_keys=True))
`;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: witness,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180_000,
  });
  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
  );
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}

function check(output) {
  assert.equal(output.small_certified, true);
  assert.ok(output.optimized_depth > 1);
  assert.ok(Object.values(output.corruptions).every(Boolean));
  assert.equal(output.deep_falls_back, true);
  assert.equal(output.source_mutation_rejected, true);
  assert.equal(output.projection_mutation_rejected, true);
  assert.equal(output.constructor_rejected, true);
  assert.equal(output.vector429.certified, true);
  assert.equal(output.vector429.matches, true);
  assert.equal(output.vector429.index, 480);
  assert.equal(output.vector429.expected_index, 480);
  assert.equal(output.vector429.validation, true);
  assert.equal(output.vector429.same_validation, true);
  assert.equal(output.vector429.frozen_hnf_contained, true);
  assert.equal(output.vector429.bad_basis_rejected, true);
  assert.match(output.vector429.certificate_id, /^om2-[0-9a-f]{16}$/);
}

test("CPython authenticates retained OM relations and the frozen p=7 HNF", () => {
  check(run("python3", ["-"]));
});

test("Sage.js authenticates retained OM relations with production proof kernels", () => {
  const output = run(process.execPath, [join(root, "bin/sagejs"), "--python"]);
  check(output);
  assert.equal(output.vector429.maxmin_native, true);
  assert.equal(output.vector429.closure_native, true);
});
