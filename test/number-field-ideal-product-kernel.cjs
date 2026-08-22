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
from sagejs.number_fields.bl_composite_kernel import packed_ideal_product_hnf_in_place

packed = packed_ideal_product_hnf_in_place
dynamic = getattr(packed, "__sagejs_native_source__", packed)
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
    `${kernelDifferential}\nfrom sagejs.native import is_compiled\nprint(is_compiled(packed))\n`,
  );
  assert.equal(output, "True");
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
    fractional = primes[0] / O.ideal(2)
    readable_fractional_integral = all(element in O for element in fractional.basis())
    assert fractional.is_integral() == readable_fractional_integral
    assert fractional.is_integral() == readable_fractional_integral

saved = ideals._ideal_product_kernel_override
ideals._ideal_product_kernel_override = lambda *args: False
try:
    left, right = primes[0], primes[-1]
    assert left * right == ideals._readable_ideal_product(left, right)
finally:
    ideals._ideal_product_kernel_override = saved
print("ideal-product-kernel-ok")
`);
  assert.equal(output, "ideal-product-kernel-ok");
});
