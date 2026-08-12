#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const helperPath = join(
  root,
  "src/lib/sagejs/polynomial_algorithms/structural_calculus.py",
);
const helperSource = readFileSync(helperPath, "utf8");

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-poly-structural-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, `${helperSource}\n${source}\n`);
    const result = spawnSync(process.execPath, [join(root, "bin/sagejs"), filename], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
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

def integer_exact_quotient(numerator, denominator):
    return numerator // denominator

def field_exact_quotient(numerator, denominator):
    return numerator / denominator

# These values and edge cases were differentially recorded from Sage 10.9.
for base in [ZZ, QQ, GF(2), GF(5)]:
    ring = PolynomialRing(base, "x")
    x = ring.gen()
    zero = base(0)
    one = base(1)
    quotient = integer_exact_quotient if base is ZZ else field_exact_quotient

    outer = x**3 - base(2)*x + base(5)
    inner = x**2 + x + base(1)
    composed = dense_compose(outer.list(), inner.list(), zero)
    assert polynomial(ring, x, composed) == outer(inner)
    assert dense_compose([], inner.list(), zero) == []
    assert dense_compose([base(7)], [], zero) == [base(7)]

    value = [base(3), base(2), base(1)]
    assert dense_reverse(value + [zero, zero], zero) == [one, base(2), base(3)]
    assert dense_reverse(value, zero, 0) == [base(3)]
    assert dense_reverse(value, zero, 2) == [one, base(2), base(3)]
    assert dense_reverse(value, zero, 5) == [zero, zero, zero, one, base(2), base(3)]
    assert dense_reverse([zero, one], zero) == [one]
    assert dense_reverse([], zero, 5) == []
    assert_raises(ValueError, lambda: dense_reverse(value, zero, -1))

    assert dense_truncate(value, zero, 0) == []
    assert dense_truncate(value, zero, 1) == [base(3)]
    truncate_minus_one = [base(3)]
    if base(2) != zero:
        truncate_minus_one.append(base(2))
    assert dense_truncate(value, zero, -1) == truncate_minus_one
    assert dense_truncate(value, zero, -2) == [base(3)]
    assert dense_shift(value, zero, 2) == [zero, zero] + value
    assert dense_shift(value, zero, -1) == [base(2), one]
    assert dense_shift(value, zero, -5) == []
    assert dense_shift([], zero, 9) == []

    if base == GF(2):
        binary_value = [one, one, one]
        assert dense_resultant(
            binary_value, [one, one], zero, one, quotient
        ) == one
        assert dense_resultant([one], [one], zero, one, quotient) == one
        assert dense_discriminant(binary_value, zero, one, quotient) == one
    else:
        assert dense_resultant(
            value, [base(2), one], zero, one, quotient
        ) == base(3)
        assert dense_resultant([base(2)], [base(3)], zero, one, quotient) == one
        assert dense_resultant(
            [base(2)], [one, one], zero, one, quotient
        ) == base(2)
        assert dense_resultant(
            [one, one], [base(2)], zero, one, quotient
        ) == base(2)
        assert dense_discriminant(value, zero, one, quotient) == base(-8)
    assert dense_resultant([zero, one], [one, one], zero, one, quotient) == one
    assert dense_resultant([one, one], [zero, one], zero, one, quotient) == -one
    # The second Bareiss pivot vanishes before row exchange in this Sylvester
    # matrix; this covers signed fraction-free pivoting, not just easy diagonals.
    assert dense_resultant(
        [one, zero, one], [zero, one], zero, one, quotient
    ) == one
    assert_raises(
        ValueError,
        lambda: dense_resultant([], [one], zero, one, quotient),
    )

    assert dense_discriminant([], zero, one, quotient) == zero
    assert dense_discriminant([zero, one], zero, one, quotient) == one
    assert_raises(
        ValueError,
        lambda: dense_discriminant([one], zero, one, quotient),
    )

# Sage's signed Sylvester convention is pinned independently of equal-degree
# examples, for which accidentally swapping the two arguments is invisible.
assert dense_resultant(
    [ZZ(-4), ZZ(3)],
    [ZZ(-2), ZZ(-4), ZZ(0), ZZ(-2)],
    ZZ(0),
    ZZ(1),
    integer_exact_quotient,
) == ZZ(-326)

# Integration owns a real parent-changing boundary over ZZ: inputs are first
# coerced to QQ.  The helper therefore never guesses that widening itself.
qq_zero = QQ(0)
zz_integral = dense_integral(
    [QQ(3), QQ(2), QQ(1)],
    qq_zero,
    lambda coefficient, denominator: coefficient / QQ(denominator),
)
assert zz_integral == [QQ(0), QQ(3), QQ(1), QQ(1)/QQ(3)]

qq_integral = dense_integral(
    [QQ(3), QQ(2), QQ(1)],
    qq_zero,
    lambda coefficient, denominator: coefficient / QQ(denominator),
)
assert qq_integral == zz_integral

field2 = GF(2)
assert dense_integral(
    [field2(1), field2(0), field2(1)],
    field2(0),
    lambda coefficient, denominator: coefficient / field2(denominator),
) == [field2(0), field2(1), field2(0), field2(1)]
assert_raises(
    ZeroDivisionError,
    lambda: dense_integral(
        [field2(0), field2(1)],
        field2(0),
        lambda coefficient, denominator: coefficient / field2(denominator),
    ),
)

field5 = GF(5)
assert_raises(
    ZeroDivisionError,
    lambda: dense_integral(
        [field5(0), field5(0), field5(0), field5(0), field5(1)],
        field5(0),
        lambda coefficient, denominator: coefficient / field5(denominator),
    ),
)

# Inseparable positive-characteristic polynomials have zero derivative, so
# Sage's discriminant path reaches its zero-polynomial resultant error.
assert_raises(
    ValueError,
    lambda: dense_discriminant(
        [field2(1), field2(0), field2(1)],
        field2(0),
        field2(1),
        field_exact_quotient,
    ),
)

print("polynomial-structural-calculus-ok")
`;

test("dense structural calculus matches Sage exact-domain semantics", () => {
  assert.equal(
    runSagejs(exactWitness),
    "polynomial-structural-calculus-ok",
  );
});

test("structural calculus remains ordinary strict CPython source", () => {
  const program = String.raw`
import sys
from fractions import Fraction
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
from sagejs.polynomial_algorithms.structural_calculus import (
    dense_compose,
    dense_discriminant,
    dense_integral,
    dense_resultant,
    dense_reverse,
    dense_shift,
    dense_truncate,
)

zero = Fraction(0)
one = Fraction(1)
divide = lambda numerator, denominator: numerator / denominator
value = [Fraction(3), Fraction(2), Fraction(1)]
assert dense_compose(value, [one, one], zero) == [6*one, 4*one, one]
assert dense_reverse(value, zero, 4) == [zero, zero, one, 2*one, 3*one]
assert dense_truncate(value, zero, -1) == [3*one, 2*one]
assert dense_shift(value, zero, -1) == [2*one, one]
assert dense_integral(value, zero, lambda coefficient, n: coefficient/n) == [
    zero, 3*one, one, one/3
]
assert dense_resultant(value, [2*one, one], zero, one, divide) == 3*one
assert dense_discriminant(value, zero, one, divide) == -8*one
print("cpython-polynomial-structural-calculus-ok")
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
  assert.equal(
    result.stdout.trim(),
    "cpython-polynomial-structural-calculus-ok",
  );
});
