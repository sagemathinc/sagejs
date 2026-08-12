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
  "src/lib/sagejs/polynomial_algorithms/invariants.py",
);
const helperSource = readFileSync(helperPath, "utf8");

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-polynomial-invariants-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, `${helperSource}\n${source}\n`);
    const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
    const result = spawnSync(process.execPath, [executable, filename], {
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

function runCPython(source) {
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(python, ["-I", "-c", source], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const sageWitness = String.raw`
def count(polynomial):
    if polynomial == 0:
        return 0
    return polynomial.degree() + 1

def coefficient(polynomial, index):
    return polynomial[index]

def factors(polynomial):
    answer = polynomial.factor()
    return answer.unit(), list(answer)

def integer_content(polynomial):
    values = polynomial.list()
    if len(values) == 0:
        return ZZ(0)
    common = ZZ(0)
    for value in values:
        left = abs(common)
        right = abs(value)
        while right != 0:
            left, right = right, left % right
        common = left
    if polynomial[polynomial.degree()] < 0:
        common = -common
    return common

def integer_root(value):
    try:
        converted = ZZ(value)
    except (TypeError, ValueError):
        return False, None
    return converted == value, converted

def rational_root(value):
    return True, QQ(value)

def integer_unit_is_squarefree(value):
    remaining = abs(value)
    divisor = ZZ(2)
    while divisor*divisor <= remaining:
        if remaining % divisor == 0:
            remaining //= divisor
            if remaining % divisor == 0:
                return False
            while remaining % divisor == 0:
                remaining //= divisor
        divisor += 1
    return True

def integer_radical_unit(value):
    sign = ZZ(-1) if value < 0 else ZZ(1)
    remaining = abs(value)
    answer = sign
    divisor = ZZ(2)
    while divisor*divisor <= remaining:
        if remaining % divisor == 0:
            answer *= divisor
            while remaining % divisor == 0:
                remaining //= divisor
        divisor += 1
    if remaining > 1:
        answer *= remaining
    return answer

def roots_of_zero_over_zz():
    raise ValueError("roots of 0 are not defined")

def roots_of_zero_over_qq():
    raise NotImplementedError("root finding for this polynomial not implemented")

RZ = PolynomialRing(ZZ, "x")
x = RZ.gen()
RQ = PolynomialRing(QQ, "x")
y = RQ.gen()

zero = RZ(0)
sentinel_infinity = object()
assert polynomial_leading_coefficient(zero, ZZ(0), count, coefficient) == 0
assert polynomial_constant_coefficient(zero, ZZ(0), count, coefficient) == 0
assert polynomial_valuation(
    zero, ZZ(0), sentinel_infinity, count, coefficient
) is sentinel_infinity
assert polynomial_leading_coefficient(RZ(2), ZZ(0), count, coefficient) == 2
assert polynomial_constant_coefficient(RZ(2), ZZ(0), count, coefficient) == 2
assert polynomial_valuation(RZ(2), ZZ(0), sentinel_infinity, count, coefficient) == 0
sample = -12*x**5 + 6*x**7
assert polynomial_leading_coefficient(sample, ZZ(0), count, coefficient) == 6
assert polynomial_constant_coefficient(sample, ZZ(0), count, coefficient) == 0
assert polynomial_valuation(sample, ZZ(0), sentinel_infinity, count, coefficient) == 5

def make_monic_over_qq(polynomial, leading):
    return RQ([
        QQ(polynomial[index]) / QQ(leading)
        for index in range(polynomial.degree() + 1)
    ])

monic = polynomial_monic(2*x + 1, ZZ(0), count, coefficient, make_monic_over_qq)
assert monic == y + QQ(1)/2
assert monic.parent() == RQ
try:
    polynomial_monic(zero, ZZ(0), count, coefficient, make_monic_over_qq)
except ZeroDivisionError:
    pass
else:
    raise AssertionError("zero must not be made monic")

assert polynomial_content(-12*x**5, integer_content) == -12
assert polynomial_content(RZ(0), integer_content) == 0

def no_rational_content(_polynomial):
    raise AttributeError("QQ[x] has no content method")

try:
    polynomial_content(2*y + 1, no_rational_content)
except AttributeError:
    pass
else:
    raise AssertionError("QQ content policy must remain parent-owned")

assert polynomial_is_squarefree(
    RZ(0), lambda value: value == 0, factors, integer_unit_is_squarefree
) is False
assert polynomial_is_squarefree(
    RQ(0), lambda value: value == 0, factors, lambda _unit: True
) is False
assert polynomial_is_squarefree(
    2*x, lambda value: value == 0, factors, integer_unit_is_squarefree
) is True
assert polynomial_is_squarefree(
    4*x, lambda value: value == 0, factors, integer_unit_is_squarefree
) is False
assert polynomial_is_squarefree(
    4*y, lambda value: value == 0, factors, lambda _unit: True
) is True
assert polynomial_is_squarefree(
    RZ(1), lambda value: value == 0, factors, integer_unit_is_squarefree
) is True
assert polynomial_is_squarefree(
    RZ(2), lambda value: value == 0, factors, integer_unit_is_squarefree
) is True
assert polynomial_is_squarefree(
    RZ(4), lambda value: value == 0, factors, integer_unit_is_squarefree
) is False
assert polynomial_is_squarefree(
    RQ(4), lambda value: value == 0, factors, lambda _unit: True
) is True

decomposition = polynomial_squarefree_decomposition(
    -12*x**5,
    lambda value: value == 0,
    lambda _value: (ZZ(-12), [(x, 5)]),
    lambda: (ZZ(0), []),
)
assert decomposition == (ZZ(-12), ((x, 5),))
assert polynomial_squarefree_decomposition(
    RZ(2), lambda value: value == 0,
    lambda _value: (ZZ(2), []), lambda: (ZZ(0), []),
) == (ZZ(2), ())
zero_decomposition = polynomial_squarefree_decomposition(
    RZ(0),
    lambda value: value == 0,
    lambda _value: (_ for _ in []).throw(AssertionError("backend called for zero")),
    lambda: (ZZ(0), []),
)
assert zero_decomposition == (ZZ(0), ())

def qq_zero_decomposition():
    raise ValueError("square-free decomposition not defined for zero polynomial")

try:
    polynomial_squarefree_decomposition(
        RQ(0), lambda value: value == 0, factors, qq_zero_decomposition
    )
except ValueError:
    pass
else:
    raise AssertionError("QQ zero squarefree decomposition must fail")

integer_radical = polynomial_radical_from_factorization(
    -12*x**5,
    lambda value: value == 0,
    factors,
    integer_radical_unit,
    RZ,
    lambda left, right: left*right,
)
rational_radical = polynomial_radical_from_factorization(
    -12*y**5,
    lambda value: value == 0,
    factors,
    lambda unit: unit,
    RQ,
    lambda left, right: left*right,
)
assert integer_radical == -6*x
assert rational_radical == -12*y
assert polynomial_radical_from_factorization(
    RZ(-12), lambda value: value == 0, factors, integer_radical_unit, RZ,
    lambda left, right: left*right,
) == -6
assert polynomial_radical_from_factorization(
    RQ(-12), lambda value: value == 0, factors, lambda unit: unit, RQ,
    lambda left, right: left*right,
) == -12
for ring in [RZ, RQ]:
    try:
        polynomial_radical_from_factorization(
            ring(0), lambda value: value == 0, factors, lambda unit: unit, ring,
            lambda left, right: left*right,
        )
    except ZeroDivisionError:
        pass
    else:
        raise AssertionError("radical(0) must fail")

root_polynomial_z = (2*x - 1)*(x - 2)**2*(x + 3)
roots_z = polynomial_default_roots_from_factorization(
    root_polynomial_z, ZZ(0), count, coefficient, factors,
    lambda factor: factor.degree(),
    lambda factor: QQ(-factor[0])/QQ(factor[1]),
    integer_root,
    roots_of_zero_over_zz,
)
assert roots_z == [(ZZ(-3), 1), (ZZ(2), 2)]
assert polynomial_default_roots_from_factorization(
    root_polynomial_z, ZZ(0), count, coefficient, factors,
    lambda factor: factor.degree(),
    lambda factor: QQ(-factor[0])/QQ(factor[1]),
    integer_root,
    roots_of_zero_over_zz,
    False,
) == [ZZ(-3), ZZ(2)]

root_polynomial_q = RQ(root_polynomial_z)
roots_q = polynomial_default_roots_from_factorization(
    root_polynomial_q, QQ(0), count, coefficient, factors,
    lambda factor: factor.degree(),
    lambda factor: QQ(-factor[0])/QQ(factor[1]),
    rational_root,
    roots_of_zero_over_qq,
)
assert roots_q == [(QQ(1)/2, 1), (QQ(-3), 1), (QQ(2), 2)]

for polynomial, base_zero, zero_handler in [
    (RZ(0), ZZ(0), roots_of_zero_over_zz),
    (RQ(0), QQ(0), roots_of_zero_over_qq),
]:
    try:
        polynomial_default_roots_from_factorization(
            polynomial, base_zero, count, coefficient, factors,
            lambda factor: factor.degree(),
            lambda factor: QQ(-factor[0])/QQ(factor[1]),
            rational_root,
            zero_handler,
        )
    except (ValueError, NotImplementedError):
        pass
    else:
        raise AssertionError("zero roots must use the parent error policy")

def constants_do_not_factor(_polynomial):
    raise AssertionError("constant roots must not invoke factorization")

assert polynomial_default_roots_from_factorization(
    RZ(2), ZZ(0), count, coefficient, constants_do_not_factor,
    lambda factor: factor.degree(),
    lambda factor: QQ(-factor[0])/QQ(factor[1]),
    integer_root,
    roots_of_zero_over_zz,
) == []

try:
    checked_factorization(1, [(x, 0)])
except ValueError:
    pass
else:
    raise AssertionError("zero multiplicity must be rejected")

print("sagejs-polynomial-invariants-ok")
`;

test("contracts reproduce Sage 10.9 exact ZZ/QQ edge semantics in Sage.js", () => {
  assert.equal(runSagejs(sageWitness), "sagejs-polynomial-invariants-ok");
});

test("the same contract source runs as ordinary CPython", () => {
  const program = String.raw`
import math
import sys
from fractions import Fraction

sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
from sagejs.polynomial_algorithms.invariants import (
    checked_factorization,
    polynomial_constant_coefficient,
    polynomial_content,
    polynomial_default_roots_from_factorization,
    polynomial_is_squarefree,
    polynomial_leading_coefficient,
    polynomial_monic,
    polynomial_radical_from_factorization,
    polynomial_squarefree_decomposition,
    polynomial_valuation,
)

def count(polynomial):
    return len(polynomial)

def coefficient(polynomial, index):
    return polynomial[index]

def normalize(polynomial):
    answer = list(polynomial)
    while answer and answer[-1] == 0:
        answer.pop()
    return answer

def multiply(left, right):
    if not left or not right:
        return []
    answer = [Fraction(0) for _index in range(len(left) + len(right) - 1)]
    for left_index, left_value in enumerate(left):
        for right_index, right_value in enumerate(right):
            answer[left_index + right_index] += left_value*right_value
    return normalize(answer)

zero = []
trailing = [0, 0, 7, 0, 0]
constant = [Fraction(2)]
assert polynomial_leading_coefficient(trailing, 0, count, coefficient) == 7
assert polynomial_constant_coefficient(trailing, 0, count, coefficient) == 0
assert polynomial_valuation(trailing, 0, math.inf, count, coefficient) == 2
assert polynomial_valuation(zero, 0, math.inf, count, coefficient) == math.inf
assert polynomial_leading_coefficient(constant, 0, count, coefficient) == 2
assert polynomial_constant_coefficient(constant, 0, count, coefficient) == 2
assert polynomial_valuation(constant, 0, math.inf, count, coefficient) == 0

source = [Fraction(1), Fraction(2)]
monic = polynomial_monic(
    source, Fraction(0), count, coefficient,
    lambda polynomial, leading: [value/leading for value in polynomial],
)
assert monic == [Fraction(1, 2), Fraction(1)]
assert polynomial_content([0, -12], lambda _polynomial: -12) == -12

zz_factors = lambda _polynomial: (
    -1,
    [([Fraction(3)], 1), ([Fraction(2)], 2), ([0, Fraction(1)], 5)],
)
qq_factors = lambda _polynomial: (-12, [([0, Fraction(1)], 5)])
assert polynomial_is_squarefree(
    [], lambda polynomial: not polynomial, zz_factors, lambda _unit: True
) is False
assert polynomial_is_squarefree(
    [0, 4], lambda polynomial: not polynomial, zz_factors, lambda _unit: False
) is False
assert polynomial_is_squarefree(
    [0, 4], lambda polynomial: not polynomial,
    lambda _polynomial: (4, [([0, Fraction(1)], 1)]),
    lambda _unit: True,
) is True

assert polynomial_squarefree_decomposition(
    [0, -12], lambda polynomial: not polynomial,
    lambda _polynomial: (-12, [([0, Fraction(1)], 5)]),
    lambda: (0, []),
) == (-12, (([0, Fraction(1)], 5),))
assert polynomial_squarefree_decomposition(
    [], lambda polynomial: not polynomial,
    lambda _polynomial: (_ for _ in ()).throw(AssertionError()),
    lambda: (0, []),
) == (0, ())

integer_radical = polynomial_radical_from_factorization(
    [0, -12], lambda polynomial: not polynomial,
    lambda _polynomial: (-12, [([0, Fraction(1)], 5)]),
    lambda _unit: -6,
    lambda unit: [Fraction(unit)], multiply,
)
rational_radical = polynomial_radical_from_factorization(
    [0, -12], lambda polynomial: not polynomial, qq_factors,
    lambda unit: unit,
    lambda unit: [Fraction(unit)], multiply,
)
assert integer_radical == [Fraction(0), Fraction(-6)]
assert rational_radical == [Fraction(0), Fraction(-12)]
try:
    polynomial_radical_from_factorization(
        [], lambda polynomial: not polynomial, zz_factors,
        lambda unit: unit,
        lambda unit: [unit], multiply,
    )
except ZeroDivisionError:
    pass
else:
    raise AssertionError("radical(0) must fail")

linear_factors = lambda _polynomial: (
    Fraction(2),
    [
        ([Fraction(-1), Fraction(2)], 1),
        ([Fraction(3), Fraction(1)], 1),
        ([Fraction(-2), Fraction(1)], 2),
        ([Fraction(1), Fraction(0), Fraction(1)], 1),
    ],
)
linear_root = lambda factor: -factor[0]/factor[1]
integer_root = lambda root: (
    root.denominator == 1,
    int(root) if root.denominator == 1 else None,
)
rational_root = lambda root: (True, root)
zero_error = lambda: (_ for _ in ()).throw(ValueError("roots of 0 are not defined"))

source = [Fraction(-12), Fraction(32), Fraction(-15), Fraction(-3), Fraction(2)]
assert polynomial_default_roots_from_factorization(
    source, Fraction(0), count, coefficient, linear_factors,
    lambda factor: len(normalize(factor)) - 1,
    linear_root, integer_root, zero_error,
) == [(-3, 1), (2, 2)]
assert polynomial_default_roots_from_factorization(
    source, Fraction(0), count, coefficient, linear_factors,
    lambda factor: len(normalize(factor)) - 1,
    linear_root, rational_root, zero_error,
) == [(Fraction(1, 2), 1), (Fraction(-3), 1), (Fraction(2), 2)]
assert polynomial_default_roots_from_factorization(
    [Fraction(2)], Fraction(0), count, coefficient,
    lambda _polynomial: (_ for _ in ()).throw(AssertionError()),
    lambda factor: len(factor) - 1, linear_root, rational_root, zero_error,
) == []

try:
    checked_factorization(1, [([1], -1)])
except ValueError:
    pass
else:
    raise AssertionError("negative multiplicity must be rejected")

print("cpython-polynomial-invariants-ok")
`;
  assert.equal(runCPython(program), "cpython-polynomial-invariants-ok");
});
