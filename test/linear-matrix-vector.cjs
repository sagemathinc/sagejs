#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

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
  const directory = mkdtempSync(resolve(tmpdir(), "sagejs-matrix-vector-"));
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
  "src/lib/sagejs/linear_algebra/matrix_vector.py",
);
const cpythonSource = String.raw`
import importlib.util
from fractions import Fraction

spec = importlib.util.spec_from_file_location("matrix_vector", ${JSON.stringify(modulePath)})
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

matrix = [1, 2, 3, 4, 5, 6]
right = [7, 8, 9]
left = [10, 11]
assert module.matrix_times_vector_entries(matrix, 2, 3, right, 0) == [50, 122]
assert module.vector_times_matrix_entries(left, matrix, 2, 3, 0) == [54, 75, 96]

rational_matrix = [Fraction(1, 2), Fraction(2, 3), Fraction(3, 4), Fraction(4, 5)]
rational_vector = [Fraction(5, 6), Fraction(6, 7)]
assert module.matrix_times_vector_entries(
    rational_matrix, 2, 2, rational_vector, Fraction(0)
) == [Fraction(83, 84), Fraction(367, 280)]
assert module.vector_times_matrix_entries(
    rational_vector, rational_matrix, 2, 2, Fraction(0)
) == [Fraction(89, 84), Fraction(391, 315)]

assert module.matrix_times_vector_entries([], 0, 3, [1, 2, 3], 0) == []
assert module.matrix_times_vector_entries([], 3, 0, [], 0) == [0, 0, 0]
assert module.vector_times_matrix_entries([], [], 0, 3, 0) == [0, 0, 0]
assert module.vector_times_matrix_entries([1, 2, 3], [], 3, 0, 0) == []

calls = []
matrix_storage = object()
vector_storage = object()

def operation(matrix_value, vector_value, rows, columns):
    calls.append((matrix_value, vector_value, rows, columns))
    return object()

plan = module.prepare_matrix_vector_product(2, 3, 3, "right")
result = module.execute_bulk_matrix_vector_product(
    plan, matrix_storage, vector_storage, operation
)
assert len(calls) == 1
assert calls[0] == (matrix_storage, vector_storage, 2, 3)
assert result is not matrix_storage and result is not vector_storage
assert plan.result_length == 2

left_plan = module.prepare_matrix_vector_product(2, 3, 2, "left")
left_result = module.execute_bulk_matrix_vector_product(
    left_plan, matrix_storage, vector_storage, operation
)
assert len(calls) == 2
assert calls[1] == (matrix_storage, vector_storage, 2, 3)
assert left_result is not matrix_storage and left_result is not vector_storage
assert left_plan.result_length == 3

failures = []

def failing_operation(*arguments):
    failures.append(arguments)
    raise RuntimeError("backend failed")

try:
    module.execute_bulk_matrix_vector_product(
        plan, matrix_storage, vector_storage, failing_operation
    )
    raise AssertionError("backend failure did not propagate")
except RuntimeError as error:
    assert str(error) == "backend failed"
assert len(failures) == 1

for plan_arguments in [
    (2, 3, 2, "right"),
    (2, 3, 3, "left"),
]:
    try:
        module.prepare_matrix_vector_product(*plan_arguments)
        raise AssertionError("incompatible matrix-vector plan succeeded")
    except TypeError:
        pass

for plan_arguments in [
    (-1, 3, 3, "right"),
    (2, 3, 3, "diagonal"),
]:
    try:
        module.prepare_matrix_vector_product(*plan_arguments)
        raise AssertionError("invalid matrix-vector plan succeeded")
    except ValueError:
        pass

try:
    module.matrix_times_vector_entries([1, 2], 1, 3, [1, 2, 3], 0)
    raise AssertionError("invalid matrix entry storage succeeded")
except ValueError as error:
    assert str(error) == "matrix entry count does not match its dimensions"

print("cpython-matrix-vector-ok")
`;

assert.equal(
  run("python3", ["-c", cpythonSource]),
  "cpython-matrix-vector-ok",
);

const sageSource = String.raw`
# Values, parents, mutability, mixed-ring coercions, and empty shapes below
# were checked against SageMath 10.9.
from sagejs.linear_algebra.matrix_vector import (
    execute_bulk_matrix_vector_product,
    matrix_times_vector_entries,
    prepare_matrix_vector_product,
    vector_times_matrix_entries,
)


def contract_right(matrix_value, vector_value):
    base = matrix_value.base_ring()
    entries = matrix_times_vector_entries(
        matrix_value.list(), matrix_value.nrows(), matrix_value.ncols(),
        vector_value.list(), base(0))
    return vector(base, entries)


def contract_left(vector_value, matrix_value):
    base = matrix_value.base_ring()
    entries = vector_times_matrix_entries(
        vector_value.list(), matrix_value.list(), matrix_value.nrows(),
        matrix_value.ncols(), base(0))
    return vector(base, entries)


for base in [ZZ, QQ, GF(2), GF(7)]:
    A = matrix(base, 2, 3, [1, 2, 3, 4, 5, 6])
    right = vector(base, [7, 8, 9])
    left = vector(base, [10, 11])
    contract_right_result = contract_right(A, right)
    contract_left_result = contract_left(left, A)
    assert contract_right_result == A * right
    assert contract_left_result == left * A
    assert contract_right_result.is_mutable()
    assert contract_left_result.is_mutable()
    assert contract_right_result.parent() == VectorSpace(base, 2)
    assert contract_left_result.parent() == VectorSpace(base, 3)

for matrix_base, vector_base, expected_base in [
    (ZZ, QQ, QQ),
    (QQ, ZZ, QQ),
    (GF(7), ZZ, GF(7)),
    (ZZ, GF(7), GF(7)),
    (GF(2), ZZ, GF(2)),
]:
    A = matrix(matrix_base, 2, 3, [1, 2, 3, 4, 5, 6])
    right = vector(vector_base, [7, 8, 9])
    left = vector(vector_base, [10, 11])
    common = (A * right).base_ring()
    assert common == expected_base
    assert (left * A).base_ring() == expected_base
    converted = A.change_ring(common)
    assert contract_right(converted, right.change_ring(common)) == A * right
    assert contract_left(left.change_ring(common), converted) == left * A

try:
    matrix(GF(7), 1, 2, [1, 2]) * vector(GF(2), [1, 0])
    raise AssertionError("distinct finite-field product succeeded")
except TypeError:
    pass

try:
    vector(GF(2), [1]) * matrix(GF(7), 1, 2, [1, 2])
    raise AssertionError("distinct finite-field left product succeeded")
except TypeError:
    pass

for rows, columns in [(0, 0), (0, 3), (3, 0)]:
    for base in [ZZ, QQ, GF(2), GF(7)]:
        A = matrix(base, rows, columns)
        right = vector(base, [0] * columns)
        left = vector(base, [0] * rows)
        right_result = contract_right(A, right)
        left_result = contract_left(left, A)
        assert right_result == A * right
        assert left_result == left * A
        assert len(right_result) == rows
        assert len(left_result) == columns

_bulk_calls = []


def _one_bulk_operation(matrix_storage, vector_storage, rows, columns):
    _bulk_calls.append([matrix_storage, vector_storage, rows, columns])
    return [50, 122]


plan = prepare_matrix_vector_product(2, 3, 3, "right")
storage = execute_bulk_matrix_vector_product(
    plan, "matrix-storage", "vector-storage", _one_bulk_operation)
assert storage == [50, 122]
assert _bulk_calls == [["matrix-storage", "vector-storage", 2, 3]]
assert plan.result_length == 2

for plan_arguments in [
    (2, 3, 2, "right"),
    (2, 3, 3, "left"),
]:
    try:
        prepare_matrix_vector_product(*plan_arguments)
        raise AssertionError("incompatible product plan succeeded")
    except TypeError as error:
        assert str(error) == "matrix and vector dimensions are incompatible"

print("sage-matrix-vector-ok")
`;

assert.equal(runSage(sageSource), "sage-matrix-vector-ok");

console.log("linear matrix-vector contract passed");
