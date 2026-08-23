#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-prime-batch-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), script], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_FORBID_MATRIX_NAPI: "1",
        ...environment,
      },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const behavior = String.raw`
def expect_failure(function, exception, message=None):
    try:
        function()
        raise AssertionError("operation unexpectedly succeeded")
    except exception as error:
        if message is not None:
            assert str(error) == message, (str(error), message)


for prime in [2, 97, 65521]:
    field = GF(prime)
    source = matrix(field, 4, 5, range(20))

    old_rref = source.rref()
    source.set_row(1, [prime - 1, -2, field(3), 4 + prime, 5])
    assert source.row(1).list() == [
        field(prime - 1), field(-2), field(3), field(4), field(5)
    ]
    assert source.rref() is not old_rref

    source.set_column(2, (field(index + 7) for index in range(4)))
    assert source.column(2).list() == [field(7), field(8), field(9), field(10)]

    block = matrix(ZZ, 2, 3, [-1, 20, 3, 4, 5, 6])
    source.set_block(1, 1, block)
    actual_block = matrix(
        field,
        2,
        3,
        [source[row, column] for row in [1, 2] for column in [1, 2, 3]],
    )
    assert actual_block == block.change_ring(field)

    # Every public failure happens before the first target write.
    snapshot = source.__copy__()
    expect_failure(
        lambda: source.set_row(1, [1, 2]),
        ValueError,
        "list of new entries must be of length 5 (not 2)",
    )
    expect_failure(
        lambda: source.set_column(5, [1, 2, 3, 4]),
        ValueError,
        "column number must be between 0 and 4 (inclusive), not 5",
    )
    expect_failure(lambda: source.set_row(0, [1, 2, object(), 4, 5]), TypeError)
    expect_failure(
        lambda: source.set_block(3, 4, matrix(field, 2, 2, [1, 2, 3, 4])),
        IndexError,
        "matrix window index out of range",
    )
    assert source == snapshot

    immutable = source.__copy__()
    immutable.set_immutable()
    expect_failure(lambda: immutable.set_row(0, [0, 0, 0, 0, 0]), ValueError)
    expect_failure(lambda: immutable.set_column(0, [0, 0, 0, 0]), ValueError)
    expect_failure(lambda: immutable.set_block(0, 0, matrix(field, 1, 1, [0])), ValueError)
    assert immutable == source

    # Empty row, column, and block updates preserve the relevant shapes.
    empty_columns = matrix(field, 3, 0, [])
    empty_columns.set_row(2, [])
    assert empty_columns.nrows() == 3 and empty_columns.ncols() == 0
    empty_rows = matrix(field, 0, 3, [])
    empty_rows.set_column(2, [])
    empty_rows.set_block(0, 1, matrix(field, 0, 2, []))
    assert empty_rows.nrows() == 0 and empty_rows.ncols() == 3

print("dense-prime-batch-mutation-ok")
`;

assert.equal(runSage(behavior), "dense-prime-batch-mutation-ok");
assert.equal(
  runSage(behavior, { SAGEJS_NATIVE_DISABLE: "1" }),
  "dense-prime-batch-mutation-ok",
);

const performance = String.raw`
from time import perf_counter
from sagejs.kernels.matrix.dense_binary_m4ri import m4ri_dense_matrix_set_block
from sagejs.native import execution_mode


def minimum_time(function, repetitions=5):
    answer = 10**100
    for _repeat in range(repetitions):
        start = perf_counter()
        function()
        answer = min(answer, perf_counter() - start)
    return answer


size = 512
block_size = 96
for prime in [2, 97]:
    field = GF(prime)
    target = matrix(field, size, size, 0)
    row_values = [field((37 * index + 11) % prime) for index in range(size)]
    column_values = [field((53 * index + 19) % prime) for index in range(size)]
    block = matrix(
        field,
        block_size,
        block_size,
        [(17 * index + 5) % prime for index in range(block_size * block_size)],
    )

    row_seconds = minimum_time(lambda: target.set_row(123, row_values), 7)
    assert target.row(123).list() == row_values
    column_seconds = minimum_time(lambda: target.set_column(234, column_values), 7)
    assert target.column(234).list() == column_values
    block_seconds = minimum_time(lambda: target.set_block(200, 300, block), 7)
    actual_block = matrix(
        field,
        block_size,
        block_size,
        [
            target[row, column]
            for row in range(200, 200 + block_size)
            for column in range(300, 300 + block_size)
        ],
    )
    assert actual_block == block
    block_mode = execution_mode(m4ri_dense_matrix_set_block) if prime == 2 else "packed"
    print(prime, row_seconds, column_seconds, block_seconds, block_mode)
`;

for (const line of runSage(performance).split("\n")) {
  const [primeText, rowText, columnText, blockText, blockMode] =
    line.split(/\s+/);
  const [prime, row, column, block] =
    [primeText, rowText, columnText, blockText].map(Number);
  // These deliberately loose ceilings catch a return to one host crossing per
  // entry without making shared CI load part of the API contract.
  assert.ok(row < 0.01, `GF(${prime}) set_row took ${row}s`);
  assert.ok(column < 0.01, `GF(${prime}) set_column took ${column}s`);
  // The portable release pack intentionally excludes M4RI until its native
  // dependency is supported on Windows. Its exact dynamic fallback performs
  // the same checked mutation but cannot meet the compiled bulk-kernel gate.
  const blockLimit = prime === 2 && blockMode === "dynamic" ? 0.2 : 0.02;
  assert.ok(block < blockLimit, `GF(${prime}) set_block took ${block}s`);
}

console.log("dense prime batch-mutation tests passed");
