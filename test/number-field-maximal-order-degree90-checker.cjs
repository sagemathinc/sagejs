"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const fixtures = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-buchmann-lenstra.json"),
    "utf8",
  ),
);
const t8 = fixtures.t8_2pow32;

test("batched BL membership retains the ordinary Python fallback", () => {
  const source = String.raw`
import sys
sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.native import execution_mode, kernel_integer_buffer, kernel_integer_zeros
from sagejs.number_fields.bl_composite_kernel import packed_order_contains_vectors_in_place

function = packed_order_contains_vectors_in_place
def call(denominators):
    return function(
        kernel_integer_zeros(function, 4, 8),
        kernel_integer_buffer(function, [1, 0, 0, 1]),
        kernel_integer_buffer(function, [3, 4, 6, 8]),
        kernel_integer_buffer(function, denominators),
        1,
        2,
        2,
    )

assert call([1, 2])
assert not call([1, 3])
assert not call([1, 0])
assert execution_mode(function) == "dynamic"
`;
  const result = spawnSync(pythonExecutable(), ["-c", source], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("batched BL membership agrees with its dynamic source and fails closed", async () => {
  const session = await createSage();
  try {
    const source = String.raw`
from sagejs.native import execution_mode, kernel_integer_buffer, kernel_integer_zeros
from sagejs.number_fields import buchmann_lenstra as bl

coefficients = [${t8.coefficients_low_to_high.join(",")}]
modulus = ${t8.reduced_resultant_component}
data = bl._composite_dedekind_data(coefficients, modulus)
assert data["status"] == "enlarge"
basis, index = bl._dedekind_overorder_basis(
    coefficients,
    modulus,
    data["generator"],
    data["packed_hnf"],
)
assert index == ${t8.expected_index}

multiplication = bl._multiplication_rows(data["generator"], coefficients)
multiplication = multiplication[:len(data["obstruction"]) - 1]
square = bl._reduce_power_polynomial(
    bl._multiply(data["generator"], data["generator"]), coefficients
)
vectors = multiplication + [square]
denominators = [modulus for _row in multiplication] + [modulus * modulus]
packed = bl.packed_order_contains_vectors_in_place
dynamic = getattr(packed, "__sagejs_native_source__", packed)
workspace_words, _output_words = bl._packed_order_table_word_capacities(
    coefficients, basis
)

def call(function, rows, row_denominators, numerator=None):
    if numerator is None:
        numerator = basis.numerator
    return bool(function(
        kernel_integer_zeros(function, basis.degree * basis.degree, workspace_words),
        kernel_integer_buffer(
            function, [value for row in numerator for value in row]
        ),
        kernel_integer_buffer(function, [value for row in rows for value in row]),
        kernel_integer_buffer(function, row_denominators),
        basis.denominator,
        basis.degree,
        len(rows),
    ))

assert call(packed, vectors, denominators)
assert call(dynamic, vectors, denominators)
assert bl._dedekind_generator_lattice_is_order_reference(
    coefficients, modulus, data["generator"], basis
)
assert bl._dedekind_generator_lattice_is_order(
    coefficients, modulus, data["obstruction"], data["generator"], basis
)

bad_square = [list(row) for row in vectors]
bad_square[-1][0] += 1
assert not call(packed, bad_square, denominators)
assert not call(dynamic, bad_square, denominators)

bad_denominators = list(denominators)
bad_denominators[-1] = 0
assert not call(packed, vectors, bad_denominators)
assert not call(dynamic, vectors, bad_denominators)

bad_numerator = [list(row) for row in basis.numerator]
bad_numerator[0][1] += 1
assert call(packed, vectors, denominators, bad_numerator) == call(
    dynamic, vectors, denominators, bad_numerator
)
assert not call(packed, vectors, denominators, bad_numerator)

print(execution_mode(packed))
None
`;
    const result = await session.evaluate(source);
    assert.equal(result.stderr ?? "", "");
    assert.match(result.stdout.trim(), /^(native-capable|compiled)$/);
  } finally {
    await session.close();
  }
});
