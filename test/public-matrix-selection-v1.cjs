#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-public-selection-"));
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


def packed_forbidden(*values):
    raise AssertionError("hidden exact-matrix export")


for base in [ZZ, QQ, GF(2), GF(97)]:
    source = matrix(base, 3, 4, range(12))
    original = source.__copy__()
    if base is ZZ:
        source._packed_integers = packed_forbidden
    elif base is QQ:
        source._packed_rationals = packed_forbidden

    # Ordered selection preserves duplicates. Combined selection validates
    # columns before rows, and all matrix selectors reject negative indices.
    selected = source.matrix_from_rows_and_columns([2, 0, 2], [3, 1, 1])
    assert selected.dimensions() == (3, 3)
    assert selected.list() == [
        base(value) for value in [11, 9, 9, 3, 1, 1, 11, 9, 9]
    ]
    expect_failure(
        lambda: source.matrix_from_rows_and_columns([99], [99]),
        IndexError,
        "column index out of range",
    )
    expect_failure(
        lambda: source.matrix_from_rows([-1]),
        IndexError,
        "row index out of range",
    )
    expect_failure(
        lambda: source.matrix_from_columns([-1]),
        IndexError,
        "column index out of range",
    )

    assert source.submatrix(1, 2).list() == [base(value) for value in [6, 7, 10, 11]]
    assert source.submatrix(1, 1, -1, -1).dimensions() == (2, 3)
    assert source.submatrix(1, 1, -2, 2).dimensions() == (0, 2)
    assert source.submatrix(-1, 1, 0, 2).dimensions() == (0, 2)
    assert source.matrix_from_rows([]).dimensions() == (0, 4)
    assert source.matrix_from_columns([]).dimensions() == (3, 0)
    assert source.matrix_from_rows_and_columns([], [2, 0]).dimensions() == (0, 2)
    assert source.matrix_from_rows_and_columns([2, 0], []).dimensions() == (2, 0)

    assert source.delete_rows([2, 0, 2]).list() == source.row(1).list()
    assert source.delete_columns([2, 0, 2]).list() == [
        base(value) for value in [1, 3, 5, 7, 9, 11]
    ]
    expect_failure(
        lambda: source.delete_rows([-1, 2, 3]),
        IndexError,
        "[-1, 3] contains invalid indices",
    )
    assert source.delete_rows([-1, 2, 3], check=False).list() == (
        source.row(0).list() + source.row(1).list()
    )

    swapped = source.__copy__()
    owned_resource = None
    if base is ZZ:
        owned_resource = swapped._integer_resource()
    elif base is QQ:
        owned_resource = swapped._rational_resource()
    elif base == GF(2) and swapped._has_m4ri_matrix_resource():
        owned_resource = swapped._m4ri_resource()

    def selection_copy_forbidden(*values):
        raise AssertionError("matrix swap copied the complete matrix")

    swapped.matrix_from_rows = selection_copy_forbidden
    swapped.matrix_from_columns = selection_copy_forbidden
    stale_rref = swapped.rref()
    swapped.swap_rows(0, 2)
    assert swapped.rref() is not stale_rref
    swapped.swap_columns(0, 3)
    assert swapped.list() == [
        base(value) for value in [11, 9, 10, 8, 7, 5, 6, 4, 3, 1, 2, 0]
    ]
    if owned_resource is not None:
        if base is ZZ:
            assert swapped._integer_resource() is owned_resource
        elif base is QQ:
            assert swapped._rational_resource() is owned_resource
        else:
            assert swapped._m4ri_resource() is owned_resource
        assert not owned_resource.closed
    assert source == original
    assert source.with_swapped_rows(0, 2).row(0) == source.row(2)
    assert source.with_swapped_columns(0, 3).column(0) == source.column(3)
    assert source == original

    # Every setter snapshots and coerces its complete source before the first
    # write. This includes source/target aliasing and a full self block.
    target = source.__copy__()
    temporary_blocks = []
    if base is ZZ or base is QQ:
        original_set_block = target.set_block

        def capture_set_block(row, column, block):
            temporary_blocks.append(block)
            return original_set_block(row, column, block)

        target.set_block = capture_set_block
    target.set_row(1, (target[0, column] for column in range(target.ncols())))
    assert target.row(1) == source.row(0)
    target.set_column(3, (target[row, 0] for row in range(target.nrows())))
    assert target.column(3) == target.column(0)
    if base is ZZ:
        assert all(
            not block._has_fmpz_matrix_resource() for block in temporary_blocks
        )
    elif base is QQ:
        assert all(
            not block._has_fmpq_matrix_resource() for block in temporary_blocks
        )
    if base is ZZ or base is QQ:
        target.set_block = original_set_block
    before_self_block = target.__copy__()
    original_copy = target.__copy__

    def copy_forbidden():
        raise AssertionError("full self set_block copied its source")

    target.__copy__ = copy_forbidden
    target.set_block(0, 0, target)
    target.__copy__ = original_copy
    assert target == before_self_block
    target.set_block(3, 4, matrix(base, 0, 0, []))

    before_error = target.__copy__()
    expect_failure(lambda: target.set_row(1, [1, 2]), ValueError)
    expect_failure(lambda: target.set_column(4, [1, 2, 3]), ValueError)
    expect_failure(lambda: target.set_row(0, [1, 2, object(), 4]), TypeError)
    expect_failure(
        lambda: target.set_block(2, 3, matrix(base, 2, 2, range(4))),
        IndexError,
        "matrix window index out of range",
    )
    assert target == before_error

    immutable = source.__copy__()
    immutable.set_immutable()
    for mutation in [
        lambda: immutable.swap_rows(0, 1),
        lambda: immutable.swap_columns(0, 1),
        lambda: immutable.set_row(0, range(4)),
        lambda: immutable.set_column(0, range(3)),
        lambda: immutable.set_block(0, 0, matrix(base, 1, 1, [0])),
    ]:
        expect_failure(mutation, ValueError)
    expect_failure(lambda: immutable.with_swapped_rows(0, 1), ValueError)
    expect_failure(lambda: immutable.with_swapped_columns(0, 1), ValueError)
    assert immutable == source

    # The unified class makes the domain-specific method discoverable, while
    # preserving Sage's dense-ZZ-only call behavior.
    assert hasattr(source, "insert_row")
    if base is not ZZ:
        expect_failure(
            lambda: source.insert_row(1, range(4)),
            NotImplementedError,
            "insert_row is available only for dense ZZ matrices",
        )

# Combined exact selection owns an intermediate row-selected resource only
# for the duration of the following column selection.
for base in [ZZ, QQ]:
    exact = matrix(base, 3, 4, range(12))
    intermediate = []
    original_matrix_from_rows = exact.matrix_from_rows

    def capture_matrix_from_rows(rows):
        answer = original_matrix_from_rows(rows)
        intermediate.append(answer)
        return answer

    exact.matrix_from_rows = capture_matrix_from_rows
    assert exact.matrix_from_rows_and_columns([2, 0], [3, 1]).list() == [
        base(value) for value in [11, 9, 3, 1]
    ]
    assert len(intermediate) == 1
    if base is ZZ:
        assert not intermediate[0]._has_fmpz_matrix_resource()
    else:
        assert not intermediate[0]._has_fmpq_matrix_resource()

# Cross-ring block coercion closes only its converted temporary, on successful
# mutation and on a later bounds failure.  The caller's original stays usable.
for target_row in [0, 2]:
    rational_target = matrix(QQ, 2, 2, range(4))
    integer_block = matrix(ZZ, 1, 1, [17])
    converted_blocks = []
    original_change_ring = integer_block.change_ring

    def capture_change_ring(base):
        answer = original_change_ring(base)
        converted_blocks.append(answer)
        return answer

    integer_block.change_ring = capture_change_ring
    if target_row == 0:
        rational_target.set_block(0, 0, integer_block)
        assert rational_target[0, 0] == QQ(17)
    else:
        expect_failure(
            lambda: rational_target.set_block(target_row, 0, integer_block),
            IndexError,
            "matrix window index out of range",
        )
    assert len(converted_blocks) == 1
    assert not converted_blocks[0]._has_fmpq_matrix_resource()
    assert not integer_block._integer_resource().closed
    assert integer_block[0, 0] == ZZ(17)

assert matrix(ZZ, 2, 3, range(6)).insert_row(1, [7, 8, 9]).list() == [
    0, 1, 2, 7, 8, 9, 3, 4, 5
]
assert matrix(ZZ, 2, 3, range(6)).insert_row(2, [7, 8, 9]).list() == [
    0, 1, 2, 3, 4, 5, 7, 8, 9
]
assert matrix(ZZ, 2, 3, range(6)).insert_row(1, [7, 8, 9, 999]).list() == [
    0, 1, 2, 7, 8, 9, 3, 4, 5
]
expect_failure(lambda: matrix(ZZ, 2, 3, range(6)).insert_row(-1, [1, 2, 3]), ValueError)
expect_failure(lambda: matrix(ZZ, 2, 3, range(6)).insert_row(3, [1, 2, 3]), ValueError)
expect_failure(lambda: matrix(ZZ, 2, 3, range(6)).insert_row(1, [1, 2]), ValueError)

print("public-matrix-selection-v1-ok")
`;

assert.equal(runSage(behavior), "public-matrix-selection-v1-ok");
assert.equal(
  runSage(behavior, { SAGEJS_NATIVE_DISABLE: "1" }),
  "public-matrix-selection-v1-ok",
);

console.log("public matrix selection v1 tests passed");
