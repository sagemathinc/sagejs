#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const sagejs = resolve(root, "bin", "sagejs");

function run(source, environment = {}) {
  const result = spawnSync(process.execPath, [sagejs, "--python"], {
    cwd: root,
    encoding: "utf8",
    input: source,
    env: {
      ...process.env,
      SAGEJS_FORBID_POLYNOMIAL_NAPI: "1",
      ...environment,
    },
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stderr, /forbidden legacy mathematical N-API/);
  return result.stdout.trim().split("\n");
}

const source = String.raw`
from sagejs.kernels.polynomial.packed_flint import (
    flint_packed_prime_field_polynomial_add,
    flint_packed_prime_field_polynomial_derivative,
    flint_packed_prime_field_polynomial_equal,
    flint_packed_prime_field_polynomial_evaluate,
    flint_packed_prime_field_polynomial_negate,
    flint_packed_prime_field_polynomial_subtract,
    flint_packed_prime_field_polynomial_xgcd,
)
from sagejs.native import is_compiled

p = 2305843009213693951
R = PolynomialRing(GF(p), "x")
x = R.gen()
f = (p - 1)*x**5 + (p - 2)*x**3 + 7*x + 3
g = (p - 3)*x**3 + 5*x + 11

# These values were independently computed by SageMath 10.9.post30.
assert str(f) == "2305843009213693950*x^5 + 2305843009213693949*x^3 + 7*x + 3"
expected_coefficients = [
    GF(p)(3),
    GF(p)(7),
    GF(p)(0),
    GF(p)(p - 2),
    GF(p)(0),
    GF(p)(p - 1),
]
assert f.coefficients(sparse=False) == expected_coefficients
assert list(f) == expected_coefficients
assert not hasattr(f, "_native")
assert not hasattr(g, "_native")
assert str(f + g) == "2305843009213693950*x^5 + 2305843009213693946*x^3 + 12*x + 14"
assert str(f - g) == "2305843009213693950*x^5 + x^3 + 2*x + 2305843009213693943"
assert str(-f) == "x^5 + 2*x^3 + 2305843009213693944*x + 2305843009213693948"

product = f*g
assert str(product) == "3*x^8 + x^6 + 2305843009213693940*x^5 + 2305843009213693920*x^4 + 2305843009213693920*x^3 + 35*x^2 + 92*x + 33"
quotient, remainder = product.quo_rem(f)
assert quotient == g and remainder == 0
assert product // f == g and product % f == 0
assert product.gcd(f) == -f

h, s, t = f.xgcd(g)
assert h == R(1)
assert s*f + t*g == h
assert str(s) == "1924270291200523120*x^2 + 1646449992100802675*x + 165525171599558927"
assert str(t) == "127190906004390277*x^4 + 988412008775528409*x^3 + 411191598149578040*x^2 + 247472338836878597*x + 1002967230115435725"

assert str(f.derivative()) == "2305843009213693946*x^4 + 2305843009213693945*x^2 + 7"
assert f(123456789) == GF(p)(229423752335885116)
factorization = f.factor()
assert factorization.value() == f
assert factorization.unit() == GF(p)(p - 1)
assert sorted([factor.degree() for factor, _exponent in factorization]) == [1, 1, 3]

with_roots = (x - 7)**3 * (x + 5)
assert with_roots.roots() == [(GF(p)(p - 5), 1), (GF(p)(7), 3)]
assert loads(dumps(f)) == f
assert loads(dumps(product)) == product

# Exercise the full unsigned-word range with a prime immediately below 2^64.
q = 18446744073709551557
S = PolynomialRing(GF(q), "y")
y = S.gen()
a = (q - 1)*y**3 + (q - 2)*y + 17
b = (q - 3)*y**2 + 23
assert (a + b) - b == a
assert a*b // a == b
assert a*b % a == 0
assert a(123456789) == GF(q)(2204193661408312712)
assert loads(dumps(a)) == a

compiled = [
    flint_packed_prime_field_polynomial_add,
    flint_packed_prime_field_polynomial_subtract,
    flint_packed_prime_field_polynomial_negate,
    flint_packed_prime_field_polynomial_equal,
    flint_packed_prime_field_polynomial_derivative,
    flint_packed_prime_field_polynomial_evaluate,
    flint_packed_prime_field_polynomial_xgcd,
]
print("compiled=" + str(all(is_compiled(function) for function in compiled)))
print("LARGE_PRIME_POLYNOMIAL_OK")
`;

const native = run(source, { SAGEJS_NATIVE_REQUIRED: "1" });
assert.ok(native.includes("compiled=True"), native.join("\n"));
assert.ok(native.includes("LARGE_PRIME_POLYNOMIAL_OK"), native.join("\n"));

const dynamic = run(source, { SAGEJS_NATIVE_DISABLE: "1" });
assert.ok(dynamic.includes("LARGE_PRIME_POLYNOMIAL_OK"), dynamic.join("\n"));

// Generated host adapters preserve full unsigned-word values, accept declared
// aliases, and do not publish partial output after a rejected call.
const flint = require("../packages/flint");
const modulus = 2305843009213693951n;
const left = BigUint64Array.from([modulus - 1n, modulus - 2n, 7n]);
const right = BigUint64Array.from([5n, 11n]);
assert.equal(
  flint.ffiNmodPolyAdd(left, left, right, 3n, 3n, 2n, modulus),
  true,
);
assert.deepEqual(Array.from(left), [4n, 9n, 7n]);
assert.equal(
  flint.ffiNmodPolyEqual(
    left,
    BigUint64Array.from([4n, 9n, 7n]),
    3n,
    3n,
    modulus,
  ),
  true,
);
const rejected = BigUint64Array.from([81n, 82n, 83n]);
assert.throws(
  () => flint.ffiNmodPolyDerivative(
    rejected,
    left,
    3n,
    3n,
    modulus,
  ),
  /invalid polynomial derivative/,
);
assert.deepEqual(Array.from(rejected), [81n, 82n, 83n]);
