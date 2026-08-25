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
from sagejs.native import integer_buffer_values, kernel_integer_buffer, kernel_integer_zeros
from sagejs.number_fields.bl_composite_kernel import (
    packed_ideal_power_chain_hnf_in_place,
    packed_ideal_power_chains_hnf_in_place,
    packed_ideal_product_hnf_in_place,
)

packed = packed_ideal_product_hnf_in_place
dynamic = getattr(packed, "__sagejs_native_source__", packed)
power_chain = packed_ideal_power_chain_hnf_in_place
dynamic_power_chain = getattr(power_chain, "__sagejs_native_source__", power_chain)
power_chains = packed_ideal_power_chains_hnf_in_place
dynamic_power_chains = getattr(power_chains, "__sagejs_native_source__", power_chains)
left = [2, 0, 0, 1]
right = [3, 0, 0, 1]
# Multiplication in the power basis of x^2 - 2.
tensor = [1, 0, 0, 1, 0, 1, 2, 0]

def outcome(function):
    output = kernel_integer_zeros(function, 8, 32)
    source = kernel_integer_zeros(function, 8, 32)
    workspace = kernel_integer_zeros(function, 4, 32)
    assert function(
        output,
        source,
        workspace,
        kernel_integer_buffer(function, left),
        kernel_integer_buffer(function, right),
        kernel_integer_buffer(function, tensor),
        2,
    )
    return [int(value) for value in integer_buffer_values(output)[:4]]

assert outcome(dynamic) == [2, 0, 0, 1]
assert outcome(packed) == [2, 0, 0, 1]
for function in (dynamic, packed):
    assert not function(
        kernel_integer_zeros(function, 8, 32),
        kernel_integer_zeros(function, 8, 32),
        kernel_integer_zeros(function, 4, 32),
        kernel_integer_buffer(function, left[:-1]),
        kernel_integer_buffer(function, right),
        kernel_integer_buffer(function, tensor),
        2,
    )

def power_outcome(function):
    powers = kernel_integer_zeros(function, 12, 32)
    assert function(
        powers,
        kernel_integer_zeros(function, 8, 32),
        kernel_integer_zeros(function, 8, 32),
        kernel_integer_zeros(function, 4, 32),
        kernel_integer_buffer(function, left),
        kernel_integer_buffer(function, tensor),
        2,
        3,
    )
    return [int(value) for value in integer_buffer_values(powers)]

expected_powers = [2, 0, 0, 1, 2, 0, 0, 2, 4, 0, 0, 2]
assert power_outcome(dynamic_power_chain) == expected_powers
assert power_outcome(power_chain) == expected_powers
for function in (dynamic_power_chain, power_chain):
    assert not function(
        kernel_integer_zeros(function, 8, 32),
        kernel_integer_zeros(function, 8, 32),
        kernel_integer_zeros(function, 8, 32),
        kernel_integer_zeros(function, 4, 32),
        kernel_integer_buffer(function, left),
        kernel_integer_buffer(function, tensor),
        2,
        3,
    )

def batched_power_outcome(function):
    powers = kernel_integer_zeros(function, 20, 32)
    assert function(
        powers,
        kernel_integer_zeros(function, 8, 32),
        kernel_integer_zeros(function, 8, 32),
        kernel_integer_zeros(function, 4, 32),
        kernel_integer_buffer(function, left + right),
        kernel_integer_buffer(function, [0, 3, 5]),
        kernel_integer_buffer(function, tensor),
        2,
        2,
        5,
    )
    return [int(value) for value in integer_buffer_values(powers)]

expected_batched_powers = power_outcome(dynamic_power_chain) + [
    3, 0, 0, 1, 1, 0, 0, 3
]
assert batched_power_outcome(dynamic_power_chains) == expected_batched_powers
assert batched_power_outcome(power_chains) == expected_batched_powers
for function in (dynamic_power_chains, power_chains):
    assert not function(
        kernel_integer_zeros(function, 20, 32),
        kernel_integer_zeros(function, 8, 32),
        kernel_integer_zeros(function, 8, 32),
        kernel_integer_zeros(function, 4, 32),
        kernel_integer_buffer(function, left + right),
        kernel_integer_buffer(function, [0, 3, 4]),
        kernel_integer_buffer(function, tensor),
        2,
        2,
        5,
    )
`;

test("ideal-product HNF source matches in CPython and compiled Sage.js", () => {
  run(
    pythonExecutable(),
    ["-c", `import sys; sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})\n${kernelDifferential}`],
    "",
  );
  const output = run(
    sagejs,
    ["--python", "-"],
    `${kernelDifferential}\nfrom sagejs.native import is_compiled\nprint(is_compiled(packed), is_compiled(power_chain), is_compiled(power_chains))\n`,
  );
  assert.equal(output, "True True True");
});

test("packed ideal products agree with the readable exact lattice oracle", () => {
  const output = run(sagejs, ["--python", "-"], String.raw`
import sagejs.number_fields.ideal_arithmetic as ideals

R = PolynomialRing(QQ, "x")
x = R.gen()
for polynomial in (x**2 - 5, x**3 + 4*x - 1, x**4 - x + 1):
    K = NumberField(polynomial, "a")
    O = K.maximal_order()
    primes = []
    for rational_prime in (2, 3, 5):
        primes.extend(P for P, _exponent in O.factor_rational_prime(rational_prime))
    for left in primes:
        for right in primes:
            expected = ideals._readable_ideal_product(left, right)
            actual = left * right
            assert actual == expected
            assert actual.norm() == left.norm() * right.norm()
            readable_integral = all(element in O for element in actual.basis())
            assert actual.is_integral() == readable_integral
            assert actual.is_integral() == readable_integral
    for prime_ideal in primes:
        prefix_powers = ideals.ensure_valuation_powers(prime_ideal, 2)
        packed_powers = ideals.ensure_valuation_powers(prime_ideal, 6)
        assert tuple(prefix_powers) == tuple(packed_powers[:2])
        readable_powers = [prime_ideal]
        for _exponent in range(5):
            readable_powers.append(
                ideals._readable_ideal_product(readable_powers[-1], prime_ideal)
            )
        assert tuple(packed_powers) == tuple(readable_powers)
    fractional = primes[0] / O.ideal(2)
    readable_fractional_integral = all(element in O for element in fractional.basis())
    assert fractional.is_integral() == readable_fractional_integral
    assert fractional.is_integral() == readable_fractional_integral

specifications = tuple(
    (*ideals._packed_ideal_basis(prime_ideal), maximum)
    for prime_ideal, maximum in ((primes[0], 3), (primes[-1], 2))
)
expected_chains = tuple(
    ideals.packed_ideal_power_bases_from_basis(K, basis, denominator, maximum)
    for basis, denominator, maximum in specifications
)
assert ideals.packed_ideal_power_basis_chains_from_bases(
    K, specifications
) == expected_chains
saved_chains = ideals._ideal_power_chains_kernel_override
ideals._ideal_power_chains_kernel_override = False
try:
    assert ideals.packed_ideal_power_basis_chains_from_bases(
        K, specifications
    ) is None
finally:
    ideals._ideal_power_chains_kernel_override = saved_chains

saved = ideals._ideal_product_kernel_override
ideals._ideal_product_kernel_override = lambda *args: False
try:
    left, right = primes[0], primes[-1]
    assert left * right == ideals._readable_ideal_product(left, right)
finally:
    ideals._ideal_product_kernel_override = saved

saved_chain = ideals._ideal_power_chain_kernel_override
ideals._ideal_power_chain_kernel_override = False
try:
    K = NumberField(x**3 + 4*x - 1, "fallback")
    O = K.maximal_order()
    prime_ideal = O.factor_rational_prime(3).prime_ideals()[0]
    fallback_powers = ideals.ensure_valuation_powers(prime_ideal, 5)
    readable_powers = [prime_ideal]
    for _exponent in range(4):
        readable_powers.append(
            ideals._readable_ideal_product(readable_powers[-1], prime_ideal)
        )
    assert tuple(fallback_powers) == tuple(readable_powers)
finally:
    ideals._ideal_power_chain_kernel_override = saved_chain

called = []
def unexpected_power_chain(*_args):
    called.append(True)
    return True
saved_chain = ideals._ideal_power_chain_kernel_override
ideals._ideal_power_chain_kernel_override = unexpected_power_chain
try:
    huge = O.ideal(1 << 20000)
    assert ideals._compute_packed_ideal_power_bases(huge, 2) is None
    assert called == []
finally:
    ideals._ideal_power_chain_kernel_override = saved_chain
print("ideal-product-kernel-ok")
`);
  assert.equal(output, "ideal-product-kernel-ok");
});
