#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
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
from sagejs.native import integer_buffer_values, kernel_integer_buffer, kernel_integer_zeros
from sagejs.number_fields.bl_composite_kernel import packed_prime_ideal_candidate_hnf_in_place

packed = packed_prime_ideal_candidate_hnf_in_place
dynamic = getattr(packed, "__sagejs_native_source__", packed)
basis = [2, 0, 0, 0, 1, 1, 0, 0, 2]
cases = [
    ([0, 0, 1], 1, [4, 0, 0, 0, 2, 0, 0, 0, 2]),
    ([1, 0, 1, 0, 1, 0], 2, [2, 0, 2, 0, 1, 1, 0, 0, 4]),
]

def outcome(function, subspace, row_count):
    degree = 3
    entries = (degree + row_count) * degree
    output = kernel_integer_zeros(function, entries, 32)
    source = kernel_integer_zeros(function, entries, 32)
    workspace = kernel_integer_zeros(function, 2 * degree, 32)
    basis_buffer = kernel_integer_buffer(function, basis)
    subspace_buffer = kernel_integer_buffer(function, subspace)
    assert function(
        output,
        source,
        workspace,
        basis_buffer,
        subspace_buffer,
        2,
        degree,
        row_count,
    )
    return [int(value) for value in integer_buffer_values(output)[:9]]

for subspace, row_count, expected in cases:
    assert outcome(dynamic, subspace, row_count) == expected
    assert outcome(packed, subspace, row_count) == expected

for function in (dynamic, packed):
    output = kernel_integer_zeros(function, 12, 32)
    source = kernel_integer_zeros(function, 12, 32)
    workspace = kernel_integer_zeros(function, 6, 32)
    assert not function(
        output,
        source,
        workspace,
        kernel_integer_buffer(function, basis),
        kernel_integer_buffer(function, [0, 0, 2]),
        2,
        3,
        1,
    )
    assert list(integer_buffer_values(output)) == [0] * 12
`;

test("candidate HNF source matches in CPython and compiled Sage.js", () => {
  run(
    pythonExecutable(),
    ["-c", `import sys; sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})\n${kernelDifferential}`],
    "",
  );
  const output = run(
    sagejs,
    ["--python", "-"],
    `${kernelDifferential}\nfrom sagejs.native import is_compiled\nprint(is_compiled(packed))\n`,
  );
  assert.equal(output, "True");
});

test("packed h3 candidates replay and preserve the five-record payload", () => {
  const output = run(sagejs, ["--python", "-"], String.raw`
import hashlib
import json

from sagejs.number_fields import class_group_factor_base as factor_bases
from sagejs.number_fields import ideal_arithmetic
from sagejs.number_fields import prime_ideals

R = PolynomialRing(QQ, "x")
x = R.gen()
field = NumberField(x**3 - x**2 - 6*x - 12, "a")
order = field.maximal_order()
modular_table_calls = 0
original_modular_table = prime_ideals._modular_table
def counted_modular_table(*args, **kwargs):
    global modular_table_calls
    modular_table_calls += 1
    return original_modular_table(*args, **kwargs)
prime_ideals._modular_table = counted_modular_table
try:
    plan = factor_bases.factor_base_plan(order, proof=True, theorem="minkowski")
    records = factor_bases.build_factor_base(plan)
finally:
    prime_ideals._modular_table = original_modular_table
assert modular_table_calls == 4
payload = [record.to_dict() for record in records]
encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
assert hashlib.sha256(encoded).hexdigest() == "2262d9dce3278741e3b73e9d95eb70a2d81c2b86cc3436198cda58efcbfc5456"
assert [(record.norm, record.rational_prime, record.ramification_index, record.residue_degree) for record in records] == [
    (2, 2, 1, 1),
    (3, 3, 1, 1),
    (3, 3, 2, 1),
    (4, 2, 1, 2),
    (5, 5, 1, 1),
]
p2 = [record.prime_ideal for record in records if record.rational_prime == 2]
assert all(getattr(ideal, "_packed_candidate_pending_replay", None) is False for ideal in p2)
assert all(getattr(ideal, "_verified_modular_algebra", None) is not None for ideal in p2)

# Prime modular-coordinate consumers share the maximal order's immutable exact
# basis inverse.  Once prepared, none may reconstruct and invert a fresh basis
# matrix for the same order.
expected_subspace = prime_ideals._ideal_mod_p_subspace(p2[0], 2)
cached_subspace = prime_ideals._ideal_mod_p_subspace(p2[0], 2)
assert cached_subspace == expected_subspace and cached_subspace is not expected_subspace
cached_subspace[0][0] = (cached_subspace[0][0] + 1) % 2
assert prime_ideals._ideal_mod_p_subspace(p2[0], 2) == expected_subspace
expected_coordinates = prime_ideals._field_element_order_coordinates(
    order, p2[0].basis()[0]
)
expected_one = prime_ideals._order_one_coordinates(order)
expected_table = prime_ideals._maximal._nf_order_multiplication_table(order)
second_table = prime_ideals._maximal._nf_order_multiplication_table(order)
assert second_table == expected_table and second_table is not expected_table
assert order._basis_inverse_matrix() is order._basis_inverse_matrix()
order_type = type(order)
original_basis_matrix = order_type.basis_matrix
def forbidden_basis_matrix(self):
    if self is order:
        raise AssertionError("prime arithmetic rebuilt the cached order basis")
    return original_basis_matrix(self)
order_type.basis_matrix = forbidden_basis_matrix
try:
    assert prime_ideals._ideal_mod_p_subspace(p2[0], 2) == expected_subspace
    assert prime_ideals._field_element_order_coordinates(
        order, p2[0].basis()[0]
    ) == expected_coordinates
    assert prime_ideals._order_one_coordinates(order) == expected_one
    assert prime_ideals._modular_table(order, 7) == [
        [[int(value) % 7 for value in product] for product in left]
        for left in expected_table
    ]
finally:
    order_type.basis_matrix = original_basis_matrix

# Exact product replay starts with the first authenticated prime factor.  For
# this two-factor, exponent-one decomposition it needs exactly one HNF ideal
# product instead of separately multiplying both factors by the unit ideal.
product_calls = 0
original_ideal_product = ideal_arithmetic.ideal_product
def counted_ideal_product(left, right):
    global product_calls
    product_calls += 1
    return original_ideal_product(left, right)
ideal_arithmetic.ideal_product = counted_ideal_product
try:
    product_order = NumberField(x**3 - x**2 - 6*x - 12, "product").maximal_order()
    product_decomposition = prime_ideals.factor_rational_prime(
        product_order, 2, algorithm="finite-algebra", verify=True
    )
finally:
    ideal_arithmetic.ideal_product = original_ideal_product
assert product_calls == 1
assert product_decomposition.verify()["certified"]

# verify=False never admits the unchecked decoder and therefore exercises
# the original readable NumberFieldIdeal constructor.
unverified_order = NumberField(x**3 - x**2 - 6*x - 12, "b").maximal_order()
unverified = prime_ideals.factor_rational_prime(
    unverified_order, 2, algorithm="finite-algebra", verify=False
)
assert all(
    getattr(ideal, "_packed_candidate_pending_replay", None) is None
    for ideal in unverified.prime_ideals()
)

# A rejected packed result fails closed to that same readable constructor.
saved = prime_ideals._candidate_kernel.packed_prime_ideal_candidate_hnf_in_place
def rejected(*args):
    return False
prime_ideals._candidate_kernel.packed_prime_ideal_candidate_hnf_in_place = rejected
try:
    fallback_order = NumberField(x**3 - x**2 - 6*x - 12, "c").maximal_order()
    fallback = prime_ideals.factor_rational_prime(
        fallback_order, 2, algorithm="finite-algebra", verify=True
    )
finally:
    prime_ideals._candidate_kernel.packed_prime_ideal_candidate_hnf_in_place = saved
assert fallback.splitting_record() == {"version": 1, "prime": 2, "factors": [{"e": 1, "f": 1}, {"e": 1, "f": 2}]}

# A successful-looking corrupt HNF cannot survive the unchanged replay.
def corrupt(output, source, workspace, basis, subspace, prime, degree, rows):
    for index in range(len(output)):
        output[index] = 0
    for index in range(degree):
        output[index * degree + index] = 1
    return True
prime_ideals._candidate_kernel.packed_prime_ideal_candidate_hnf_in_place = corrupt
try:
    corrupt_order = NumberField(x**3 - x**2 - 6*x - 12, "d").maximal_order()
    rejected = False
    try:
        prime_ideals.factor_rational_prime(
            corrupt_order, 2, algorithm="finite-algebra", verify=True
        )
    except (ArithmeticError, ValueError):
        rejected = True
    assert rejected
    # Selective Dedekind--Kummer construction has no later full decomposition
    # replay, so its containment/norm/quotient checks reject the same output.
    selective_order = NumberField(x**3 + 2*x + 1, "selective").maximal_order()
    selective_plan = factor_bases.factor_base_plan(
        selective_order, proof=True, theorem="minkowski"
    )
    rejected = False
    try:
        factor_bases.build_factor_base(selective_plan)
    except (ArithmeticError, ValueError):
        rejected = True
    assert rejected
finally:
    prime_ideals._candidate_kernel.packed_prime_ideal_candidate_hnf_in_place = saved
print(hashlib.sha256(encoded).hexdigest())
`);
  assert.equal(
    output,
    "2262d9dce3278741e3b73e9d95eb70a2d81c2b86cc3436198cda58efcbfc5456",
  );
});

test("maximal-order tables reuse the packed exact BL kernel", () => {
  const output = run(sagejs, ["--python", "-"], String.raw`
from sagejs.number_fields import maximal_order

R = PolynomialRing(QQ, "x")
x = R.gen()
polynomials = [
    x**2 - 5,
    x**3 - x**2 - 6*x - 12,
    x**3 + QQ(1, 2) * x + 1,
    x**4 + x + 1,
    x**5 + x**3 - x**2 + 4*x + 1,
]
discriminants = []
for index, polynomial in enumerate(polynomials):
    order = NumberField(polynomial, "t" + str(index)).maximal_order()
    readable = maximal_order._nf_order_multiplication_table_reference(order)
    packed = maximal_order._nf_order_multiplication_table_packed(order)
    assert [
        [[int(value) for value in product] for product in left]
        for left in readable
    ] == packed
    discriminants.append(int(order.discriminant()))

# The public identity-keyed cache stores an immutable snapshot, calls the
# packed producer only once, and returns a fresh nested list to each consumer.
order = NumberField(polynomials[1], "cached").maximal_order()
maximal_order._order_multiplication_table_cache[:] = [
    pair for pair in maximal_order._order_multiplication_table_cache
    if pair[0] is not order
]
calls = []
original = maximal_order._nf_order_multiplication_table_packed
def counted(current):
    calls.append(current)
    return original(current)
maximal_order._nf_order_multiplication_table_packed = counted
try:
    first = maximal_order._nf_order_multiplication_table(order)
    second = maximal_order._nf_order_multiplication_table(order)
finally:
    maximal_order._nf_order_multiplication_table_packed = original
assert calls == [order]
assert first == second and first is not second
first[0][0][0] += 1
assert maximal_order._nf_order_multiplication_table(order) == second

# A rejected or unavailable packed boundary keeps the original exact field-
# arithmetic implementation as a capability fallback.
fallback_order = NumberField(polynomials[1], "fallback_table").maximal_order()
maximal_order._order_multiplication_table_cache[:] = [
    pair for pair in maximal_order._order_multiplication_table_cache
    if pair[0] is not fallback_order
]
def unavailable(_order):
    raise OverflowError("forced packed fallback")
maximal_order._nf_order_multiplication_table_packed = unavailable
try:
    fallback = maximal_order._nf_order_multiplication_table(fallback_order)
finally:
    maximal_order._nf_order_multiplication_table_packed = original
assert fallback == maximal_order._nf_order_multiplication_table_reference(
    fallback_order
)
print(discriminants)
`);
  assert.equal(output, "[5, -1083, -440, 229, 380452]");
});

test("production inventory names the isolated candidate kernel", () => {
  const manifest = require("../architecture/native-kernels.json");
  const record = manifest.kernels.find((entry) =>
    entry.id === "prime-ideal-candidate-materializer-production"
  );
  assert.equal(
    record?.source,
    "src/lib/sagejs/number_fields/bl_composite_kernel.py",
  );
  assert.deepEqual(record?.functions, [
    "packed_prime_ideal_candidate_hnf_in_place",
  ]);
  const expected = createHash("sha256")
    .update(require("node:fs").readFileSync(join(root, record.source)))
    .digest("hex");
  assert.equal(expected.length, 64);
});
