#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const modulePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "linear_algebra",
  "matrix_selection.py",
);

const witness = String.raw`
import importlib.util

MODULE_PATH = __MATRIX_SELECTION_PATH__
spec = importlib.util.spec_from_file_location("matrix_selection", MODULE_PATH)
assert spec is not None and spec.loader is not None
selection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selection)


def raises(exception, fragment, function):
    try:
        function()
    except exception as error:
        assert fragment in str(error), (fragment, str(error))
        return
    raise AssertionError("expected " + exception.__name__)


# These values are direct Sage 10.9 oracles for a 3x4 row-major matrix.
source = list(range(12))
plan = selection.selection_plan(3, 4, [2, 0, 2], [3, 1, 1])
assert plan == ((2, 0, 2), (3, 1, 1))
assert selection.select_row_major(source, 3, 4, plan) == [
    11, 9, 9,
    3, 1, 1,
    11, 9, 9,
]
assert selection.submatrix_plan(3, 4, 1, 2) == ((1, 2), (2, 3))
assert selection.select_row_major(
    source, 3, 4, selection.submatrix_plan(3, 4, 1, 2)
) == [6, 7, 10, 11]
assert selection.submatrix_plan(3, 4, 1, 1, -2, 2) == ((), (1, 2))

# Empty axes retain their logical result shape in the plan.
assert selection.selection_plan(0, 4, [], [2, 0]) == ((), (2, 0))
assert selection.selection_plan(3, 0, [2, 0], []) == ((2, 0), ())
assert selection.select_row_major([], 0, 4, ((), (2, 0))) == []
assert selection.select_row_major([], 3, 0, ((2, 0), ())) == []

# Unlike scalar matrix indexing, Sage selectors reject negative indices.
raises(IndexError, "row index out of range", lambda: selection.row_indices([-1], 3))
raises(
    IndexError,
    "column index out of range",
    lambda: selection.column_indices([-1], 4),
)
# Combined selection validates columns before rows.
raises(
    IndexError,
    "column index out of range",
    lambda: selection.selection_plan(3, 4, [99], [99]),
)

# Deletion is set-like; unchecked invalid indices are simply irrelevant.
assert selection.retained_indices(4, [2, 0, 2], "row") == (1, 3)
raises(
    IndexError,
    "[-1, 4] contains invalid indices",
    lambda: selection.retained_indices(4, [-1, 2, 4], "row"),
)
assert selection.retained_indices(4, [-1, 2, 4], "row", False) == (0, 1, 3)

# Integer dense Sage matrices expose row insertion, including append.  A
# prepared insertion produces fresh storage and cannot mutate its source.
insert_source = list(range(6))
insertion = selection.prepare_row_insertion(2, 3, 1, [20, 21, 22], int)
inserted = selection.insert_row_major(insert_source, 2, 3, insertion)
assert inserted == [0, 1, 2, 20, 21, 22, 3, 4, 5]
assert insert_source == list(range(6))
append = selection.prepare_row_insertion(2, 3, 2, [30, 31, 32], int)
assert selection.insert_row_major(insert_source, 2, 3, append)[-3:] == [30, 31, 32]
raises(
    ValueError,
    "nonnegative",
    lambda: selection.prepare_row_insertion(2, 3, -1, [1, 2, 3], int),
)
raises(
    ValueError,
    "less than number of rows",
    lambda: selection.prepare_row_insertion(2, 3, 3, [1, 2, 3], int),
)

# Row and column mutation snapshot their input. The source can therefore alias
# the target without later writes changing values that have not been read yet.
target = list(range(12))
row = selection.prepare_row_update(3, 4, 1, (target[i] for i in range(4)), int)
assert row == (4, 1, (0, 1, 2, 3))
selection.apply_affine_update(target, 12, row)
assert target == [0, 1, 2, 3, 0, 1, 2, 3, 8, 9, 10, 11]

column = selection.prepare_column_update(
    3, 4, 3, (target[i] for i in (0, 4, 8)), int
)
selection.apply_affine_update(target, 12, column)
assert target == [0, 1, 2, 0, 0, 1, 2, 0, 8, 9, 10, 8]

# Sage checks setter length before the axis number.
raises(
    ValueError,
    "length 4 (not 1)",
    lambda: selection.prepare_row_update(3, 4, 99, [1], int),
)
raises(
    ValueError,
    "length 3 (not 1)",
    lambda: selection.prepare_column_update(3, 4, 99, [1], int),
)

# Conversion and bounds failures happen before a plan can mutate its target.
atomic_target = list(range(12))
before = atomic_target.copy()


def coerce(value):
    if value == "bad":
        raise TypeError("bad entry")
    return int(value)


raises(
    TypeError,
    "bad entry",
    lambda: selection.prepare_row_update(3, 4, 1, [1, 2, "bad", 4], coerce),
)
assert atomic_target == before
raises(
    ValueError,
    "outside the target",
    lambda: selection.apply_affine_update(atomic_target, 12, (100, 1, (1, 2))),
)
assert atomic_target == before

# A block snapshots row-major source values before overwriting an overlapping
# target region. Empty blocks are valid at the trailing edge.
overlap = list(range(16))
block = selection.prepare_block_update(
    4, 4, 1, 1, 2, 2, (overlap[i] for i in (0, 1, 4, 5)), int
)
selection.apply_block_update(overlap, 4, 4, block)
assert overlap == [0, 1, 2, 3, 4, 0, 1, 7, 8, 4, 5, 11, 12, 13, 14, 15]
empty = selection.prepare_block_update(4, 4, 4, 4, 0, 0, [], int)
selection.apply_block_update(overlap, 4, 4, empty)
raises(
    ValueError,
    "does not fit",
    lambda: selection.prepare_block_update(4, 4, 3, 3, 2, 2, range(4), int),
)

# Swaps reject negative axes and snapshot both sides before writing.
swapped = list(range(12))
selection.apply_swap(swapped, selection.prepare_row_swap(3, 4, 0, 2))
assert swapped == [8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3]
selection.apply_swap(swapped, selection.prepare_column_swap(3, 4, 0, 3))
assert swapped == [11, 9, 10, 8, 7, 5, 6, 4, 3, 1, 2, 0]
raises(IndexError, "matrix row", lambda: selection.prepare_row_swap(3, 4, -1, 2))
raises(
    IndexError,
    "matrix column",
    lambda: selection.prepare_column_swap(3, 4, 0, -1),
)

print("linear-matrix-selection-ok")
`.replace("__MATRIX_SELECTION_PATH__", JSON.stringify(modulePath));

const sagejsWitness = String.raw`
from sagejs.linear_algebra.matrix_selection import (
    apply_affine_update,
    apply_block_update,
    apply_swap,
    prepare_block_update,
    prepare_column_swap,
    prepare_row_update,
    select_row_major,
    selection_plan,
)

source = list(range(12))
plan = selection_plan(3, 4, [2, 0, 2], [3, 1, 1])
assert plan == ((2, 0, 2), (3, 1, 1))
assert select_row_major(source, 3, 4, plan) == [11, 9, 9, 3, 1, 1, 11, 9, 9]

row = prepare_row_update(3, 4, 1, source[:4], int)
apply_affine_update(source, 12, row)
assert source == [0, 1, 2, 3, 0, 1, 2, 3, 8, 9, 10, 11]

block = prepare_block_update(3, 4, 0, 1, 2, 2, [20, 21, 22, 23], int)
apply_block_update(source, 3, 4, block)
assert source == [0, 20, 21, 3, 0, 22, 23, 3, 8, 9, 10, 11]

apply_swap(source, prepare_column_swap(3, 4, 0, 3))
assert source == [3, 20, 21, 0, 3, 22, 23, 0, 11, 9, 10, 8]
print("linear-matrix-selection-sagejs-ok")
`;

function runPython(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-matrix-selection-"));
  try {
    const script = join(directory, "witness.py");
    writeFileSync(script, source);
    const executable = process.platform === "win32" ? "python" : "python3";
    const result = spawnSync(executable, [script], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runSageJs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-matrix-selection-js-"));
  try {
    const script = join(directory, "witness.py");
    writeFileSync(script, source);
    const result = spawnSync(join(root, "bin", "sagejs"), ["--python", script], {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("matrix selection and mutation plans match Sage contracts", () => {
  assert.equal(runPython(witness), "linear-matrix-selection-ok");
});

test("the same contract executes in Sage.js Python mode", () => {
  assert.equal(
    runSageJs(sagejsWitness),
    "linear-matrix-selection-sagejs-ok",
  );
});

test("the contract module remains host and representation neutral", () => {
  const source = readFileSync(modulePath, "utf8");
  assert.doesNotMatch(source, /sagejs\.runtime|sagejs\.native|sagejs\.ffi/);
  assert.doesNotMatch(source, /N-API|ArrayBuffer|UInt64Buffer|IntegerBuffer/);
  assert.match(source, /Production\n    resource and packed implementations/);
});
