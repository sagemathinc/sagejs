#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = resolve(__dirname, "..");
const sagejs = resolve(root, "bin", "sagejs");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runSage(source) {
  const directory = mkdtempSync(resolve(tmpdir(), "sagejs-vector-contract-"));
  try {
    const filename = resolve(directory, "contract.sage");
    writeFileSync(filename, source);
    return run(process.execPath, [sagejs, filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const modulePath = resolve(
  root,
  "src/lib/sagejs/linear_algebra/vector_contract.py",
);
const cpythonSource = String.raw`
import importlib.util
from fractions import Fraction

spec = importlib.util.spec_from_file_location("vector_contract", ${JSON.stringify(modulePath)})
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

source = [0, Fraction(3, 2), 0, Fraction(-5, 3)]
original = list(source)
assert module.vector_is_zero([0, 0, 0])
assert not module.vector_is_zero(source)
assert module.vector_nonzero_positions(source) == [1, 3]
assert module.vector_support(source) == [1, 3]
assert module.vector_pairwise_product(source, [2, 4, 6, 3]) == [0, 6, 0, -5]
assert module.vector_outer_product_entries([1, 2], [3, 4, 5]) == [3, 4, 5, 6, 8, 10]
assert module.vector_norm([3.0, -4.0], 2, float("inf"), abs,
    lambda total, p: total ** (1 / p)) == 5.0
assert module.vector_normalized_entries([3.0, -4.0], 2, float("inf"), abs,
    lambda total, p: total ** (1 / p), lambda value, norm: value / norm) == [0.6, -0.8]
assert source == original

try:
    module.vector_pairwise_product([1, 2], [3])
    raise AssertionError("unequal pairwise product succeeded")
except ValueError as error:
    assert str(error) == "pairwise products require vectors of equal length"

try:
    module.vector_norm([], float("inf"), float("inf"), abs,
        lambda total, p: total ** (1 / p))
    raise AssertionError("empty infinity norm succeeded")
except ValueError as error:
    assert str(error) == "max() iterable argument is empty"

print("cpython-vector-contract-ok")
`;

assert.equal(
  run(pythonExecutable(), ["-c", cpythonSource]),
  "cpython-vector-contract-ok",
);

const sageSource = String.raw`
# Oracle values and failures below were checked against SageMath 10.9.post2.
from sagejs.linear_algebra.vector_contract import (
    vector_is_zero,
    vector_nonzero_positions,
    vector_norm,
    vector_normalized_entries,
    vector_outer_product_entries,
    vector_pairwise_product,
    vector_support,
)


def exact_power_root(total, p):
    if p == 1:
        return QQ(total)
    if p == 2:
        return sqrt(QQ(total))
    return total ** (QQ(1) / p)


def divide(left, right):
    return left / right


def finite_field_absolute_value(value):
    raise ArithmeticError("absolute value not defined on integers modulo n.")


for base in [ZZ, QQ, GF(7)]:
    zero = vector(base, [0, 0, 0])
    source = vector(base, [1, 0, -2])
    before = source.list()
    assert vector_is_zero(zero.list())
    assert not vector_is_zero(source.list())
    assert vector_nonzero_positions(source.list()) == [0, 2]
    assert vector_support(source.list()) == [0, 2]
    assert source.list() == before
    assert source.is_mutable()

left_zz = vector(ZZ, [2, 3, -4])
right_qq = vector(QQ, [QQ(1) / 2, QQ(4) / 3, QQ(-3) / 2])
pairwise = vector(QQ, vector_pairwise_product(
    left_zz.change_ring(QQ).list(), right_qq.list()))
assert pairwise == vector(QQ, [1, 4, 6])
assert pairwise.is_mutable()
assert vector(
    GF(7),
    vector_pairwise_product(
        vector(GF(7), [1, 2, 3]).list(),
        vector(GF(7), [3, 4, 5]).list(),
    ),
) == vector(GF(7), [3, 1, 1])

left = vector(QQ, [QQ(1) / 2, QQ(1) / 3])
right = vector(ZZ, [6, 12, 18])
flat = vector_outer_product_entries(left.list(), right.change_ring(QQ).list())
outer = matrix(QQ, len(left), len(right), flat)
assert outer == matrix(QQ, [[3, 6, 9], [2, 4, 6]])
gf_outer_entries = vector_outer_product_entries(
    vector(GF(7), [1, 2]).list(), vector(GF(7), [3, 4, 5]).list())
assert matrix(GF(7), 2, 3, gf_outer_entries) == matrix(
    GF(7), [[3, 4, 5], [6, 1, 3]])
assert left.list() == [QQ(1) / 2, QQ(1) / 3]
assert right.list() == [6, 12, 18]

assert vector_outer_product_entries([], [1, 2, 3]) == []
assert vector_outer_product_entries([1, 2, 3], []) == []
try:
    vector_pairwise_product([1, 2], [3])
    raise AssertionError("unequal pairwise product succeeded")
except ValueError as error:
    assert str(error) == "pairwise products require vectors of equal length"

for base in [ZZ, QQ]:
    entries = vector(base, [3, 0, -4]).list()
    assert vector_norm(entries, 2, Infinity, abs, exact_power_root) == 5
    assert vector_norm(entries, 1, Infinity, abs, exact_power_root) == 7
    assert vector_norm(entries, Infinity, Infinity, abs, exact_power_root) == 4
    normalized = vector_normalized_entries(
        entries, 2, Infinity, abs, exact_power_root, divide)
    assert vector(QQ, normalized) == vector(QQ, [QQ(3) / 5, 0, QQ(-4) / 5])
    normalized_one = vector_normalized_entries(
        entries, 1, Infinity, abs, exact_power_root, divide)
    assert vector(QQ, normalized_one) == vector(
        QQ, [QQ(3) / 7, 0, QQ(-4) / 7])
    assert entries == vector(base, [3, 0, -4]).list()

symbolic_norm = vector_norm(
    vector(QQ, [1, 2, 3]).list(), 2, Infinity, abs, exact_power_root)
assert symbolic_norm == sqrt(14)
symbolic_normalized = vector_normalized_entries(
    vector(ZZ, [1, 2, 3]).list(), 2, Infinity, abs,
    exact_power_root, divide)
assert symbolic_normalized == [
    sqrt(14) / 14, sqrt(14) / 7, 3 * sqrt(14) / 14]

for p in [1, 2, Infinity]:
    try:
        vector_norm(
            vector(GF(7), [1, 2, 3]).list(), p, Infinity,
            finite_field_absolute_value, exact_power_root)
        raise AssertionError("finite-field norm succeeded")
    except ArithmeticError as error:
        assert str(error) == "absolute value not defined on integers modulo n."

try:
    vector_norm([1, 2], 0, Infinity, abs, exact_power_root)
    raise AssertionError("zero-norm parameter succeeded")
except ValueError as error:
    assert "is not greater than or equal to 1" in str(error)

try:
    vector_norm([], Infinity, Infinity, abs, exact_power_root)
    raise AssertionError("empty infinity norm succeeded")
except ValueError as error:
    assert str(error) == "max() iterable argument is empty"

try:
    vector_normalized_entries(
        [ZZ(0), ZZ(0)], 2, Infinity, abs, exact_power_root, divide)
    raise AssertionError("zero vector normalization succeeded")
except ZeroDivisionError as error:
    assert str(error) == "rational division by zero"

print("sage-vector-contract-ok")
`;

assert.equal(runSage(sageSource), "sage-vector-contract-ok");

console.log("linear vector contract passed");
