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
  "matrix_subspaces.py",
);

const pythonWitness = String.raw`
import importlib.util

MODULE_PATH = __MATRIX_SUBSPACES_PATH__
spec = importlib.util.spec_from_file_location("matrix_subspaces", MODULE_PATH)
assert spec is not None and spec.loader is not None
subspaces = importlib.util.module_from_spec(spec)
spec.loader.exec_module(subspaces)


class FakeMatrix:
    def __init__(self, rows, columns, label):
        self.rows = rows
        self.columns = columns
        self.label = label
        self.immutable = False


def dimensions(value):
    return value.rows, value.columns


def exercise_row(rows, columns, matrix_rank):
    calls = {"echelon": 0, "rank": 0, "select": 0, "immutable": 0}
    source = FakeMatrix(rows, columns, "source")

    def echelon_form(value):
        assert value is source
        calls["echelon"] += 1
        return FakeMatrix(rows, columns, "echelon")

    def rank(value):
        assert value.label == "echelon"
        calls["rank"] += 1
        return matrix_rank

    def select_rows(value, indices):
        assert value.label == "echelon"
        assert indices == tuple(range(matrix_rank))
        calls["select"] += 1
        return FakeMatrix(len(indices), columns, "basis")

    def set_immutable(value):
        calls["immutable"] += 1
        value.immutable = True

    result = subspaces.canonical_row_basis(
        source,
        dimensions,
        echelon_form,
        rank,
        select_rows,
        set_immutable,
    )
    assert calls == {"echelon": 1, "rank": 1, "select": 1, "immutable": 1}
    assert result.matrix.immutable
    assert (result.matrix.rows, result.matrix.columns) == (matrix_rank, columns)
    metadata = result.metadata
    assert metadata.orientation == "row"
    assert metadata.ambient_dimension == columns
    assert metadata.rank == matrix_rank
    assert (metadata.basis_rows, metadata.basis_columns) == (matrix_rank, columns)
    assert metadata.already_echelonized is True
    assert metadata.immutable is True


exercise_row(5, 7, 3)
exercise_row(0, 7, 0)
exercise_row(5, 0, 0)

# A column basis transposes once, echelonizes once, and selects rows from that
# result without asking for a host row or scalar entry.
calls = {"transpose": 0, "echelon": 0, "rank": 0, "select": 0}
source = FakeMatrix(5, 7, "source")


def transpose(value):
    assert value is source
    calls["transpose"] += 1
    return FakeMatrix(7, 5, "transpose")


def column_echelon(value):
    assert value.label == "transpose"
    calls["echelon"] += 1
    return FakeMatrix(7, 5, "echelon")


def column_rank(value):
    assert value.label == "echelon"
    calls["rank"] += 1
    return 4


def column_select(value, indices):
    assert indices == (0, 1, 2, 3)
    calls["select"] += 1
    return FakeMatrix(4, 5, "basis")


column = subspaces.canonical_column_basis(
    source,
    dimensions,
    transpose,
    column_echelon,
    column_rank,
    column_select,
    lambda value: setattr(value, "immutable", True),
)
assert calls == {"transpose": 1, "echelon": 1, "rank": 1, "select": 1}
assert column.matrix.immutable
assert column.metadata.orientation == "column"
assert column.metadata.ambient_dimension == 5
assert (column.metadata.basis_rows, column.metadata.basis_columns) == (4, 5)

# Sage 10.9 treats a different row-space base ring as the coefficient ring of
# the generated module, not as a request to change every matrix entry first.
# In particular, matrix(QQ, [[1/2, 0], [0, 1]]).row_space(base_ring=ZZ)
# has base ring ZZ while its immutable basis matrix still has base ring QQ.
cross_source = FakeMatrix(2, 3, "cross-ring-source")


def forbidden(_value):
    raise AssertionError("cross-ring preparation must not echelonize the source")


cross = subspaces.prepare_row_space(
    cross_source,
    "QQ",
    "ZZ",
    lambda left, right: left == right,
    dimensions,
    forbidden,
    forbidden,
    lambda _value, _indices: forbidden(_value),
    forbidden,
)
assert isinstance(cross, subspaces.GeneratorSpan)
assert cross.matrix is cross_source
assert cross.base_ring == "ZZ"
assert cross.ambient_dimension == 3
assert cross.orientation == "row"
assert cross.already_echelonized is False

# None and an equal explicit base ring retain the optimized canonical path.
for requested in [None, "QQ"]:
    prepared = subspaces.prepare_row_space(
        FakeMatrix(2, 3, "source"),
        "QQ",
        requested,
        lambda left, right: left == right,
        dimensions,
        lambda _value: FakeMatrix(2, 3, "echelon"),
        lambda _value: 1,
        lambda _value, indices: FakeMatrix(len(indices), 3, "basis"),
        lambda value: setattr(value, "immutable", True),
    )
    assert isinstance(prepared, subspaces.CanonicalBasis)
    assert prepared.matrix.immutable


def raises(exception, fragment, function):
    try:
        function()
    except exception as error:
        assert fragment in str(error), (fragment, str(error))
        return
    raise AssertionError("expected " + exception.__name__)


raises(
    ValueError,
    "exceeds maximum rank",
    lambda: subspaces.canonical_basis_from_echelon(
        FakeMatrix(2, 3, "echelon"),
        2,
        3,
        "row",
        dimensions,
        lambda _value: 3,
        lambda _value, indices: FakeMatrix(len(indices), 3, "basis"),
        lambda _value: None,
    ),
)
raises(
    ValueError,
    "row selector returned shape",
    lambda: subspaces.canonical_basis_from_echelon(
        FakeMatrix(2, 3, "echelon"),
        2,
        3,
        "row",
        dimensions,
        lambda _value: 1,
        lambda _value, _indices: FakeMatrix(1, 2, "bad-basis"),
        lambda _value: None,
    ),
)
raises(
    ValueError,
    "transpose matrix shape",
    lambda: subspaces.canonical_column_basis(
        FakeMatrix(2, 3, "source"),
        dimensions,
        lambda _value: FakeMatrix(2, 3, "bad-transpose"),
        forbidden,
        forbidden,
        lambda _value, _indices: forbidden(_value),
        forbidden,
    ),
)

print("linear-matrix-subspaces-python-ok")
`.replace("__MATRIX_SUBSPACES_PATH__", JSON.stringify(modulePath));

const sagejsWitness = String.raw`
from sagejs.linear_algebra.matrix_subspaces import (
    CanonicalBasis,
    GeneratorSpan,
    canonical_column_basis,
    canonical_row_basis,
    prepare_row_space,
)


def dimensions(value):
    return value.nrows(), value.ncols()


def finish(value):
    value.set_immutable()


def row_basis(value):
    return canonical_row_basis(
        value,
        dimensions,
        lambda source: source.echelon_form(),
        lambda echelon: echelon.rank(),
        lambda echelon, indices: echelon.matrix_from_rows(indices),
        finish,
    )


def column_basis(value):
    return canonical_column_basis(
        value,
        dimensions,
        lambda source: source.transpose(),
        lambda source: source.echelon_form(),
        lambda echelon: echelon.rank(),
        lambda echelon, indices: echelon.matrix_from_rows(indices),
        finish,
    )


# These basis matrices are direct Sage 10.9 oracles. ZZ uses HNF; fields use
# RREF. GF(2) also verifies reduction before canonicalization.
for base, expected_row, expected_column in [
    (ZZ, matrix(ZZ, [[1, 2, 3]]), matrix(ZZ, [[2, 1, 0]])),
    (QQ, matrix(QQ, [[1, 2, 3]]), matrix(QQ, [[1, QQ(1)/2, 0]])),
    (GF(7), matrix(GF(7), [[1, 2, 3]]), matrix(GF(7), [[1, 4, 0]])),
    (GF(2), matrix(GF(2), [[1, 0, 1]]), matrix(GF(2), [[0, 1, 0]])),
]:
    source = matrix(base, [[2, 4, 6], [1, 2, 3], [0, 0, 0]])
    row = row_basis(source)
    column = column_basis(source)
    assert row.matrix == expected_row, (base, row.matrix, expected_row)
    assert column.matrix == expected_column, (base, column.matrix, expected_column)
    assert row.matrix.is_immutable()
    assert column.matrix.is_immutable()
    assert row.metadata.already_echelonized
    assert column.metadata.already_echelonized
    assert row.metadata.ambient_dimension == 3
    assert column.metadata.ambient_dimension == 3

    zero = zero_matrix(base, 3, 4)
    zero_row = row_basis(zero)
    zero_column = column_basis(zero)
    assert (zero_row.matrix.nrows(), zero_row.matrix.ncols()) == (0, 4)
    assert (zero_column.matrix.nrows(), zero_column.matrix.ncols()) == (0, 3)
    assert zero_row.metadata.rank == 0 and zero_column.metadata.rank == 0
    assert zero_row.matrix.is_immutable() and zero_column.matrix.is_immutable()

# Degenerate dimensions survive the selector; a flat host list would lose
# exactly this information.
for rows, columns in [(0, 4), (3, 0), (0, 0)]:
    source = matrix(QQ, rows, columns, [])
    row = row_basis(source)
    column = column_basis(source)
    assert (row.matrix.nrows(), row.matrix.ncols()) == (0, columns)
    assert (column.matrix.nrows(), column.matrix.ncols()) == (0, rows)
    assert row.matrix.is_immutable() and column.matrix.is_immutable()

source = matrix(ZZ, [[2, 0], [0, 2]])
same = prepare_row_space(
    source,
    source.base_ring(),
    ZZ,
    lambda left, right: left == right,
    dimensions,
    lambda value: value.echelon_form(),
    lambda value: value.rank(),
    lambda value, indices: value.matrix_from_rows(indices),
    finish,
)
assert isinstance(same, CanonicalBasis)
assert same.matrix == matrix(ZZ, [[2, 0], [0, 2]])

different = prepare_row_space(
    source,
    source.base_ring(),
    QQ,
    lambda left, right: left == right,
    dimensions,
    lambda _value: 1 / 0,
    lambda _value: 1 / 0,
    lambda _value, _indices: 1 / 0,
    lambda _value: 1 / 0,
)
assert isinstance(different, GeneratorSpan)
assert different.matrix is source
assert different.base_ring == QQ
assert different.ambient_dimension == 2
assert different.already_echelonized is False

print("linear-matrix-subspaces-sagejs-ok")
`;

function runPython(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-matrix-subspaces-"));
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
  const directory = mkdtempSync(join(tmpdir(), "sagejs-matrix-subspaces-js-"));
  try {
    const script = join(directory, "witness.py");
    writeFileSync(script, source);
    const result = spawnSync(join(root, "bin", "sagejs"), ["--python", script], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
      env: {
        ...process.env,
        SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
        SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
      },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("canonical subspace planning is deterministic in CPython", () => {
  assert.equal(runPython(pythonWitness), "linear-matrix-subspaces-python-ok");
});

test("canonical bases match Sage over ZZ, QQ, GF(7), and GF(2)", () => {
  assert.equal(
    runSageJs(sagejsWitness),
    "linear-matrix-subspaces-sagejs-ok",
  );
});

test("the contract cannot decode matrices or depend on a representation", () => {
  const source = readFileSync(modulePath, "utf8");
  assert.doesNotMatch(source, /sagejs\.runtime|sagejs\.native|sagejs\.ffi/);
  assert.doesNotMatch(source, /\.rows\(|\.list\(|IntegerBuffer|UInt64Buffer|N-API/);
  assert.match(source, /select_rows\(echelon, selected_rows\)/);
  assert.match(source, /already_echelonized = True/);
  assert.match(source, /already_echelonized = False/);
});
