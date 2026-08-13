#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const source = String.raw`
from fractions import Fraction
from importlib.util import module_from_spec, spec_from_file_location
from math import isqrt
from pathlib import Path
import sys
import tracemalloc

path = Path("src/lib/sagejs/linear_algebra/decompositions.py")
spec = spec_from_file_location("sagejs_linear_decomposition_contract", path)
assert spec is not None and spec.loader is not None
module = module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

Matrix = module.ExactMatrixData
exact_lu = module.exact_lu
exact_qr = module.exact_qr
gram_schmidt_rows = module.gram_schmidt_rows
ZERO = Fraction(0)
ONE = Fraction(1)


def rational_matrix(rows, *, ncols=None):
    return Matrix.from_rows(
        [[Fraction(value) for value in row] for row in rows],
        zero=ZERO,
        one=ONE,
        ncols=ncols,
    )


def rational_zero(nrows, ncols):
    return Matrix.zero_matrix(nrows, ncols, zero=ZERO, one=ONE)


def rational_sqrt(value):
    numerator = isqrt(value.numerator)
    denominator = isqrt(value.denominator)
    if (
        numerator * numerator != value.numerator
        or denominator * denominator != value.denominator
    ):
        raise TypeError(
            "exact QR decomposition requires square roots outside Rational Field"
        )
    return Fraction(numerator, denominator)


def shape(matrix):
    return matrix.nrows, matrix.ncols


def dot(left, right):
    return sum((a * b for a, b in zip(left, right)), Fraction(0))


def assert_orthogonal_rows(matrix, unit=False):
    for left in range(matrix.nrows):
        for right in range(matrix.nrows):
            value = dot(matrix.row(left), matrix.row(right))
            if left == right:
                assert value != 0
                if unit:
                    assert value == 1
            else:
                assert value == 0


def assert_orthonormal_columns(matrix):
    for left in range(matrix.ncols):
        for right in range(matrix.ncols):
            value = dot(matrix.column(left), matrix.column(right))
            assert value == (1 if left == right else 0)


# This rectangular partial-pivot factorization is copied from Sage 10.9.
a = rational_matrix([[0, 2, 1], [3, 4, 5], [6, 7, 8], [0, 1, 0]])
p, l, u = exact_lu(a)
assert shape(p) == (4, 4)
assert shape(l) == (4, 4)
assert shape(u) == (4, 3)
assert p.multiply(l).multiply(u) == a
assert p.entries == tuple(map(Fraction, [
    0, 1, 0, 0,
    0, 0, 1, 0,
    1, 0, 0, 0,
    0, 0, 0, 1,
]))
assert l.entries == tuple(map(Fraction, [
    1, 0, 0, 0,
    0, 1, 0, 0,
    Fraction(1, 2), Fraction(1, 4), 1, 0,
    0, Fraction(1, 2), Fraction(-2, 3), 1,
]))
assert u.entries == tuple(map(Fraction, [
    6, 7, 8,
    0, 2, 1,
    0, 0, Fraction(3, 4),
    0, 0, 0,
]))

# Singular LU remains a valid decomposition and does not pretend U has rank.
singular = rational_matrix([[1, 2, 3], [2, 4, 6], [0, 0, 0]])
for pivot in ("partial", "nonzero"):
    p, l, u = exact_lu(singular, pivot=pivot)
    assert p.multiply(l).multiply(u) == singular

try:
    exact_lu(a, pivot="complete")
    raise AssertionError("unknown LU pivot strategy succeeded")
except ValueError:
    pass

# Full-rank exact QR agrees entry-for-entry with Sage on this rational case.
square = rational_matrix([[1, 1], [0, 1]])
q, r = exact_qr(square, square_root=rational_sqrt)
assert q.entries == tuple(map(Fraction, [1, 0, 0, 1]))
assert r.entries == tuple(map(Fraction, [1, 1, 0, 1]))
assert q.multiply(r) == square
assert_orthonormal_columns(q)

# Reduced factors drop dependent columns; full factors complete the basis.
rank_two = rational_matrix([
    [2, 0, 4],
    [0, 3, 6],
    [0, 0, 0],
    [0, 0, 0],
])
reduced_q, reduced_r = exact_qr(
    rank_two, square_root=rational_sqrt, full=False
)
assert shape(reduced_q) == (4, 2)
assert shape(reduced_r) == (2, 3)
assert reduced_q.multiply(reduced_r) == rank_two
assert_orthonormal_columns(reduced_q)
full_q, full_r = exact_qr(rank_two, square_root=rational_sqrt)
assert shape(full_q) == (4, 4)
assert shape(full_r) == (4, 3)
assert full_q.multiply(full_r) == rank_two
assert_orthonormal_columns(full_q)

# Generic rational input can require a square root outside QQ. Sage raises too.
try:
    exact_qr(rational_matrix([[1], [1]]), square_root=rational_sqrt)
    raise AssertionError("irrational rational-QR normalization succeeded")
except TypeError as error:
    assert "square roots outside Rational Field" in str(error)

# Matrix Gram-Schmidt drops dependent exact rows, unlike Sage's deprecated
# module-level helper, and returns A = M*G with Sage's tuple order.
dependent = rational_matrix([[1, 2], [2, 4], [1, 0]])
g, m = gram_schmidt_rows(dependent)
assert shape(g) == (2, 2)
assert shape(m) == (3, 2)
assert m.multiply(g) == dependent
assert g.entries == tuple(map(Fraction, [1, 2, Fraction(4, 5), Fraction(-2, 5)]))
assert m.entries == tuple(map(Fraction, [1, 0, 2, 0, Fraction(1, 5), 1]))
assert_orthogonal_rows(g)

orthonormal_input = rational_matrix([[3, 4], [4, -3], [6, 8]])
g, m = gram_schmidt_rows(
    orthonormal_input, orthonormal=True, square_root=rational_sqrt
)
assert shape(g) == (2, 2)
assert shape(m) == (3, 2)
assert m.multiply(g) == orthonormal_input
assert_orthogonal_rows(g, unit=True)

# Zero dimensions are explicit and match Sage's Matrix method shapes.
for matrix in (rational_zero(0, 3), rational_zero(3, 0)):
    p, l, u = exact_lu(matrix)
    assert shape(p) == (matrix.nrows, matrix.nrows)
    assert shape(l) == (matrix.nrows, matrix.nrows)
    assert shape(u) == shape(matrix)
    assert p.multiply(l).multiply(u) == matrix

empty_rows = rational_zero(0, 3)
q, r = exact_qr(empty_rows, square_root=rational_sqrt, full=False)
assert shape(q) == (0, 0) and shape(r) == (0, 3)
q, r = exact_qr(empty_rows, square_root=rational_sqrt)
assert shape(q) == (0, 0) and shape(r) == (0, 3)
g, m = gram_schmidt_rows(empty_rows)
assert shape(g) == (0, 3) and shape(m) == (0, 0)

empty_columns = rational_zero(3, 0)
q, r = exact_qr(empty_columns, square_root=rational_sqrt, full=False)
assert shape(q) == (3, 0) and shape(r) == (0, 0)
q, r = exact_qr(empty_columns, square_root=rational_sqrt)
assert shape(q) == (3, 3) and shape(r) == (3, 0)
assert q == Matrix.identity(3, zero=ZERO, one=ONE)
g, m = gram_schmidt_rows(empty_columns)
assert shape(g) == (0, 0) and shape(m) == (3, 0)

# The record rejects ambiguous or malformed physical shapes.
try:
    rational_matrix([[1], [1, 2]])
    raise AssertionError("ragged matrix succeeded")
except ValueError:
    pass
try:
    Matrix.create(2, 2, [ONE, ONE, ONE], zero=ZERO, one=ONE)
    raise AssertionError("short matrix storage succeeded")
except ValueError:
    pass

# A 20,000 x 2 input would make the former nrows-squared scratch table require
# 400 million list slots. The result itself is only 20,000 x 1, and the
# reference implementation now uses storage proportional to that output.
tall_rows = 20_000
tall = Matrix.create(
    tall_rows,
    2,
    (
        Fraction(value)
        for row in range(tall_rows)
        for value in (row, 2 * row)
    ),
    zero=ZERO,
    one=ONE,
)
tracemalloc.start()
tall_g, tall_m = gram_schmidt_rows(tall)
_, tall_peak_bytes = tracemalloc.get_traced_memory()
tracemalloc.stop()
assert shape(tall_g) == (1, 2)
assert shape(tall_m) == (tall_rows, 1)
assert tall_m.multiply(tall_g) == tall
assert tall_peak_bytes < 32_000_000, tall_peak_bytes

print("linear-decomposition-contract-ok")
`;

const sagejsSource = String.raw`
from sagejs.linear_algebra.decompositions import (
    ExactMatrixData,
    exact_lu,
    exact_qr,
    gram_schmidt_rows,
)

zero = QQ(0)
one = QQ(1)


def exact_sqrt(value):
    if value == one:
        return one
    raise TypeError("test square root left QQ")


a = ExactMatrixData.from_rows(
    [[zero, QQ(2), one], [QQ(3), QQ(4), QQ(5)], [QQ(6), QQ(7), QQ(8)]],
    zero=zero,
    one=one,
)
p, l, u = exact_lu(a)
assert p.multiply(l).multiply(u) == a
assert (p.nrows, l.ncols, u.nrows, u.ncols) == (3, 3, 3, 3)

q_input = ExactMatrixData.from_rows(
    [[one, one], [zero, one]], zero=zero, one=one
)
q, r = exact_qr(q_input, square_root=exact_sqrt)
assert q.multiply(r) == q_input
assert q.entries == (one, zero, zero, one)

dependent = ExactMatrixData.from_rows(
    [[one, QQ(2)], [QQ(2), QQ(4)], [one, zero]],
    zero=zero,
    one=one,
)
g, m = gram_schmidt_rows(dependent)
assert m.multiply(g) == dependent
assert (g.nrows, g.ncols, m.nrows, m.ncols) == (2, 2, 3, 2)
assert g.entries == (one, QQ(2), QQ(4) / QQ(5), QQ(-2) / QQ(5))

print("linear-decomposition-sagejs-ok")
`;

const result = spawnSync(pythonExecutable(), ["-"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: 120_000,
});

if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.equal(result.stderr, "");
assert.equal(result.stdout.trim(), "linear-decomposition-contract-ok");

console.log("linear decomposition reference contract passed");

const sagejsResult = spawnSync(process.execPath, [resolve(root, "bin", "sagejs"), "-"], {
  cwd: root,
  encoding: "utf8",
  input: sagejsSource,
  timeout: 120_000,
});
if (sagejsResult.error) throw sagejsResult.error;
assert.equal(
  sagejsResult.status,
  0,
  sagejsResult.stderr || sagejsResult.stdout,
);
assert.equal(sagejsResult.stderr, "");
assert.equal(sagejsResult.stdout.trim(), "linear-decomposition-sagejs-ok");

const moduleSource = readFileSync(
  resolve(root, "src/lib/sagejs/linear_algebra/decompositions.py"),
  "utf8",
);
assert.doesNotMatch(moduleSource, /fractions|Fraction/);
assert.doesNotMatch(moduleSource, /sagejs\.runtime|sagejs\.native|sagejs\.ffi/);

console.log("linear decomposition Sage.js dynamic contract passed");
