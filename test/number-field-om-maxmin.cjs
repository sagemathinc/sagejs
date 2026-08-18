"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures/number-field-om-maxmin.json"), "utf8"),
);

const witness = String.raw`
import json
import sys
sys.path.append("${join(root, "src/lib")}")

from sagejs.number_fields.om_maxmin import (
    LocalNumeratorTable,
    maxmin_select,
    regular_local_basis,
)
from sagejs.number_fields.om_types import RationalValue, validate_type_tree

cases = ${JSON.stringify(fixture.cases)}
answer = []
for case in cases:
    polynomial_discriminant = abs(int(case["polynomial_discriminant"]))
    field_discriminant = abs(int(case["field_discriminant"]))
    def valuation(value, prime):
        result = 0
        while value % prime == 0:
            value //= prime
            result += 1
        return result
    result = regular_local_basis(
        tuple(case["polynomial"]),
        case["prime"],
        local_discriminant_valuation=case["local_discriminant_valuation"],
    )
    item = {
        "name": case["name"],
        "status": result.status,
        "tree_complete": result.type_tree.complete,
        "tree_valid": validate_type_tree(result.type_tree).valid,
        "certificate_id": result.type_tree.certificate_id,
        "index": result.type_tree.expected_index_valuation,
        "oracle_index": (
            valuation(polynomial_discriminant, case["prime"])
            - valuation(field_discriminant, case["prime"])
        ) // 2,
        "incomplete_states": list(result.type_tree.incomplete_states()),
        "auto_selectable": result.selector.auto_selectable,
        "recommendation": result.selector.recommendation,
        "type_depth": max([len(branch.levels) for branch in result.type_tree.types]),
        "residual_field_degrees": [
            len(branch.initial_factor) - 1 for branch in result.type_tree.types
        ],
        "representative_keys": [
            [list(level.key_polynomial) for level in branch.levels]
            for branch in result.type_tree.types
        ],
        "active_key_values": [
            list(level.key_value.to_pair())
            for level in result.type_tree.types[0].levels
            if not level.optimized_away
        ],
        "active_slopes": [
            list(level.slope.to_pair())
            for level in result.type_tree.types[0].levels
            if not level.optimized_away
        ],
        "branch_slopes": [
            [list(level.slope.to_pair()) for level in branch.levels]
            for branch in result.type_tree.types
        ],
        "level_index_evidence": [
            [
                [
                    level.index_contribution,
                    level.optimized_away,
                    level.index_evidence,
                ]
                for level in branch.levels
            ]
            for branch in result.type_tree.types
        ],
        "shared_result": result.local_result.to_dict(),
    }
    if result.certificate is not None:
        certificate = result.certificate
        item["basis"] = [
            {
                "numerator": list(element.numerator),
                "denominator_exponent": element.denominator_exponent,
            }
            for element in certificate.basis
        ]
        item["validation"] = {
            "valid": certificate.validation.valid,
            "contains_equation_order": certificate.validation.contains_equation_order,
            "multiplication_closed": certificate.validation.multiplication_closed,
            "local_index_matches": certificate.validation.local_index_matches,
            "locally_maximal": certificate.validation.locally_maximal,
        }
        item["common_denominator"] = certificate.common_denominator
        item["common_rows"] = [list(row) for row in certificate.common_denominator_numerators]
        item["maxmin_branch_count"] = len(certificate.maxmin.branch_order)
        item["maxmin_maximality_checked"] = certificate.maxmin.maximality_checked
        item["selection_kind"] = certificate.maxmin.selection_kind
        item["basis_kind"] = certificate.basis_kind
    answer.append(item)

zero = RationalValue(0)
half = RationalValue(1, 2)
tables = (
    LocalNumeratorTable(
        "A",
        ((1,), (0, 1), (1, 0, 1)),
        ((zero, zero), (half, zero), (None, zero)),
    ),
    LocalNumeratorTable(
        "B",
        ((1,), (1, 1)),
        ((zero, zero), (zero, None)),
    ),
)
selection = maxmin_select(tables)
generic = {
    "indices": [list(candidate.multi_index) for candidate in selection.candidates],
    "minimums": [list(candidate.minimum.to_pair()) for candidate in selection.candidates],
    "selected": [candidate.selected_branch for candidate in selection.candidates],
    "terminal": list(selection.terminal_multi_index),
    "maximality_checked": selection.maximality_checked,
    "failures": list(selection.maximality_failures),
}
print(json.dumps({"cases": answer, "generic_maxmin": generic}, sort_keys=True))
`;

function run(command, args, environment = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: witness,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
  );
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}

function checkWitness(output) {
  assert.equal(output.cases.length, fixture.cases.length);
  for (let index = 0; index < fixture.cases.length; index += 1) {
    const expected = fixture.cases[index];
    const actual = output.cases[index];
    assert.equal(actual.name, expected.name);
    assert.equal(actual.status, expected.expected_status);
    assert.equal(actual.index, expected.expected_index_valuation);
    assert.equal(actual.oracle_index, expected.expected_index_valuation);
    assert.equal(actual.tree_valid, true);
    assert.equal(actual.auto_selectable, false);
    assert.equal(actual.shared_result.algorithm, "om-maxmin");
    assert.match(actual.certificate_id, /^om2-[0-9a-f]{16}$/);
    assert.equal(actual.type_depth, expected.expected_type_depth);
    assert.equal(actual.shared_result.trace.length, expected.expected_type_count ?? 1);
    if (expected.expected_active_key_values !== undefined) {
      assert.deepEqual(
        actual.active_key_values,
        expected.expected_active_key_values,
      );
      assert.deepEqual(actual.active_slopes, expected.expected_active_slopes);
    }
    if (expected.expected_branch_slopes !== undefined) {
      assert.deepEqual(actual.branch_slopes, expected.expected_branch_slopes);
      assert.deepEqual(
        actual.level_index_evidence.map((branch) =>
          branch.map(([contribution]) => contribution),
        ),
        expected.expected_level_index_contributions,
      );
    }
    assert.ok(
      actual.residual_field_degrees.every(
        (degree) => degree === expected.expected_residual_field_degree,
      ),
    );
    if (expected.expected_status === "complete") {
      assert.equal(actual.tree_complete, true);
      assert.equal(actual.shared_result.state, "complete");
      assert.equal(
        actual.shared_result.index,
        expected.prime ** expected.expected_index_valuation,
      );
      assert.equal(actual.shared_result.evidence.locally_maximal, true);
      assert.equal(actual.shared_result.basis.canonical, false);
      assert.deepEqual(actual.basis, expected.expected_basis);
      assert.equal(actual.maxmin_branch_count, expected.expected_type_count ?? 1);
      assert.equal(actual.maxmin_maximality_checked, true);
      if (expected.expected_selection_kind !== undefined) {
        assert.equal(actual.selection_kind, expected.expected_selection_kind);
        assert.equal(actual.basis_kind, expected.expected_basis_kind);
      }
      assert.deepEqual(actual.validation, {
        valid: true,
        contains_equation_order: true,
        multiplication_closed: true,
        local_index_matches: true,
        locally_maximal: true,
      });
      if (expected.expected_type_depth > 1) {
        assert.ok(
          actual.representative_keys.some(
            (keys) =>
              keys.length > 1 &&
              JSON.stringify(keys[0]) !== JSON.stringify(keys.at(-1)),
          ),
        );
        assert.ok(
          actual.level_index_evidence
            .flat()
            .some(
              ([index, optimized, evidence]) =>
                (index === 0 && optimized) ||
                evidence.startsWith("gmn-theorem-3.3-quotient-index=") ||
                evidence.startsWith("gmn-terminal-side;"),
            ),
        );
      }
      assert.equal(
        actual.level_index_evidence
          .flat()
          .filter(([_index, optimized]) => !optimized)
          .reduce((sum, [index]) => sum + index, 0),
        expected.expected_index_valuation,
      );
    } else {
      assert.equal(actual.tree_complete, false);
      assert.equal(actual.shared_result.state, "not-applicable");
      assert.equal(actual.shared_result.basis, null);
      assert.ok(
        actual.incomplete_states.includes(expected.expected_incomplete_state),
      );
      assert.equal(actual.basis, undefined);
      assert.equal(actual.recommendation, "fallback");
    }
  }
  assert.deepEqual(output.generic_maxmin, {
    failures: [],
    indices: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    maximality_checked: true,
    minimums: [
      [0, 1],
      [0, 1],
      [1, 2],
    ],
    selected: [0, 1, 0],
    terminal: [2, 1],
  });
}

test("bounded OM/MaxMin agrees with frozen Sage/PARI-family fixtures in CPython", () => {
  const output = run("python3", ["-"]);
  checkWitness(output);
});

test("the same strict OM/MaxMin mathematics runs through Sage.js", () => {
  const output = run(process.execPath, [join(root, "bin/sagejs"), "--python"]);
  checkWitness(output);
});

test("certificate records are immutable under CPython and Sage.js", () => {
  const script = String.raw`
import sys
sys.path.append("${join(root, "src/lib")}")
from sagejs.number_fields.om_maxmin import regular_local_basis
r = regular_local_basis((-8, 0, 1), 2, local_discriminant_valuation=5)
try:
    r.type_tree.complete = False
except AttributeError:
    print("IMMUTABLE")
`;
  for (const [command, args] of [
    ["python3", ["-"]],
    [process.execPath, [join(root, "bin/sagejs"), "--python"]],
  ]) {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      input: script,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "IMMUTABLE");
  }
});

test("independent checking rejects a corrupted index and a composite modulus", () => {
  const script = String.raw`
import sys
sys.path.append("${join(root, "src/lib")}")
from sagejs.number_fields.om_maxmin import (
    TriangularBasisElement,
    regular_local_basis,
    validate_triangular_basis,
)
from sagejs.number_fields.om_types import OMDomainError, RationalValue, build_om_type_tree, validate_type_tree
r = regular_local_basis((-8, 0, 1), 2, local_discriminant_valuation=5)
bad = (
    r.certificate.basis[0],
    TriangularBasisElement(1, (0, 1), 0, 1, RationalValue(3, 2)),
)
validation = validate_triangular_basis((-8, 0, 1), 2, r.type_tree, bad, 1)
if validation.valid or validation.local_index_matches:
    raise AssertionError("corrupted local index was accepted")
bounded = build_om_type_tree((-12, 0, 1), 2, max_representative_refinements=0)
if bounded.complete or bounded.incomplete_states() != ("representative-refinement-bound",):
    raise AssertionError("representative work bound did not fail closed")
if not validate_type_tree(bounded).valid:
    raise AssertionError("the bounded incomplete certificate did not validate")
higher_bounded = build_om_type_tree((4, 4, 0, 0, 1), 2, max_type_depth=1)
if higher_bounded.complete or higher_bounded.incomplete_states() != ("type-depth-bound",):
    raise AssertionError("higher type work bound did not fail closed")
unsupported = build_om_type_tree(tuple([4, 8] + [0] * 6 + [1]), 2)
if unsupported.complete or unsupported.incomplete_states() != ("higher-residual-degree-unsupported",):
    raise AssertionError("unsupported higher residue was not rejected explicitly")
if not validate_type_tree(unsupported).valid:
    raise AssertionError("the unsupported higher certificate did not validate")
gmn_polynomial = (832, -256, -288, 256, -80, 128, 80, 32, 60, 0, 14, 0, 1)
gmn = regular_local_basis(
    gmn_polynomial,
    2,
    local_discriminant_valuation=97,
)
last = gmn.certificate.basis[-1]
corrupted_basis = gmn.certificate.basis[:-1] + (
    TriangularBasisElement(
        last.degree,
        last.numerator,
        last.denominator_exponent - 1,
        last.denominator // 2,
        RationalValue(last.denominator_exponent - 1),
    ),
)
gmn_validation = validate_triangular_basis(
    gmn_polynomial,
    2,
    gmn.type_tree,
    corrupted_basis,
    39,
)
if gmn_validation.valid or gmn_validation.local_index_matches:
    raise AssertionError("corrupted higher terminal quotient index was accepted")
tree = gmn.type_tree
corrupted_tree = type(tree)(
    tree.polynomial,
    tree.prime,
    tree.initial_factors,
    tree.types,
    tree.expected_index_valuation - 1,
    tree.complete,
    tree.precision,
    tree.max_enumerated_candidates,
    tree.max_representative_refinements,
    tree.max_type_depth,
    tree.certificate_id,
)
if validate_type_tree(corrupted_tree).valid:
    raise AssertionError("corrupted higher polygon index evidence was accepted")
try:
    build_om_type_tree((-8, 0, 1), 4)
except OMDomainError:
    print("REJECTED")
`;
  for (const [command, args] of [
    ["python3", ["-"]],
    [process.execPath, [join(root, "bin/sagejs"), "--python"]],
  ]) {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      input: script,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "REJECTED");
  }
});

test("the degree-16 deep-index family has a certified refined quotient basis", () => {
  const script = String.raw`
import json
import sys
sys.path.append("${join(root, "src/lib")}")
from sagejs.number_fields.om_maxmin import regular_local_basis
polynomial = tuple([-(3 * 2 ** 16)] + [0] * 15 + [1])
result = regular_local_basis(
    polynomial,
    2,
    local_discriminant_valuation=304,
)
if result.status != "complete" or result.certificate is None:
    raise AssertionError(result.reason)
print(json.dumps({
    "index": result.certificate.local_index_valuation,
    "denominators": [
        element.denominator_exponent for element in result.certificate.basis
    ],
    "depth": len(result.type_tree.types[0].levels),
    "valid": result.certificate.validation.valid,
}))
`;
  for (const [command, args] of [
    ["python3", ["-"]],
    [process.execPath, [join(root, "bin/sagejs"), "--python"]],
  ]) {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      input: script,
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim().split("\n").at(-1));
    assert.deepEqual(output, {
      index: 120,
      denominators: Array.from({ length: 16 }, (_value, index) => index),
      depth: 2,
      valid: true,
    });
  }
});

test("nonmonic residual polynomials use their monic associate", () => {
  const script = String.raw`
import json
import sys
sys.path.append("${join(root, "src/lib")}")
from sagejs.number_fields.om_maxmin import regular_local_basis
from sagejs.number_fields.om_types import build_om_type_tree, validate_type_tree
polynomial = (
    -18433878713, 23835146496, 46833416626, -91476357427,
    29078205681, 23102811288, -14798379535, 1922958558, -885599, 1,
)
expected = ((2, 9),)
answer = []
for prime, local_index in expected:
    tree = build_om_type_tree(polynomial, prime)
    if tree.expected_index_valuation != local_index or not validate_type_tree(tree).valid:
        raise AssertionError((prime, tree.expected_index_valuation))
    answer.append([prime, tree.complete, tree.expected_index_valuation])
rejected = regular_local_basis(
    polynomial,
    2,
    local_discriminant_valuation=18,
)
if rejected.status != "rejected" or rejected.certificate is None:
    raise AssertionError("the independently invalid quotient basis did not fail closed")
print(json.dumps(answer))
`;
  for (const [command, args] of [
    ["python3", ["-"]],
    [process.execPath, [join(root, "bin/sagejs"), "--python"]],
  ]) {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      input: script,
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim().split("\n").at(-1)), [
      [2, true, 9],
    ]);
  }
});

test("degree-one residual extensions use exact scalable factorization", () => {
  const script = String.raw`
import json
import sys
sys.path.append("${join(root, "src/lib")}")
from sagejs.number_fields.om_types import factor_residual_polynomial

residual = tuple((value,) for value in (4, 5, 2, 5, 5, 2, 1, 1, 4, 2, 1, 5, 1, 4, 2, 6, 1))
factors = factor_residual_polynomial(residual, 7, (0, 1))
print(json.dumps([
    [[coefficient[0] for coefficient in factor.polynomial], factor.multiplicity]
    for factor in factors
]))
`;
  const expected = [
    [[1, 1, 2, 0, 1], 1],
    [[1, 6, 1, 1, 1], 1],
    [[1, 2, 4, 2, 1], 1],
    [[4, 4, 5, 3, 1], 1],
  ];
  for (const [command, args] of [
    ["python3", ["-"]],
    [process.execPath, [join(root, "bin/sagejs"), "--python"]],
  ]) {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      input: script,
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim().split("\n").at(-1)), expected);
  }
});

test("OM stress matrix is stable under equivalent translated generators", () => {
  const script = String.raw`
import json
import sys
sys.path.append("${join(root, "src/lib")}")
from sagejs.number_fields.om_maxmin import regular_local_basis

def binomial(n, k):
    answer = 1
    for index in range(1, k + 1):
        answer = answer * (n - k + index) // index
    return answer

def translate(polynomial, offset):
    answer = [0] * len(polynomial)
    for degree, coefficient in enumerate(polynomial):
        for target in range(degree + 1):
            answer[target] += (
                coefficient
                * binomial(degree, target)
                * offset ** (degree - target)
            )
    return tuple(answer)

families = (
    (
        (832, -256, -288, 256, -80, 128, 80, 32, 60, 0, 14, 0, 1),
        97,
        39,
        tuple(range(-3, 4)),
        "gmn-terminal-quotients",
    ),
    (
        tuple([-(3 * 2 ** 16)] + [0] * 15 + [1]),
        304,
        120,
        (-1, 0, 1),
        None,
    ),
)
answer = []
for polynomial, discriminant_valuation, expected_index, offsets, selection_kind in families:
    identifiers = []
    for offset in offsets:
        result = regular_local_basis(
            translate(polynomial, offset),
            2,
            local_discriminant_valuation=discriminant_valuation,
            differential_evidence=selection_kind is not None,
        )
        if result.status != "complete" or result.certificate is None:
            raise AssertionError((offset, result.reason))
        if (
            result.certificate.local_index_valuation != expected_index
            or not result.certificate.validation.valid
            or result.selector.auto_selectable
        ):
            raise AssertionError((offset, result.certificate.validation))
        if (
            selection_kind is not None
            and result.certificate.maxmin.selection_kind != selection_kind
        ):
            raise AssertionError((offset, result.certificate.maxmin.selection_kind))
        identifiers.append(result.type_tree.certificate_id)
    if len(set(identifiers)) != len(identifiers):
        raise AssertionError("translated generators reused a type certificate")
    answer.append([len(offsets), expected_index])
print(json.dumps(answer))
`;
  for (const [command, args] of [
    ["python3", ["-"]],
    [process.execPath, [join(root, "bin/sagejs"), "--python"]],
  ]) {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      input: script,
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim().split("\n").at(-1)), [
      [7, 39],
      [3, 120],
    ]);
  }
});

test("scalable bad generators factor quickly and fail closed without MaxMin proof", () => {
  const script = String.raw`
import json
import sys
sys.path.append("${join(root, "src/lib")}")
from sagejs.number_fields.om_maxmin import regular_local_basis

def bad_generator_polynomial(degree, coefficient):
    previous = [2]
    current = [-1]
    for _index in range(2, degree + 1):
        following = [0] * max(len(current), len(previous) + 1)
        for index in range(len(current)):
            following[index] -= current[index]
        for index in range(len(previous)):
            following[index + 1] += coefficient * previous[index]
        previous, current = current, following
    answer = [-2 * value for value in current]
    answer[0] += 4 * coefficient ** degree
    answer.extend([0] * (degree + 1 - len(answer)))
    answer[degree] += 1
    return tuple(answer)

polynomial = bad_generator_polynomial(32, 1009)
regular = regular_local_basis(
    polynomial,
    2,
    local_discriminant_valuation=191,
)
ramified = regular_local_basis(
    polynomial,
    7,
    local_discriminant_valuation=4,
)
if regular.status != "complete" or regular.certificate is None:
    raise AssertionError(regular.reason)
if regular.type_tree.expected_index_valuation != 0:
    raise AssertionError("the pure-field equation order must be 2-maximal")
if (
    ramified.status != "incomplete"
    or not ramified.type_tree.complete
    or ramified.certificate is None
    or not ramified.certificate.validation.valid
    or ramified.certificate.maxmin.maximality_checked
    or ramified.order_basis is not None
    or ramified.local_result.state != "not-applicable"
):
    raise AssertionError(ramified.reason)
print(json.dumps([
    len(ramified.type_tree.types),
    ramified.type_tree.expected_index_valuation,
    list(ramified.certificate.maxmin.maximality_failures),
]))
`;
  for (const [command, args] of [
    ["python3", ["-"]],
    [process.execPath, [join(root, "bin/sagejs"), "--python"]],
  ]) {
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      input: script,
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim().split("\n").at(-1)), [
      13,
      2,
      ["MaxMin exhaustive validation bound exceeded"],
    ]);
  }
});
