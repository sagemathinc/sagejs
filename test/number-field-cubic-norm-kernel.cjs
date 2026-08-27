#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const sagejs = process.execPath;
const sagejsArguments = [
  join(root, "bin", process.platform === "win32" ? "sagejs-source.cjs" : "sagejs"),
  "--python",
  "-",
];

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

function runSagejs(source, timeout = 120_000) {
  return run(sagejs, sagejsArguments, source, timeout);
}

const kernelDifferential = String.raw`
from sagejs.native import integer_buffer_values, kernel_integer_buffer, kernel_integer_zeros
from sagejs.number_fields.bl_composite_kernel import packed_cubic_norm_form_first_obstruction_in_place, packed_cubic_norm_form_target_slice

packed = packed_cubic_norm_form_target_slice
dynamic = getattr(packed, "__sagejs_native_source__", packed)
obstruction_packed = packed_cubic_norm_form_first_obstruction_in_place
obstruction_dynamic = getattr(
    obstruction_packed, "__sagejs_native_source__", obstruction_packed
)
coefficients = [170, 5745, 18000, 1585, 2345, 5115, 25215, 11100, 36900, 15075]

for function in (dynamic, packed):
    values = kernel_integer_buffer(function, coefficients)
    assert function(values, 19, 0, 19, 5, 14) == 1
    assert function(values, 19, 0, 19, 0, 0) == 2
    assert function(values, 19, 7, 7, 5, 14) == 1
    assert function(values, 1, 0, 1, 0, 0) == 0
    assert function(values, 19, 8, 7, 5, 14) == 0

for function in (obstruction_dynamic, obstruction_packed):
    values = kernel_integer_buffer(function, coefficients)
    metadata = kernel_integer_zeros(function, 4, 16)
    assert function(metadata, values, 5, 31, 500000)
    assert tuple(integer_buffer_values(metadata)) == (15803, 19, 6859, 1)
    bounded = kernel_integer_zeros(function, 4, 16)
    assert function(bounded, values, 5, 7, 500000)
    assert tuple(integer_buffer_values(bounded)) == (503, 0, 0, 1)
    capped = kernel_integer_zeros(function, 4, 16)
    assert function(capped, values, 5, 31, 500)
    assert tuple(integer_buffer_values(capped)) == (160, 0, 0, 0)
    assert not function(
        kernel_integer_zeros(function, 3, 16), values, 5, 31, 500000
    )
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
  const output = runSagejs(
    `${kernelDifferential}\nfrom sagejs.native import is_compiled\nprint(is_compiled(packed), is_compiled(obstruction_packed))\n`,
  );
  assert.equal(output, "True True");
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
  const output = runSagejs(
    `${relationSieveDifferential}\nfrom sagejs.native import is_compiled\nprint(is_compiled(coefficient_packed), is_compiled(candidate_packed), is_compiled(row_packed))\n`,
  );
  assert.equal(output, "True True True");
});

test("bounded cubic factorization matches the generic modular oracle", () => {
  runSagejs(cubicFactorDifferential);
});

test("packed cubic collector reuses its authenticated factor-base snapshot", () => {
  const output = runSagejs(
    String.raw`
from sagejs.number_fields import class_group_factor_base as factor_bases
from sagejs.number_fields import class_group_matrix as relation_matrices
from sagejs.number_fields import class_group_relations as relations
from sagejs.number_fields import cubic_class_number as cubic
from sagejs.number_fields import ideal_arithmetic as ideals

R = PolynomialRing(QQ, "x")
x = R.gen()
field = NumberField(x**3 - x**2 - 6*x - 12, "a")
saved = relations._validate_factor_base
saved_validated_admit = (
    relations.ExactRelationCollector._admit_validated_integral_order_basis_rows
)
calls = 0
validated_admission_calls = 0
def forbidden(order, factors):
    global calls
    calls += 1
    values = tuple(factors)
    if values and isinstance(values[0], cubic.PackedCubicFactorRecord):
        raise AssertionError("packed factor fingerprints were reconstructed")
    return saved(order, values)
def counted_validated_admit(self, *args, **kwargs):
    global validated_admission_calls
    validated_admission_calls += 1
    return saved_validated_admit(self, *args, **kwargs)
relations._validate_factor_base = forbidden
relations.ExactRelationCollector._admit_validated_integral_order_basis_rows = (
    counted_validated_admit
)
try:
    result = cubic.bounded_cubic_minkowski_class_number(field)
finally:
    relations._validate_factor_base = saved
    relations.ExactRelationCollector._admit_validated_integral_order_basis_rows = (
        saved_validated_admit
    )
assert result.complete and result.order() == 3
assert calls == 0
assert validated_admission_calls == 1
assert result.diagnostics["relation_search"][
    "integral_sieve_validated_batch"
] == 1

# Disabling only the batched power-chain boundary falls through to the
# pre-existing scalar chains and produces the same exact mathematical proof.
saved_batch = ideals._ideal_power_chains_kernel_override
ideals._ideal_power_chains_kernel_override = False
try:
    scalar_field = NumberField(x**3 - x**2 - 6*x - 12, "a")
    scalar_result = cubic.bounded_cubic_minkowski_class_number(scalar_field)
finally:
    ideals._ideal_power_chains_kernel_override = saved_batch
assert scalar_result.complete and scalar_result.order() == 3
assert [record.to_dict() for record in scalar_result.relation_records] == [
    record.to_dict() for record in result.relation_records
]
assert scalar_result.presentation.to_dict() == result.presentation.to_dict()
for key in (
    "prime",
    "line",
    "class_coordinates",
    "ambient_row",
    "ideal_norm",
    "norm_form_coefficients",
    "modulus",
    "residue_states",
):
    assert scalar_result.certificate.obstructions[0][key] == (
        result.certificate.obstructions[0][key]
    )

# A one-prime cubic base also stays packed.  The former ordinary-record
# special case became slower than the fused cubic materializer and rebuilt the
# same ideal fingerprint before relation collection.
small = NumberField(x**3 + 2*x + 1, "s")
saved_build = factor_bases.build_factor_base
def forbidden_build(_plan):
    raise AssertionError("a one-prime cubic base left the packed producer")
factor_bases.build_factor_base = forbidden_build
try:
    small_result = cubic.bounded_cubic_minkowski_class_number(small)
finally:
    factor_bases.build_factor_base = saved_build
assert small_result.complete and small_result.order() == 1
assert len(small_result._packed_factor_records) == 1
small_record = small_result._packed_factor_records[0]
assert small_record._modular_table is None
assert small_result.presentation.backend == "python"
assert small_result.presentation.verify()
assert small_record.to_dict() == factor_bases.build_factor_base(
    factor_bases.factor_base_plan(
        small.maximal_order(), proof=True, theorem="minkowski"
    )
)[0].to_dict()
small_basis = tuple(small.maximal_order().basis())
small_norm_form = cubic._order_cubic_norm_form_coefficients(small.maximal_order())
for coordinates in ((1, 0, 0), (1, 1, 0), (-2, 3, 1), (5, -4, 2)):
    element = sum(
        coordinate * basis_element
        for coordinate, basis_element in zip(coordinates, small_basis)
    )
    assert cubic._cubic_norm_form_value(
        small_norm_form, *coordinates
    ) == int(QQ(element.norm())._numerator)
assert small_record.modular_table
assert small_record._modular_table is not None

# The isomorphic LMFDB polynomial has a poor canonical modular lift: a + 1 has
# norm four.  A complete 32-state centered lift of the same retained residue
# subspace finds a^2 - a, whose norm two proves the prime principal,
# without invoking the general coefficient box.
small_lmfdb = NumberField(x**3 + 2*x - 1, "l")
small_lmfdb_result = cubic.bounded_cubic_minkowski_class_number(small_lmfdb)
assert small_lmfdb_result.complete and small_lmfdb_result.order() == 1
assert small_lmfdb_result.certificate.verify()
assert small_lmfdb_result.diagnostics["relation_search"][
    "integral_sieve_candidates"
] == 0
assert len(small_lmfdb_result.relation_records) == 1
assert small_lmfdb_result.relation_records[0].provenance == {
    "algorithm": "packed-cubic-modular-prime-generator",
    "factor_base_index": 0,
    "order_basis_coordinates": [0, 1, -1],
}

# Principal-factor proposals share one exact order norm form across every
# retained prime and modular lift.  Revalidating the power basis and decoding
# the same defining polynomial for each candidate used to dominate this tiny
# exact search.
proposal_plan = factor_bases.factor_base_plan(
    small_lmfdb.maximal_order(), proof=True, theorem="minkowski"
)
proposal_factors = cubic.packed_cubic_factor_records(proposal_plan)
assert proposal_factors is not None
saved_norm_form = cubic._order_cubic_norm_form_coefficients
norm_form_calls = 0
def counted_norm_form(order):
    global norm_form_calls
    norm_form_calls += 1
    return saved_norm_form(order)
cubic._order_cubic_norm_form_coefficients = counted_norm_form
try:
    proposals = cubic._packed_principal_factor_proposals(
        small_lmfdb.maximal_order(), proposal_factors
    )
finally:
    cubic._order_cubic_norm_form_coefficients = saved_norm_form
assert proposals and norm_form_calls == 1

# The HNF support selector already knows whether the low-norm prefix has full
# rank.  A rank-deficient prefix must widen directly instead of constructing a
# complete HNF/Smith presentation solely to rediscover that missing pivot.
saved_extract = relation_matrices.extract_relation_presentation
observed_presentation_ranks = []
def counted_extract(rows, columns, **kwargs):
    presentation = saved_extract(rows, columns, **kwargs)
    observed_presentation_ranks.append((presentation.rank, int(columns)))
    return presentation
relation_matrices.extract_relation_presentation = counted_extract
try:
    rank_deficient_prefix = cubic.bounded_cubic_minkowski_class_number(
        NumberField(x**3 - x**2 - 14*x + 30, "rank")
    )
finally:
    relation_matrices.extract_relation_presentation = saved_extract
assert not rank_deficient_prefix.complete
assert observed_presentation_ranks and all(
    rank == width for rank, width in observed_presentation_ranks
)

# The private authority still checks retained object identities.  It cannot
# transfer packed records to another maximal order, while detached replay
# remains on the ordinary full validation path.
other = NumberField(x**3 - x**2 - 6*x - 12, "b").maximal_order()
try:
    relations.ExactRelationCollector(
        other,
        result._packed_factor_records,
        _validated_token=relations._VALIDATED_FACTOR_BASE_TOKEN,
    )
    raise AssertionError("a validated packed base crossed order identities")
except TypeError:
    pass
assert result.certificate.verify()
print("authenticated-packed-factor-base-ok")
`,
  );
  assert.equal(output, "authenticated-packed-factor-base-ok");
});

test("cubic class-number obstruction agrees with the readable search", () => {
  const output = runSagejs(
    String.raw`
import sagejs.number_fields.cubic_class_number as cubic
from sagejs.number_fields import class_group_factor_base as factor_bases
from sagejs.number_fields import class_group_relations as relation_module
from sagejs.number_fields import maximal_order
from sagejs.number_fields import prime_ideals
from sagejs.number_fields.class_group_relations import reconstruct_factor_base_ideal
from sagejs.number_fields.class_unit_context import ClassUnitGroupContext, ClassUnitProofState, _LIVE_CLASS_UNIT_CONTEXT_TOKEN

R = PolynomialRing(QQ, "x")
x = R.gen()
packed_field = NumberField(x**3 - x**2 - 6*x - 12, "a")

# The bounded cubic producer factors each equation polynomial only once per
# rational prime and replays Dedekind's criterion from those exact factors.
# The small root factorizer must remain byte-for-byte equal to the generic
# modular oracle, including repeated factors at the index prime 2.
equation = maximal_order.integral_equation_polynomial(packed_field)
coefficients = tuple(int(value) for value in equation.list())
equation_index = maximal_order.equation_order_index(packed_field.maximal_order())
assert equation_index == 2
assert tuple(equation_index % prime != 0 for prime in (2, 3, 5, 7)) == tuple(
    prime_ideals._equation_order_is_p_maximal_from_factors(
        coefficients,
        prime,
        prime_ideals._om.factor_cubic_mod_prime(coefficients, prime),
    )
    for prime in (2, 3, 5, 7)
)
# The fixed-size cubic quotient map is byte-for-byte identical to the generic
# row-basis/nullspace/lift construction, including redundant input rows.
for prime, subspaces in (
    (2, ([], [[1, 0, 0]], [[1, 1, 0], [0, 1, 1]], [[1, 0, 1], [1, 0, 1]])),
    (3, ([[1, 2, 0]], [[0, 1, 2]], [[1, 2, 0], [2, 1, 1]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]])),
    (5, ([[2, 4, 1]], [[1, 2, 3], [4, 0, 1]], [[0, 0, 0], [3, 1, 4]])),
):
    for subspace in subspaces:
        expected = prime_ideals._quotient_map_reference(subspace, 3, prime)
        assert prime_ideals._cubic_quotient_map(subspace, prime) == expected
        quotient_cache = {}
        assert prime_ideals._quotient_map(
            subspace, 3, prime, cache=quotient_cache
        ) == expected
        assert prime_ideals._quotient_map(
            subspace, 3, prime, cache=quotient_cache
        ) == expected
inverse_rows = packed_field.maximal_order()._basis_inverse_matrix().rows()
assert prime_ideals._order_one_coordinates(packed_field.maximal_order()) == [
    int(value._numerator) for value in inverse_rows[0]
]
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
saved_nf_element_from_row = prime_ideals._nf_element_from_row
saved_packed_order_basis = prime_ideals._packed_candidate_order_basis
saved_linear_dedekind_kummer = (
    prime_ideals.packed_cubic_linear_dedekind_kummer_candidates
)
packed_order_basis_calls = 0
linear_dedekind_kummer_calls = 0
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
def forbidden_nf_element_from_row(*args, **kwargs):
    raise AssertionError(
        "packed factor-record construction eagerly materialized a field element"
    )
def counted_packed_order_basis(*args, **kwargs):
    global packed_order_basis_calls
    packed_order_basis_calls += 1
    return saved_packed_order_basis(*args, **kwargs)
def counted_linear_dedekind_kummer(*args, **kwargs):
    global linear_dedekind_kummer_calls
    linear_dedekind_kummer_calls += 1
    return saved_linear_dedekind_kummer(*args, **kwargs)
prime_ideals._om.factor_mod_prime = counted_generic_factor
maximal_order.equation_order_is_p_maximal = counted_p_maximal
prime_ideals._modular_table = counted_modular_table
prime_ideals._order_one_coordinates = counted_one_coordinates
prime_ideals._nf_element_from_row = forbidden_nf_element_from_row
prime_ideals._packed_candidate_order_basis = counted_packed_order_basis
prime_ideals.packed_cubic_linear_dedekind_kummer_candidates = (
    counted_linear_dedekind_kummer
)
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
    prime_ideals._nf_element_from_row = saved_nf_element_from_row
    prime_ideals._packed_candidate_order_basis = saved_packed_order_basis
    prime_ideals.packed_cubic_linear_dedekind_kummer_candidates = (
        saved_linear_dedekind_kummer
    )
assert direct_packed_factors is not None and len(direct_packed_factors) == 5
# The packed reduced-algebra kernel handles p=2 without the generic modular
# factorizer.  The irreducible p=7 cubic uses the bounded cubic factorizer
# while authenticating its (unselected) degree-three residue presentation.
assert generic_factor_calls == 0
assert legacy_p_maximal_calls == 0
assert modular_table_calls == 1
assert one_coordinate_calls == 1
assert packed_order_basis_calls == 1
assert linear_dedekind_kummer_calls == 2
# Authentication serializes the retained rational coefficient triples without
# constructing any NumberFieldElement.  General ideal materialization remains
# lazy and fills this cache only when explicitly requested below.
assert all(record._second_generator_payload is not None for record in direct_packed_factors)
assert all(record._second_generator_cache is None for record in direct_packed_factors)
direct_payloads = [record.to_dict() for record in direct_packed_factors]
assert all(record._second_generator_cache is None for record in direct_packed_factors)
assert direct_packed_factors[0].second_generator is not None
assert direct_packed_factors[0]._second_generator_cache is not None
assert [record.to_dict() for record in direct_packed_factors] == direct_payloads
# The p=2 index-prime factor requires the complete finite-algebra replay and
# therefore deliberately declines the selective live materializer.
assert cubic.materialize_verified_packed_cubic_factor_records(
    direct_packed_factors
) is None

# An all-Dedekind--Kummer BDF base can be materialized with the same exact
# containment, norm, and quotient-field checks as the ordinary constructor.
verified_field = NumberField(x**3 - x**2 + 7*x + 8, "v")
verified_plan = factor_bases.factor_base_plan(
    verified_field.maximal_order(), proof=False, theorem="auto"
)
verified_packed = cubic.packed_cubic_factor_records(verified_plan)
assert verified_packed is not None and len(verified_packed) == 7
verified_materialization = (
    cubic.materialize_verified_packed_cubic_factor_records(verified_packed)
)
assert verified_materialization is not None
verified_records, verified_primes = verified_materialization
for packed_record in verified_packed:
    direct_table = cubic._integral_power_basis_cubic_modular_table(
        verified_field.maximal_order(), packed_record.prime
    )
    assert direct_table == prime_ideals._modular_table(
        verified_field.maximal_order(), packed_record.prime
    )
    direct_rows = cubic._packed_integral_cubic_candidate_rows(
        [list(row) for row in packed_record.subspace], packed_record.prime
    )
    generic_rows = prime_ideals._packed_candidate_rows(
        verified_field.maximal_order(),
        [list(row) for row in packed_record.subspace],
        packed_record.prime,
    )
    assert direct_rows is not None and generic_rows is not None
    assert [
        [[int(QQ(value)._numerator), int(QQ(value)._denominator)] for value in row]
        for row in direct_rows
    ] == [
        [[int(value._numerator), int(value._denominator)] for value in row]
        for row in generic_rows
    ]
assert [record.to_dict() for record in verified_records] == [
    record.to_dict() for record in factor_bases.build_factor_base(verified_plan)
]
assert all(
    not getattr(prime, "_packed_candidate_pending_replay", True)
    for prime in verified_primes
)
ordinary_candidates = cubic._packed_cubic_relation_candidates(
    verified_field.maximal_order(),
    verified_primes,
    maximum_candidates=64,
    cancelled=None,
)
retained_candidates = cubic._packed_cubic_relation_candidates(
    verified_field.maximal_order(),
    verified_primes,
    maximum_candidates=64,
    power_factor_base=verified_packed,
    cancelled=None,
)
assert retained_candidates == ordinary_candidates

# A live computation context may reuse these compact producer objects only
# while every independently materialized prime identity and private producer
# snapshot still matches.  The compact state is intentionally absent from a
# detached context.
live_context = ClassUnitGroupContext(
    verified_field,
    verified_field.maximal_order(),
    ClassUnitProofState.unconditional(),
)
live_context._activate_live(
    _LIVE_CLASS_UNIT_CONTEXT_TOKEN,
    reusable=True,
)
live_context._bind_live_factor_base(
    _LIVE_CLASS_UNIT_CONTEXT_TOKEN,
    verified_primes,
    validated=True,
    producer_records=verified_packed,
    canonical_records=verified_records,
)
assert live_context._live_packed_factor_base(
    _LIVE_CLASS_UNIT_CONTEXT_TOKEN, verified_primes
) == verified_packed
saved_live_subspace = verified_packed[0].subspace
verified_packed[0].subspace = tuple(
    tuple((value + 1) if row == 0 and column == 0 else value for column, value in enumerate(values))
    for row, values in enumerate(saved_live_subspace)
)
try:
    assert live_context._live_packed_factor_base(
        _LIVE_CLASS_UNIT_CONTEXT_TOKEN, verified_primes
    ) is None
finally:
    verified_packed[0].subspace = saved_live_subspace
assert live_context._live_packed_factor_base(
    _LIVE_CLASS_UNIT_CONTEXT_TOKEN, verified_primes
) == verified_packed
detached_context = ClassUnitGroupContext.from_dict(
    verified_field,
    verified_field.maximal_order(),
    live_context.to_dict(),
)
assert detached_context.live_diagnostics() == {}
saved_verified_rows = verified_packed[0].rows
mutated_rows = [list(row) for row in saved_verified_rows]
mutated_rows[0][0] += 1
verified_packed[0].rows = tuple(tuple(row) for row in mutated_rows)
try:
    try:
        cubic.materialize_verified_packed_cubic_factor_records(verified_packed)
        raise AssertionError("a mutated packed prime lattice was accepted")
    except ArithmeticError:
        pass
finally:
    verified_packed[0].rows = saved_verified_rows

saved_verified_subspace = verified_packed[0].subspace
mutated_subspace = [list(row) for row in saved_verified_subspace]
mutated_subspace[0][0] = (
    mutated_subspace[0][0] + 1
) % verified_packed[0].prime
verified_packed[0].subspace = tuple(tuple(row) for row in mutated_subspace)
try:
    try:
        cubic.materialize_verified_packed_cubic_factor_records(verified_packed)
        raise AssertionError("a mutated packed modular subspace was accepted")
    except ArithmeticError:
        pass
finally:
    verified_packed[0].subspace = saved_verified_subspace

saved_verified_witness = verified_packed[0]._second_generator_payload
mutated_witness = list(saved_verified_witness)
mutated_witness[0] = (mutated_witness[0][0] + 1, mutated_witness[0][1])
verified_packed[0]._second_generator_payload = tuple(mutated_witness)
try:
    try:
        cubic.materialize_verified_packed_cubic_factor_records(verified_packed)
        raise AssertionError("a mutated packed two-generator witness was accepted")
    except ArithmeticError:
        pass
finally:
    verified_packed[0]._second_generator_payload = saved_verified_witness

saved_verified_presentation = dict(verified_packed[0].presentation)
mutated_presentation = dict(saved_verified_presentation)
mutated_presentation["primitive"] = [0, 1, 0]
verified_packed[0].presentation = mutated_presentation
try:
    try:
        cubic.materialize_verified_packed_cubic_factor_records(verified_packed)
        raise AssertionError("a mutated packed quotient presentation was accepted")
    except ArithmeticError:
        pass
finally:
    verified_packed[0].presentation = saved_verified_presentation

# The direct power-basis constructor also covers an inert cubic factor.  Its
# zero second generator represents (2, 0) = 2*O; the independent modular
# materializer must recover the same norm-eight prime as the generic oracle.
inert_field = NumberField(x**3 - x - 1, "i")
class InertPlan:
    pass
inert_plan = InertPlan()
inert_plan.order = inert_field.maximal_order()
inert_plan.bound = 8
inert_plan.max_rational_primes = 64
inert_plan.max_prime_ideals = 64
inert_packed = cubic.packed_cubic_factor_records(inert_plan)
assert inert_packed is not None
inert_record = next(
    record
    for record in inert_packed
    if record.prime == 2 and record.residue_degree == 3
)
assert inert_record._second_generator_payload == ((0, 1), (0, 1), (0, 1))
inert_materialization = cubic.materialize_verified_packed_cubic_factor_records(
    inert_packed
)
assert inert_materialization is not None
inert_prime = next(
    prime
    for prime in inert_materialization[1]
    if int(prime.rational_prime()) == 2
)
assert inert_prime.norm() == 8
assert inert_prime == prime_ideals.factor_rational_prime(
    inert_plan.order, 2
).prime_ideals()[0]

packed = cubic.bounded_cubic_minkowski_class_number(packed_field)
assert packed.complete and packed.order() == 3 and packed.certificate.verify()
assert packed.diagnostics["relation_search"]["integral_sieve_candidates"] == 8
assert packed.diagnostics["relation_search"]["integral_sieve_valuation_limit"] == 8
assert packed.diagnostics["relation_search"]["integral_sieve_prefix_proved"] == 1
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

# The low-norm prefix may become proof evidence only after exact batch
# admission reproduces every planned row.  Its modular obstruction is computed
# once and retained across that authority boundary.  Supplying a cancellation
# callback keeps the probe on the cancellable readable route.
saved_packed_obstruction = cubic._find_packed_cubic_norm_obstruction
planned_obstruction_calls = 0
cancellation_calls = 0
def not_cancelled():
    global cancellation_calls
    cancellation_calls += 1
    return False
def counted_packed_obstruction(*args, **kwargs):
    global planned_obstruction_calls
    planned_obstruction_calls += 1
    assert kwargs["cancelled"] is not_cancelled
    return saved_packed_obstruction(*args, **kwargs)
cubic._find_packed_cubic_norm_obstruction = counted_packed_obstruction
try:
    planned_field = NumberField(x**3 - x**2 - 6*x - 12, "planned")
    planned_result = cubic.bounded_cubic_minkowski_class_number(
        planned_field, cancelled=not_cancelled
    )
finally:
    cubic._find_packed_cubic_norm_obstruction = saved_packed_obstruction
assert planned_result.complete and planned_result.order() == 3
assert planned_result.certificate.verify()
assert planned_obstruction_calls == 1
assert cancellation_calls > 0
assert planned_result.diagnostics["relation_search"][
    "integral_sieve_prefix_proved"
] == 1

# If the bounded prefix cannot establish every required lower-bound
# obstruction, it is discarded before admission.  The producer widens to the
# unchanged complete candidate batch and runs the authoritative obstruction
# search after exact admission.
widening_obstruction_calls = 0
def decline_prefix_obstruction(*args, **kwargs):
    global widening_obstruction_calls
    widening_obstruction_calls += 1
    if widening_obstruction_calls == 1:
        return (None, 0)
    return saved_packed_obstruction(*args, **kwargs)
cubic._find_packed_cubic_norm_obstruction = decline_prefix_obstruction
try:
    widened_field = NumberField(x**3 - x**2 - 6*x - 12, "widened")
    widened_result = cubic.bounded_cubic_minkowski_class_number(widened_field)
finally:
    cubic._find_packed_cubic_norm_obstruction = saved_packed_obstruction
assert widened_result.complete and widened_result.order() == 3
assert widened_result.certificate.verify()
assert widening_obstruction_calls == 2
assert widened_result.diagnostics["relation_search"][
    "integral_sieve_candidates"
] == 21
assert widened_result.diagnostics["relation_search"][
    "integral_sieve_prefix_proved"
] == 0

# Positive prime powers and signed products whose denominator can be cleared
# by a complete rational-prime relation stay in the packed HNF representation
# during the optional lower-bound search.  These corpus fields do not have a
# local obstruction under the configured modulus cap, but they must not fall
# back merely because their projective-line representative is P^2, P^4, or
# P^3*Q^-3.
saved_ordinary_obstruction = cubic._find_cubic_norm_obstruction
saved_packed_obstruction = cubic._find_packed_cubic_norm_obstruction
observed_powers = []
def forbidden_ordinary_obstruction(*args, **kwargs):
    raise AssertionError("a positive packed prime power materialized an ideal")
def observed_packed_obstruction(factor_base, line, **kwargs):
    observed_powers.append(tuple(
        value for value in line["ambient_row"] if value
    ))
    return saved_packed_obstruction(factor_base, line, **kwargs)
cubic._find_cubic_norm_obstruction = forbidden_ordinary_obstruction
cubic._find_packed_cubic_norm_obstruction = observed_packed_obstruction
try:
    for polynomial, expected_row in (
        (x**3 - x**2 + 3*x + 6, (2,)),
        (x**3 - x**2 + 7*x + 8, (3, -3)),
        (x**3 - x**2 - 14*x + 30, (4,)),
    ):
        power_field = NumberField(polynomial, "u")
        power_result = cubic.bounded_cubic_minkowski_class_number(power_field)
        assert not power_result.complete
        assert expected_row in observed_powers
        power_plan = factor_bases.factor_base_plan(
            power_field.maximal_order(), proof=True, theorem="minkowski"
        )
        power_factors = cubic.packed_cubic_factor_records(power_plan)
        assert power_factors is not None
        line = next(
            line
            for line in cubic._projective_line_specs(
                power_result.presentation, max_lines=128
            )
            if tuple(value for value in line["ambient_row"] if value) == expected_row
        )
        packed_basis = cubic._packed_cubic_integral_basis_for_ambient_row(
            power_factors, tuple(line["ambient_row"])
        )
        assert packed_basis is not None
        packed_rows, packed_norm = packed_basis
        saved_factor_rational_prime = prime_ideals.factor_rational_prime
        def forbidden_factor_rational_prime(*args, **kwargs):
            raise AssertionError("packed materialization refactored a rational prime")
        prime_ideals.factor_rational_prime = forbidden_factor_rational_prime
        try:
            ordinary_records, ordinary_factors = (
                cubic._materialize_packed_cubic_factor_records(power_factors)
            )
        finally:
            prime_ideals.factor_rational_prime = saved_factor_rational_prime
        assert len(ordinary_records) == len(power_factors)
        ordinary = reconstruct_factor_base_ideal(
            power_field.maximal_order(),
            ordinary_factors,
            line["ambient_row"],
        ).numerator()
        assert packed_rows == tuple(tuple(row) for row in ordinary._basis_rows)
        assert ordinary.norm() == packed_norm
finally:
    cubic._find_cubic_norm_obstruction = saved_ordinary_obstruction
    cubic._find_packed_cubic_norm_obstruction = saved_packed_obstruction

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
saved_element_decoder = relation_module._element_from_payload
packed_sieve_record = next(
    record
    for record in packed.relation_records
    if record.provenance.get("algorithm")
    == "packed-cubic-integral-relation-sieve"
)
packed_sieve_coordinates = tuple(
    packed_sieve_record.provenance["order_basis_coordinates"]
)
def forbidden_element_norm(self):
    raise AssertionError("cubic batch admission recomputed an element resultant")
def forbidden_element_decoder(*args, **kwargs):
    raise AssertionError("cubic batch admission rebuilt a serialized field element")
element_type.norm = forbidden_element_norm
relation_module._element_from_payload = forbidden_element_decoder
try:
    norm_batch = norm_collector.admit_integral_order_basis_rows(((
        packed_sieve_coordinates,
        packed_sieve_record.row,
        packed_sieve_record.provenance,
    ),))
finally:
    element_type.norm = saved_element_norm
    relation_module._element_from_payload = saved_element_decoder
assert norm_batch is not None and len(norm_batch) == 1
assert norm_batch[0].record.to_dict() == packed_sieve_record.to_dict()

# Producer-owned records may skip a second recursive JSON validation only after
# batch admission.  Caller-owned provenance must nevertheless be copied before
# the record enters the collector.
owned_provenance = {
    "algorithm": "integral-batch-ownership-regression",
    "nested": {"values": [1, 2]},
}
ownership_collector = ExactRelationCollector(order, packed.factor_base)
ownership_batch = ownership_collector.admit_integral_order_basis_rows(((
    packed_sieve_coordinates,
    packed_sieve_record.row,
    owned_provenance,
),))
assert ownership_batch is not None and len(ownership_batch) == 1
owned_provenance["nested"]["values"].append(3)
assert ownership_batch[0].record.provenance == {
    "algorithm": "integral-batch-ownership-regression",
    "nested": {"values": [1, 2]},
}

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
