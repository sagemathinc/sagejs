#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");

function run(executable, args, source, timeout = 120_000) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const kernelDifferential = String.raw`
from sagejs.native import kernel_integer_buffer
from sagejs.number_fields.bl_composite_kernel import packed_cubic_norm_form_target_slice

packed = packed_cubic_norm_form_target_slice
dynamic = getattr(packed, "__sagejs_native_source__", packed)
coefficients = [170, 5745, 18000, 1585, 2345, 5115, 25215, 11100, 36900, 15075]

for function in (dynamic, packed):
    values = kernel_integer_buffer(function, coefficients)
    assert function(values, 19, 0, 19, 5, 14) == 1
    assert function(values, 19, 0, 19, 0, 0) == 2
    assert function(values, 19, 7, 7, 5, 14) == 1
    assert function(values, 1, 0, 1, 0, 0) == 0
    assert function(values, 19, 8, 7, 5, 14) == 0
`;

const relationSieveDifferential = String.raw`
from sagejs.native import integer_buffer_values, kernel_integer_buffer, kernel_integer_zeros
from sagejs.number_fields.bl_composite_kernel import packed_cubic_norm_smooth_candidates_in_place, packed_cubic_order_norm_form_coefficients_in_place, packed_factor_base_rows_in_place

coefficient_packed = packed_cubic_order_norm_form_coefficients_in_place
coefficient_dynamic = getattr(coefficient_packed, "__sagejs_native_source__", coefficient_packed)
candidate_packed = packed_cubic_norm_smooth_candidates_in_place
candidate_dynamic = getattr(candidate_packed, "__sagejs_native_source__", candidate_packed)
row_packed = packed_factor_base_rows_in_place
row_dynamic = getattr(row_packed, "__sagejs_native_source__", row_packed)
norm_form = [1, 12, 144, 7, 13, -9, 75, 12, 180, -9]
multiplication_table = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 9, 15, -5, 12, 24, -8, 0, 0, 1, 12, 24, -8, 12, 36, -11]

for function in (coefficient_dynamic, coefficient_packed):
    output = kernel_integer_zeros(function, 10, 16)
    assert function(output, kernel_integer_buffer(function, multiplication_table))
    assert tuple(integer_buffer_values(output)) == tuple(norm_form)
    assert not function(
        kernel_integer_zeros(function, 9, 16),
        kernel_integer_buffer(function, multiplication_table),
    )

for function in (candidate_dynamic, candidate_packed):
    metadata = kernel_integer_zeros(function, 4, 1)
    coefficients = kernel_integer_zeros(function, 128 * 3, 16)
    norms = kernel_integer_zeros(function, 128, 16)
    assert function(
        metadata,
        coefficients,
        norms,
        kernel_integer_buffer(function, norm_form),
        kernel_integer_buffer(function, [2, 3, 5]),
        2,
        128,
    )
    assert tuple(integer_buffer_values(metadata)) == (23, 62, 0, 2)
    widened_metadata = kernel_integer_zeros(function, 4, 1)
    widened_coefficients = kernel_integer_zeros(function, 128 * 3, 16)
    widened_norms = kernel_integer_zeros(function, 128, 16)
    assert function(
        widened_metadata,
        widened_coefficients,
        widened_norms,
        kernel_integer_buffer(function, norm_form),
        kernel_integer_buffer(function, [2, 3, 5]),
        3,
        128,
    )
    assert tuple(integer_buffer_values(widened_metadata)) == (50, 171, 0, 3)
    largest_metadata = kernel_integer_zeros(function, 4, 1)
    largest_coefficients = kernel_integer_zeros(function, 128 * 3, 16)
    largest_norms = kernel_integer_zeros(function, 128, 16)
    assert function(
        largest_metadata,
        largest_coefficients,
        largest_norms,
        kernel_integer_buffer(function, norm_form),
        kernel_integer_buffer(function, [2, 3, 5]),
        4,
        128,
    )
    assert tuple(integer_buffer_values(largest_metadata)) == (86, 364, 0, 4)

for function in (row_dynamic, row_packed):
    metadata = kernel_integer_zeros(function, 3, 1)
    rows = kernel_integer_zeros(function, 4, 4)
    smooth = kernel_integer_zeros(function, 2, 1)
    assert function(
        metadata,
        rows,
        smooth,
        kernel_integer_zeros(function, 2, 4),
        kernel_integer_buffer(function, [2, 3]),
        kernel_integer_buffer(function, [2, 3]),
        kernel_integer_buffer(function, [1]),
        kernel_integer_buffer(function, [2, 3]),
        kernel_integer_buffer(function, [1, 1]),
        kernel_integer_buffer(function, [0, 1, 2]),
        kernel_integer_buffer(function, [2, 3]),
        1,
        1,
        2,
        2,
        2,
    )
    assert tuple(integer_buffer_values(metadata)) == (2, 2, 2)
    assert tuple(integer_buffer_values(rows)) == (1, 0, 0, 1)
    assert tuple(integer_buffer_values(smooth)) == (1, 1)
`;

const cubicFactorDifferential = String.raw`
from sagejs.number_fields import prime_ideals

samples = (
    (-12, -6, -1, 1),
    (1, 2, 0, 1),
    (-1, -1, 0, 1),
    (-2, 0, 0, 1),
    (1, -3, 0, 1),
)
for coefficients in samples:
    for prime in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31):
        assert prime_ideals._om.factor_cubic_mod_prime(
            coefficients, prime
        ) == prime_ideals._om.factor_mod_prime(coefficients, prime)
`;

test("packed cubic norm obstruction matches ordinary Python", () => {
  run(
    pythonExecutable(),
    [
      "-c",
      `import sys; sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})\n${kernelDifferential}`,
    ],
    "",
  );
  const output = run(
    sagejs,
    ["--python", "-"],
    `${kernelDifferential}\nfrom sagejs.native import is_compiled\nprint(is_compiled(packed))\n`,
  );
  assert.equal(output, "True");
});

test("packed cubic integral relation sieve matches ordinary Python", () => {
  run(
    pythonExecutable(),
    [
      "-c",
      `import sys; sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})\n${relationSieveDifferential}`,
    ],
    "",
  );
  const output = run(
    sagejs,
    ["--python", "-"],
    `${relationSieveDifferential}\nfrom sagejs.native import is_compiled\nprint(is_compiled(coefficient_packed), is_compiled(candidate_packed), is_compiled(row_packed))\n`,
  );
  assert.equal(output, "True True True");
});

test("bounded cubic factorization matches the generic modular oracle", () => {
  run(sagejs, ["--python", "-"], cubicFactorDifferential);
});

test("cubic class-number obstruction agrees with the readable search", () => {
  const output = run(
    sagejs,
    ["--python", "-"],
    String.raw`
import sagejs.number_fields.cubic_class_number as cubic
from sagejs.number_fields import class_group_factor_base as factor_bases
from sagejs.number_fields import maximal_order
from sagejs.number_fields import prime_ideals

R = PolynomialRing(QQ, "x")
x = R.gen()
packed_field = NumberField(x**3 - x**2 - 6*x - 12, "a")

# The bounded cubic producer factors each equation polynomial only once per
# rational prime and replays Dedekind's criterion from those exact factors.
# The small root factorizer must remain byte-for-byte equal to the generic
# modular oracle, including repeated factors at the index prime 2.
equation = maximal_order.integral_equation_polynomial(packed_field)
coefficients = tuple(int(value) for value in equation.list())
for prime in (2, 3, 5, 7, 11, 13, 17, 19):
    fast_factors = prime_ideals._om.factor_cubic_mod_prime(coefficients, prime)
    generic_factors = prime_ideals._om.factor_mod_prime(coefficients, prime)
    assert fast_factors == generic_factors
    assert prime_ideals._equation_order_is_p_maximal_from_factors(
        coefficients, prime, fast_factors
    ) == maximal_order.equation_order_is_p_maximal(packed_field, prime)

generic_factor_calls = 0
legacy_p_maximal_calls = 0
modular_table_calls = 0
one_coordinate_calls = 0
saved_generic_factor = prime_ideals._om.factor_mod_prime
saved_p_maximal = maximal_order.equation_order_is_p_maximal
saved_modular_table = prime_ideals._modular_table
saved_one_coordinates = prime_ideals._order_one_coordinates
def counted_generic_factor(*args, **kwargs):
    global generic_factor_calls
    generic_factor_calls += 1
    return saved_generic_factor(*args, **kwargs)
def counted_p_maximal(*args, **kwargs):
    global legacy_p_maximal_calls
    legacy_p_maximal_calls += 1
    return saved_p_maximal(*args, **kwargs)
def counted_modular_table(*args, **kwargs):
    global modular_table_calls
    modular_table_calls += 1
    return saved_modular_table(*args, **kwargs)
def counted_one_coordinates(*args, **kwargs):
    global one_coordinate_calls
    one_coordinate_calls += 1
    return saved_one_coordinates(*args, **kwargs)
prime_ideals._om.factor_mod_prime = counted_generic_factor
maximal_order.equation_order_is_p_maximal = counted_p_maximal
prime_ideals._modular_table = counted_modular_table
prime_ideals._order_one_coordinates = counted_one_coordinates
try:
    packed_plan = factor_bases.factor_base_plan(
        packed_field.maximal_order(), proof=True, theorem="minkowski"
    )
    direct_packed_factors = cubic.packed_cubic_factor_records(packed_plan)
finally:
    prime_ideals._om.factor_mod_prime = saved_generic_factor
    maximal_order.equation_order_is_p_maximal = saved_p_maximal
    prime_ideals._modular_table = saved_modular_table
    prime_ideals._order_one_coordinates = saved_one_coordinates
assert direct_packed_factors is not None and len(direct_packed_factors) == 5
# The sole generic factorization is inside the p=2 finite-algebra fallback.
# The irreducible p=7 cubic is rejected from its requested degree set before
# constructing a multiplication table or residue presentation.
assert generic_factor_calls == 1
assert legacy_p_maximal_calls == 0
assert modular_table_calls == 3
assert one_coordinate_calls == 1

packed = cubic.bounded_cubic_minkowski_class_number(packed_field)
assert packed.complete and packed.order() == 3 and packed.certificate.verify()
assert packed.diagnostics["relation_search"]["integral_sieve_candidates"] == 21
assert packed.diagnostics["relation_search"]["integral_sieve_selected"] == 3
assert packed.diagnostics["relation_search"]["integral_sieve_relations"] == 3
assert packed.diagnostics["relation_search"]["integral_sieve_fallback"] == 0
assert packed.diagnostics["relation_search"][
    "relation_prefix_finalized_without_search"
] == 1
assert len(packed.relation_records) == 5
packed_factor_records = tuple(packed._packed_factor_records)
assert len(packed_factor_records) == 5
assert packed._factor_base == ()
assert [record.to_dict() for record in packed_factor_records] == (
    packed.certificate.factor_base
)

from sagejs.number_fields.class_group_relations import ExactRelationCollector, RelationNotSmoothError
from sagejs.number_fields.ideal_arithmetic import packed_valuation_power_bases
order = packed_field.maximal_order()
basis = tuple(order.basis())
materialized_factor_base = packed.factor_base
assert packed._packed_factor_records == ()
assert len(materialized_factor_base) == 5
for packed_record, prime_ideal in zip(
    packed_factor_records, materialized_factor_base, strict=True
):
    assert packed_record.packed_power_bases(3) == packed_valuation_power_bases(
        prime_ideal, 3
    )

# Batch admission replays the packed sieve norm through the determinant of
# multiplication in the integral order basis.  It must not fall back to a
# general field-element resultant, and it retains the identical witness.
norm_collector = ExactRelationCollector(order, packed.factor_base)
element_type = type(packed_field.gen())
saved_element_norm = element_type.norm
def forbidden_element_norm(self):
    raise AssertionError("cubic batch admission recomputed an element resultant")
element_type.norm = forbidden_element_norm
try:
    norm_batch = norm_collector.admit_integral_order_basis_rows(((
        (0, 1, -1),
        packed.relation_records[2].row,
        packed.relation_records[2].provenance,
    ),))
finally:
    element_type.norm = saved_element_norm
assert norm_batch is not None and len(norm_batch) == 1
assert norm_batch[0].record.to_dict() == packed.relation_records[2].to_dict()

probe_collector = ExactRelationCollector(order, packed.factor_base)
try:
    # Both rows have norm 27.  Exact containment, not norm equality alone,
    # must reject the row obtained by swapping the two primes above 3.
    probe_collector.admit_integral_generator_row(
        basis[1] - basis[2],
        (0, 1, 2, 0, 0),
        provenance={"algorithm": "same-norm-wrong-row-regression"},
    )
    raise AssertionError("a same-norm wrong prime-ideal row was admitted")
except RelationNotSmoothError:
    pass

def forbidden_verifier_kernel(*args, **kwargs):
    raise AssertionError("detached replay reused the producer kernel")
saved = cubic._cubic_norm_form_kernel_override
cubic._cubic_norm_form_kernel_override = forbidden_verifier_kernel
assert packed.certificate.verify()
cubic._cubic_norm_form_kernel_override = saved

cubic._cubic_norm_form_kernel_override = False
readable_field = NumberField(x**3 - x**2 - 6*x - 12, "b")
readable = cubic.bounded_cubic_minkowski_class_number(readable_field)
cubic._cubic_norm_form_kernel_override = saved
assert readable.complete and readable.order() == 3 and readable.certificate.verify()
packed_obstruction = packed.certificate.obstructions[0]
readable_obstruction = readable.certificate.obstructions[0]
stored_obstruction_ideal = order.ideal_from_dict(
    packed_obstruction["integral_ideal"]
)
relative_basis_method = getattr(
    stored_obstruction_ideal, "_relative_basis_matrix", None
)
if callable(relative_basis_method):
    relative_basis = relative_basis_method()
    assert relative_basis_method() is relative_basis
assert cubic._cubic_norm_form_coefficients_from_order(
    stored_obstruction_ideal
) == cubic._cubic_norm_form_coefficients(stored_obstruction_ideal)
for name in (
    "prime",
    "line",
    "class_coordinates",
    "ambient_row",
    "ideal_norm",
    "norm_form_coefficients",
    "modulus",
    "residue_states",
):
    assert packed_obstruction[name] == readable_obstruction[name]
assert packed.certificate.relations == readable.certificate.relations

cubic._cubic_relation_sieve_kernel_override = False
fallback_field = NumberField(x**3 - x**2 - 6*x - 12, "fallback")
fallback = cubic.bounded_cubic_minkowski_class_number(fallback_field)
cubic._cubic_relation_sieve_kernel_override = None
assert fallback.complete and fallback.order() == 3 and fallback.certificate.verify()
assert fallback.diagnostics["relation_search"]["integral_sieve_fallback"] == 1
assert fallback.diagnostics["relation_search"][
    "relation_prefix_finalized_without_search"
] == 0

def invalid_kernel(*args, **kwargs):
    return 0
cubic._cubic_norm_form_kernel_override = invalid_kernel
assert not cubic._cubic_norm_form_represents_targets(
    tuple(packed_obstruction["norm_form_coefficients"]),
    19,
    5,
    14,
    cancelled=None,
)
cubic._cubic_norm_form_kernel_override = saved
print("cubic-norm-kernel-ok")
`,
    180_000,
  );
  assert.equal(output, "cubic-norm-kernel-ok");
});
