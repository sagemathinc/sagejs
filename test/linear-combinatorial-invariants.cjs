#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const sagejs = resolve(root, "bin", "sagejs");

function runSagejs(source, environment = {}) {
  const result = spawnSync(process.execPath, [sagejs, "--python"], {
    cwd: root,
    encoding: "utf8",
    input: source,
    env: { ...process.env, ...environment },
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  return result.stdout.trim();
}

function differentialCorpus(helperDefinitions) {
  return String.raw`
import json

${helperDefinitions}


def entries(label, base, rows, columns):
    answer = []
    for position in range(rows * columns):
        numerator = (position * 7 + rows * 3 + columns * 5) % 11 - 5
        if label == "QQ":
            answer.append(base(numerator) / (position % 4 + 1))
        else:
            answer.append(base(numerator))
    return answer


def expansion(matrix_value):
    rows = matrix_value.nrows()
    columns = matrix_value.ncols()
    if rows == 0:
        return matrix_value.base_ring()(1)
    selected_rows = list(range(1, rows))
    answer = matrix_value.base_ring()(0)
    for column in range(columns):
        selected_columns = [
            index for index in range(columns) if index != column
        ]
        submatrix = matrix_value.matrix_from_rows(selected_rows)
        submatrix = submatrix.matrix_from_columns(selected_columns)
        answer += matrix_value[0, column] * compute_permanent(submatrix)
    return answer


answer = []
domains = [("ZZ", ZZ), ("QQ", QQ), ("GF7", GF(7))]
for label, base in domains:
    for rows in range(6):
        for columns in range(6):
            matrix_value = matrix(
                base,
                rows,
                columns,
                entries(label, base, rows, columns),
            )
            minors = []
            for size in range(min(rows, columns) + 2):
                values = compute_minors(matrix_value, size)
                minors.append([str(value) for value in values])
                if size == 0:
                    assert values == [base(1)]
                if size == 1:
                    assert values == matrix_value.list()
                if rows == columns and size == rows:
                    assert values == [matrix_value.determinant()]
            if rows <= columns:
                permanent = compute_permanent(matrix_value)
                assert permanent == expansion(matrix_value)
                ones = matrix(base, rows, columns, [base(1)] * (rows * columns))
                expected = 1
                for offset in range(rows):
                    expected *= columns - offset
                assert compute_permanent(ones) == base(expected)
                permanent_result = ["ok", str(permanent)]
            else:
                try:
                    compute_permanent(matrix_value)
                    raise AssertionError("permanent unexpectedly succeeded")
                except ValueError as error:
                    permanent_result = ["ValueError", str(error)]
            answer.append([label, rows, columns, minors, permanent_result])

print(json.dumps(answer, separators=(",", ":")))
`;
}

const sagejsHelpers = String.raw`
from sagejs.linear_algebra.combinatorial import matrix_minors, matrix_permanent


def compute_minors(matrix_value, size):
    return matrix_minors(matrix_value, size, max_work=None)


def compute_permanent(matrix_value):
    return matrix_permanent(matrix_value, max_work=None)
`;

const sageHelpers = String.raw`
def compute_minors(matrix_value, size):
    return matrix_value.minors(size)


def compute_permanent(matrix_value):
    return matrix_value.permanent()
`;

const actual = runSagejs(differentialCorpus(sagejsHelpers));
const sage = process.env.SAGE || "/home/user/bin/sagelite";
if (existsSync(sage)) {
  const oracle = spawnSync(sage, ["-c", differentialCorpus(sageHelpers)], {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
  });
  assert.equal(oracle.status, 0, oracle.stderr || oracle.stdout);
  assert.equal(actual, oracle.stdout.trim());
}

const policySource = String.raw`
from sagejs.linear_algebra.combinatorial import (
    DEFAULT_COMBINATORIAL_WORK_LIMIT,
    matrix_minors,
    matrix_permanent,
    minors_work,
    permanent_work,
)


def failure(function, text):
    try:
        function()
        raise AssertionError("calculation unexpectedly succeeded")
    except (TypeError, ValueError) as error:
        assert text in str(error), (text, str(error))


assert minors_work(5, 5, 2) == 800
assert minors_work(0, 5, 0) == 0
assert minors_work(2, 3, 4) == 0
assert permanent_work(5, 5) == 400
assert permanent_work(0, 100) == 0
assert permanent_work(3, 2) == 0

A = matrix(ZZ, 5, 5, range(25))
assert matrix_minors(A, 2, max_work=800) == matrix_minors(A, 2, max_work=None)
failure(lambda: matrix_minors(A, 2, max_work=799), "requires 800")
failure(lambda: matrix_minors(A, -1), "nonnegative")
failure(lambda: matrix_minors(A, 1.5), "interpreted as an integer")
failure(lambda: matrix_minors(A, 2, max_work=-1), "nonnegative")
failure(lambda: matrix_minors(A, 0, max_work=-1), "nonnegative")
failure(lambda: matrix_minors(A, 9, max_work=-1), "nonnegative")

B = matrix(ZZ, 5, 5, [1] * 25)
assert matrix_permanent(B, max_work=400) == 120
failure(lambda: matrix_permanent(B, max_work=399), "requires 400")
failure(lambda: matrix_permanent(B, algorithm="unknown"), "Ryser")
failure(lambda: matrix_permanent(B, max_work=-1), "nonnegative")

wide = matrix(ZZ, 20, 20, 0)
assert permanent_work(20, 20) > DEFAULT_COMBINATORIAL_WORK_LIMIT
failure(lambda: matrix_permanent(wide), "pass max_work=None")
failure(lambda: matrix_minors(wide, 10), "pass max_work=None")

assert matrix_permanent(matrix(QQ, 0, 7, []), max_work=0) == QQ(1)
assert matrix_permanent(matrix(QQ, 0, 7, []), algorithm="unused") == QQ(1)
failure(
    lambda: matrix_permanent(matrix(QQ, 0, 7, []), max_work=-1),
    "nonnegative",
)
assert matrix_minors(matrix(GF(7), 0, 4, []), 0, max_work=0) == [GF(7)(1)]
failure(lambda: matrix_permanent(matrix(ZZ, 2, 1, [1, 2])), "m (=2)")
print("linear-combinatorial-policy-ok")
`;

assert.equal(runSagejs(policySource), "linear-combinatorial-policy-ok");
assert.equal(
  runSagejs(policySource, { SAGEJS_NATIVE_DISABLE: "1" }),
  "linear-combinatorial-policy-ok",
);

console.log(
  JSON.stringify({
    schema: "sagejs.linear-algebra/combinatorial-invariants-v1",
    differentialShapes: "all 0..5 by 0..5",
    domains: ["ZZ", "QQ", "GF(7)"],
    status: "ok",
  }),
);
