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
        "level_index_evidence": [
            [
                [level.index_contribution, level.optimized_away]
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
            .some(([index, optimized]) => index === 0 && optimized),
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
