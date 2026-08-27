// sagejs-test-tier: integration
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
from sagejs.number_fields.bl_composite_kernel import (
    packed_known_overorder_contains_vectors_in_place,
)
from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent

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
known_overorder = packed_known_overorder_contains_vectors_in_place
known_overorder_dynamic = getattr(
    known_overorder, "__sagejs_native_source__", known_overorder
)
workspace_words = bl._packed_direct_membership_word_capacity(basis, vectors)
known_magnitude_bits = max(
    [abs(basis.denominator).bit_length()]
    + [abs(value).bit_length() for row in basis.numerator for value in row]
    + [abs(value).bit_length() for row in vectors for value in row]
)
known_workspace_words = max(
    16, (2 * known_magnitude_bits + 63) // 64 + 4 * basis.degree + 8
)

def call(function, rows, row_denominators, numerator=None, word_capacity=None):
    if numerator is None:
        numerator = basis.numerator
    if word_capacity is None:
        word_capacity = workspace_words
    return bool(function(
        kernel_integer_zeros(function, basis.degree * basis.degree, word_capacity),
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
assert call(known_overorder, vectors, denominators, word_capacity=known_workspace_words)
assert call(
    known_overorder_dynamic,
    vectors,
    denominators,
    word_capacity=known_workspace_words,
)
assert not call(
    known_overorder,
    bad_square,
    denominators,
    word_capacity=known_workspace_words,
)
assert not call(
    known_overorder_dynamic,
    bad_square,
    denominators,
    word_capacity=known_workspace_words,
)

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

source_component = modulus * modulus
component = DiscriminantComponent(
    modulus,
    "composite",
    evidence={"source_component": source_component},
)
result = bl.buchmann_lenstra_overorder(coefficients, component)
projection = bl.authenticate_buchmann_lenstra_result(coefficients, result)
assert projection is not None and projection.certified
assert projection.proof_schema == bl.AUTHENTICATED_BUCHMANN_LENSTRA_SCHEMA
assert projection.support == modulus
assert projection.source_component_value == source_component
assert bl.authenticated_buchmann_lenstra_projection_matches(
    projection,
    polynomial=coefficients,
    support=modulus,
    source_component_value=source_component,
    component_state=component.state,
    basis_numerator=result.basis.numerator,
    basis_denominator=result.basis.denominator,
    index=result.index,
    equation_discriminant=projection.equation_discriminant,
    order_discriminant=result.discriminant,
)
assert not bl.authenticated_buchmann_lenstra_projection_matches(
    projection,
    polynomial=coefficients,
    support=modulus,
    source_component_value=source_component + 1,
)
try:
    projection.index += 1
    assert False
except AttributeError:
    pass

saved_stage = result.evidence["stage"]
result.evidence["stage"] = "corrupted"
assert not projection.certified
assert not bl.authenticated_buchmann_lenstra_projection_matches(
    projection,
    polynomial=coefficients,
    support=modulus,
    source_component_value=source_component,
)
result.evidence["stage"] = saved_stage
assert projection.certified

result.component.evidence["source_component"] = source_component + 1
assert not projection.certified
result.component.evidence["source_component"] = source_component
assert projection.certified

saved_basis_entry = result.basis.numerator[0][1]
result.basis.numerator[0][1] += 1
assert not projection.certified
result.basis.numerator[0][1] = saved_basis_entry
assert projection.certified

print(execution_mode(packed), execution_mode(known_overorder))
None
`;
    const result = await session.evaluate(source);
    assert.equal(result.stderr ?? "", "");
    assert.match(
      result.stdout.trim(),
      /^(native-capable|compiled) (native-capable|compiled)$/,
    );
  } finally {
    await session.close();
  }
});
