// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const fixtures = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-buchmann-lenstra.json"),
    "utf8",
  ),
);

const source = String.raw`
import json
import random
import sys

sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
import sagejs.number_fields.buchmann_lenstra as bl
from sagejs.native import (
    execution_mode,
    is_native,
    kernel_integer_buffer,
    kernel_integer_zeros,
)
from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent, OrderBasis

fixtures = json.loads(${JSON.stringify(JSON.stringify(fixtures))})

random.seed(20260818)
hnf_controls = []
for rows, columns in ((2, 2), (4, 2), (6, 3), (8, 4), (16, 8)):
    for sample in range(5):
        matrix = [
            [random.randint(-1000, 1000) for _column in range(columns)]
            for _row in range(rows)
        ]
        for diagonal in range(columns):
            matrix[diagonal][diagonal] += 100000
        reference = bl._row_hnf(matrix)
        packed = bl._packed_row_hnf(matrix)
        assert packed == reference
        hnf_controls.append([rows, columns, reference])

large_degree = 90
large_identity = [
    [1 if row == column else 0 for column in range(large_degree)]
    for row in range(large_degree)
]
large_rows = large_identity + [
    [2 * value for value in row] for row in large_identity
]
assert bl._packed_row_hnf(large_rows, 2) == large_identity

case = fixtures["t8_2pow32"]
coefficients = [int(value) for value in case["coefficients_low_to_high"]]
modulus = int(case["reduced_resultant_component"])
component = DiscriminantComponent(modulus, "unresolved-coprime-component")
data = bl._composite_dedekind_data(coefficients, modulus)
reference_data = bl._composite_dedekind_data_reference(coefficients, modulus)
assert data["status"] == "enlarge"
for key in (
    "repeated_gcd",
    "squarefree_quotient",
    "correction",
    "obstruction",
    "generator",
):
    assert data[key] == reference_data[key]
multiplication = bl._multiplication_rows(data["generator"], coefficients)
generators = [
    [modulus if row == column else 0 for column in range(8)]
    for row in range(8)
] + multiplication
reference_t8_hnf = bl._row_hnf(generators)
packed_t8_hnf = bl._packed_row_hnf(generators, modulus)
assert packed_t8_hnf == reference_t8_hnf
assert data["packed_hnf"] == reference_t8_hnf

malformed_metadata = kernel_integer_zeros(
    bl.packed_composite_dedekind_basis_in_place, 6, 4
)
assert not bl.packed_composite_dedekind_basis_in_place(
    malformed_metadata,
    kernel_integer_zeros(bl.packed_composite_dedekind_basis_in_place, 1),
    kernel_integer_zeros(bl.packed_composite_dedekind_basis_in_place, 1),
    kernel_integer_zeros(bl.packed_composite_dedekind_basis_in_place, 1),
    kernel_integer_zeros(bl.packed_composite_dedekind_basis_in_place, 1),
    kernel_integer_zeros(bl.packed_composite_dedekind_basis_in_place, 1),
    kernel_integer_zeros(bl.packed_composite_dedekind_basis_in_place, 1),
    kernel_integer_buffer(
        bl.packed_composite_dedekind_basis_in_place, coefficients
    ),
    modulus,
    8,
)

result = bl.buchmann_lenstra_overorder(coefficients, component)
assert result.state == "complete"
assert result.index == int(case["expected_index"])
assert result.discriminant == int(case["expected_discriminant"])
assert result.basis is not None
assert result.basis.numerator == packed_t8_hnf
assert bl.check_buchmann_lenstra_result(coefficients, result)

saved_generator = list(result.evidence["overorder_generator"])
result.evidence["overorder_generator"] = list(saved_generator)
result.evidence["overorder_generator"][0] += 1
assert not bl.check_buchmann_lenstra_result(coefficients, result)
result.evidence["overorder_generator"] = saved_generator

saved_basis = result.basis
bad_rows = [list(row) for row in saved_basis.numerator]
bad_rows[0][0] += 1
result.basis = OrderBasis(bad_rows, saved_basis.denominator, canonical=True)
assert not bl.check_buchmann_lenstra_result(coefficients, result)
result.basis = saved_basis

saved_index = result.index
result.index = saved_index + 1
assert not bl.check_buchmann_lenstra_result(coefficients, result)
result.index = saved_index

saved_discriminant = result.discriminant
result.discriminant = saved_discriminant + 1
assert not bl.check_buchmann_lenstra_result(coefficients, result)
result.discriminant = saved_discriminant

saved_component = result.component
result.component = DiscriminantComponent(modulus + 2, "composite")
assert not bl.check_buchmann_lenstra_result(coefficients, result)
result.component = saved_component
assert bl.check_buchmann_lenstra_result(coefficients, result)

split_case = fixtures["zero_divisor"]
split = bl.polynomial_gcd_with_split(
    [int(value) for value in split_case["left"]],
    [int(value) for value in split_case["right"]],
    int(split_case["modulus"]),
)
assert split["status"] == "split"

print(json.dumps({
    "hnf_controls": hnf_controls,
    "t8_hnf": packed_t8_hnf,
    "index": str(result.index),
    "discriminant": str(result.discriminant),
    "split": split["split"].to_dict(),
    "native_marked": is_native(bl.packed_row_hnf_in_place),
    "execution_mode": execution_mode(bl.packed_row_hnf_in_place),
    "fused_native_marked": is_native(
        bl.packed_composite_dedekind_basis_in_place
    ),
    "fused_execution_mode": execution_mode(
        bl.packed_composite_dedekind_basis_in_place
    ),
}, sort_keys=True))
`;

function run(command, args, environment = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: source,
    timeout: 120_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || result.error?.message,
  );
  return JSON.parse(result.stdout.trim());
}

test("packed BL HNF agrees exactly and rejects corrupted T8 evidence", () => {
  const python = run(pythonExecutable(), ["-c", source]);
  const sagejs = run(process.execPath, [
    join(root, "bin", "sagejs"),
    "--python",
    "-",
  ]);
  assert.equal(python.native_marked, true);
  assert.equal(sagejs.native_marked, true);
  assert.equal(python.fused_native_marked, true);
  assert.equal(sagejs.fused_native_marked, true);
  assert.match(sagejs.execution_mode, /^(dynamic|native-capable|compiled)$/);
  assert.match(
    sagejs.fused_execution_mode,
    /^(dynamic|native-capable|compiled)$/,
  );
  delete python.execution_mode;
  delete sagejs.execution_mode;
  delete python.fused_execution_mode;
  delete sagejs.fused_execution_mode;
  assert.deepEqual(sagejs, python);
});
