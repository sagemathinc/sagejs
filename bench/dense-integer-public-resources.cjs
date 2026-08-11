#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const source = String.raw`
import time

def elapsed(function):
    started = time.perf_counter()
    value = function()
    return value, (time.perf_counter() - started) * 1000

warm = matrix(ZZ, 2, 2, [1, 2, 3, 5])
warm_random = random_matrix(ZZ, 2, x=-3, y=4)
warm_add = warm + warm_random
warm_product = warm * warm
warm_determinant = warm.det()
warm_rank = warm.rank()
warm_text = warm.str()
warm_serialized = dumps(warm)
warm_restored = loads(warm_serialized)
warm_rows = warm.matrix_from_rows([1, 0])
warm_columns = warm.matrix_from_columns([1, 0])
warm_diagonal = diagonal_matrix(ZZ, [1, 2])

set_random_seed(20260811)
values = [index % 201 - 100 for index in range(500 * 500)]
constructed, construct_ms = elapsed(lambda: matrix(ZZ, 500, 500, values))
left, random_ms = elapsed(lambda: random_matrix(ZZ, 500, x=-100, y=101))
right = random_matrix(ZZ, 500, x=-100, y=101)
added, add_ms = elapsed(lambda: left + right)
square = left.matrix_from_rows(range(150)).matrix_from_columns(range(150))
product, multiply_ms = elapsed(lambda: square * square)
determinant, determinant_ms = elapsed(lambda: square.det())
rank, rank_ms = elapsed(lambda: square.rank())
display = left.matrix_from_rows(range(300)).matrix_from_columns(range(300))
text, format_ms = elapsed(lambda: display.str())
serialized, dump_ms = elapsed(lambda: dumps(left))
restored, load_ms = elapsed(lambda: loads(serialized))
skew_values = [0 for index in range(20000)] + [2**8192 + 1]
skew, skew_ms = elapsed(lambda: matrix(ZZ, 1, len(skew_values), skew_values))
selected = range(0, 500, 2)
selected_rows, select_rows_ms = elapsed(lambda: left.matrix_from_rows(selected))
selected_columns, select_columns_ms = elapsed(
    lambda: left.matrix_from_columns(selected)
)
diagonal, diagonal_ms = elapsed(lambda: diagonal_matrix(ZZ, range(1000)))

assert constructed._has_fmpz_matrix_resource()
assert left._has_fmpz_matrix_resource()
assert added._has_fmpz_matrix_resource()
assert product._has_fmpz_matrix_resource()
assert restored == left
assert restored._has_fmpz_matrix_resource()
assert skew[0, len(skew_values) - 1] == 2**8192 + 1
assert selected_rows.nrows() == 250
assert selected_rows.ncols() == 500
assert selected_columns.nrows() == 500
assert selected_columns.ncols() == 250
assert diagonal[999, 999] == 999
print(
    "RESULT",
    construct_ms,
    random_ms,
    add_ms,
    multiply_ms,
    determinant_ms,
    rank_ms,
    format_ms,
    dump_ms,
    load_ms,
    skew_ms,
    select_rows_ms,
    select_columns_ms,
    diagonal_ms,
    len(text),
    len(serialized),
    determinant % 1000003,
    rank,
)
`;

const result = spawnSync(
  process.execPath,
  [resolve(root, "bin", "sagejs"), "--python"],
  {
    cwd: root,
    encoding: "utf8",
    input: source,
    env: { ...process.env, SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1" },
  },
);
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
assert.doesNotMatch(result.stderr, /forbidden legacy mathematical N-API/);

const match = /^RESULT\s+(.+)$/m.exec(result.stdout);
assert.ok(match, result.stdout);
const fields = match[1].trim().split(/\s+/);
assert.equal(fields.length, 17, result.stdout);
const milliseconds = fields.slice(0, 13).map(Number);
assert.ok(milliseconds.every(Number.isFinite), result.stdout);

console.log(JSON.stringify({
  schema: "sagejs.benchmark/dense-integer-public-resources-v1",
  milliseconds: {
    construct500: milliseconds[0],
    random500: milliseconds[1],
    add500: milliseconds[2],
    multiply150: milliseconds[3],
    determinant150: milliseconds[4],
    rank150: milliseconds[5],
    format300: milliseconds[6],
    dump500: milliseconds[7],
    load500: milliseconds[8],
    skewed20001: milliseconds[9],
    selectRows250Of500: milliseconds[10],
    selectColumns250Of500: milliseconds[11],
    diagonal1000: milliseconds[12],
  },
  textLength: Number(fields[13]),
  serializedLength: Number(fields[14]),
  determinantMod1000003: fields[15],
  rank: Number(fields[16]),
}));
