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
        "incomplete_states": list(result.type_tree.incomplete_states()),
        "auto_selectable": result.selector.auto_selectable,
        "recommendation": result.selector.recommendation,
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
    assert.equal(actual.tree_valid, true);
    assert.equal(actual.auto_selectable, false);
    assert.equal(actual.shared_result.algorithm, "om-maxmin");
    assert.match(actual.certificate_id, /^om1-[0-9a-f]{16}$/);
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
      assert.deepEqual(actual.validation, {
        valid: true,
        contains_equation_order: true,
        multiplication_closed: true,
        local_index_matches: true,
        locally_maximal: true,
      });
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
from sagejs.number_fields.om_types import OMDomainError, RationalValue, build_first_order_type_tree
r = regular_local_basis((-8, 0, 1), 2, local_discriminant_valuation=5)
bad = (
    r.certificate.basis[0],
    TriangularBasisElement(1, (0, 1), 0, 1, RationalValue(3, 2)),
)
validation = validate_triangular_basis((-8, 0, 1), 2, r.type_tree, bad, 1)
if validation.valid or validation.local_index_matches:
    raise AssertionError("corrupted local index was accepted")
try:
    build_first_order_type_tree((-8, 0, 1), 4)
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
