#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const helperPath = join(
  root,
  "src/lib/sagejs/polynomial_algorithms/cyclotomic_core.py",
);
const helperSource = readFileSync(helperPath, "utf8");

function runCombined(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-cyclotomic-poly-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, `${helperSource}\n${source}\n`);
    const result = spawnSync(process.execPath, [join(root, "bin/sagejs"), filename], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...environment },
      timeout: 120_000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const exactWitness = String.raw`
sage_oracles = {
    5: {
        "polynomial": "x^4 + (2*zeta5^2 - 2*zeta5 - 1)*x^3 + (-5*zeta5^3 - 2*zeta5^2 - 1)*x^2 + (zeta5^3 - zeta5^2 - zeta5 - 3)*x + zeta5 + 1",
        "derivative": "4*x^3 + (6*zeta5^2 - 6*zeta5 - 3)*x^2 + (-10*zeta5^3 - 4*zeta5^2 - 2)*x + zeta5^3 - zeta5^2 - zeta5 - 3",
        "quotient": "x^2 + (2*zeta5^2 - 3*zeta5 - 1)*x - 7*zeta5^3 + zeta5^2 + zeta5 - 2",
        "remainder": "(-7*zeta5^3 - 11*zeta5^2 - 3*zeta5 - 9)*x + 7*zeta5^3 - zeta5^2 + 3",
        "gcd": "x^2 + (zeta5^2 - zeta5)*x - zeta5^3",
        "coordinates": [
            ["1", "1"],
            ["-3", "-1", "-1", "1"],
            ["-1", "0", "-2", "-5"],
            ["-1", "-2", "2"],
            ["1"],
        ],
    },
    12: {
        "polynomial": "x^4 + (2*zeta12^2 - 2*zeta12 - 1)*x^3 + (-4*zeta12^3 + zeta12 - 1)*x^2 + (zeta12^2 + 2*zeta12 - 1)*x + zeta12^3 - zeta12 - 1",
        "derivative": "4*x^3 + (6*zeta12^2 - 6*zeta12 - 3)*x^2 + (-8*zeta12^3 + 2*zeta12 - 2)*x + zeta12^2 + 2*zeta12 - 1",
        "quotient": "x^2 + (2*zeta12^2 - 3*zeta12 - 1)*x - 6*zeta12^3 + 3*zeta12^2 + 2*zeta12 - 2",
        "remainder": "(-3*zeta12^3 + 3*zeta12^2 + 7*zeta12 - 6)*x + 7*zeta12^3 - 3*zeta12^2 - 3*zeta12 + 1",
        "gcd": "x^2 + (zeta12^2 - zeta12)*x - zeta12^3",
        "coordinates": [
            ["-1", "-1", "0", "1"],
            ["-1", "2", "1"],
            ["-1", "1", "0", "-4"],
            ["-1", "-2", "2"],
            ["1"],
        ],
    },
}

def polynomial(parent, generator, coefficients):
    answer = parent(0)
    for coefficient in reversed(coefficients):
        answer = answer*generator + coefficient
    return answer

def assert_raises(exception, operation):
    try:
        operation()
    except exception:
        return
    raise AssertionError("expected " + str(exception))

for order in [5, 12]:
    field = CyclotomicField(order)
    zeta = field.gen()
    ring = PolynomialRing(field, "x")
    x = ring.gen()
    zero = field.zero()
    one = field.one()
    value = (x-zeta)*(x-(zeta+1))*(x+zeta**2)**2
    coefficients = dense_construct(value.list() + [zero, zero], field)
    assert polynomial(ring, x, coefficients) == value
    assert dense_format(coefficients, "x", zero, one) == sage_oracles[order]["polynomial"]
    assert repr(value) == sage_oracles[order]["polynomial"]

    derivative = dense_derivative(coefficients, zero)
    assert dense_format(derivative, "x", zero, one) == sage_oracles[order]["derivative"]
    assert polynomial(ring, x, derivative) == sum(
        coefficients[index]*index*x**(index-1)
        for index in range(1, len(coefficients))
    )

    divisor = x**2 + zeta*x + 1
    quotient, remainder = dense_divrem(coefficients, divisor.list(), zero)
    assert dense_format(quotient, "x", zero, one) == sage_oracles[order]["quotient"]
    assert dense_format(remainder, "x", zero, one) == sage_oracles[order]["remainder"]
    assert polynomial(ring, x, quotient)*divisor + polynomial(ring, x, remainder) == value
    assert len(remainder) < len(divisor.list())

    common = (x-zeta)*(x+zeta**2)
    right = common*(x+2)
    gcd = dense_gcd(coefficients, right.list(), zero)
    assert dense_format(gcd, "x", zero, one) == sage_oracles[order]["gcd"]
    assert polynomial(ring, x, gcd) == common
    extended_gcd, left_coefficient, right_coefficient = dense_xgcd(
        coefficients, right.list(), zero, one
    )
    bezout = dense_add(
        dense_multiply(left_coefficient, coefficients, zero),
        dense_multiply(right_coefficient, right.list(), zero),
        zero,
    )
    assert bezout == extended_gcd == gcd

    factors = [
        ([-zeta, one], 1),
        ([-(zeta+1), one], 1),
        ([zeta**2, one], 2),
    ]
    reconstructed = [one]
    for factor, multiplicity in factors:
        for _repeat in range(multiplicity):
            reconstructed = dense_multiply(reconstructed, factor, zero)
    assert reconstructed == coefficients
    assert dense_roots_from_factorization(factors, zero) == [
        (zeta, 1), (zeta+1, 1), (-zeta**2, 2)
    ]
    assert dense_roots_in_candidates(
        coefficients, [zeta+1, zeta, -zeta**2, field(99)], zero, one
    ) == [(zeta+1, 1), (zeta, 1), (-zeta**2, 2)]
    assert_raises(
        ValueError,
        lambda: dense_roots_from_factorization([([one, zero, one], 1)], zero),
    )

    payload = dense_serialization_payload(
        order,
        "x",
        coefficients,
        zero,
        field._serialization_coefficients,
    )
    coordinates = [[str(item) for item in row] for row in payload["coefficients"]]
    assert coordinates == sage_oracles[order]["coordinates"]
    decoded = dense_deserialize_payload(
        payload, order, "x", zero, field._from_coefficients
    )
    assert decoded == coefficients
    assert_raises(
        ValueError,
        lambda: dense_deserialize_payload(
            payload, order+1, "x", zero, field._from_coefficients
        ),
    )
    assert_raises(
        ZeroDivisionError,
        lambda: dense_divrem(coefficients, [], zero),
    )

print("cyclotomic-field-polynomial-ok")
`;

test("cyclotomic dense helpers agree with Sage for orders 5 and 12", () => {
  assert.equal(runCombined(exactWitness), "cyclotomic-field-polynomial-ok");
});

test("cyclotomic helpers remain ordinary CPython-parseable exact Python", () => {
  const program = String.raw`
import sys
from fractions import Fraction
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
from sagejs.polynomial_algorithms.cyclotomic_core import (
    dense_add,
    dense_derivative,
    dense_divrem,
    dense_gcd,
    dense_multiply,
    dense_xgcd,
)
zero = Fraction(0)
one = Fraction(1)
left = [Fraction(2), Fraction(-3), Fraction(1)]
right = [Fraction(-1), Fraction(1)]
quotient, remainder = dense_divrem(left, right, zero)
assert quotient == [Fraction(-2), Fraction(1)] and remainder == []
assert dense_derivative(left, zero) == [Fraction(-3), Fraction(2)]
assert dense_gcd(left, right, zero) == right
gcd, s, t = dense_xgcd(left, right, zero, one)
assert dense_add(dense_multiply(s, left, zero), dense_multiply(t, right, zero), zero) == gcd
print("cpython-cyclotomic-core-ok")
`;
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(python, ["-I", "-c", program], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "cpython-cyclotomic-core-ok");
});
