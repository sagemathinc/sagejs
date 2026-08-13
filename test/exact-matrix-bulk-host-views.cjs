#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-exact-matrix-views-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), script],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...environment },
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const behavior = String.raw`
import sagejs.runtime as runtime

ffi = __import__('sagejs.ffi.flint', fromlist=['flint'])

integer = matrix(ZZ, 3, 4, [
    1, -2, 3, -4,
    5, 0, -7, 8,
    9, 10, 11, -12,
])
rational = matrix(QQ, 3, 4, [
    QQ(1, 2), QQ(-2, 3), 3, QQ(-4, 5),
    QQ(5, 7), 0, QQ(-7, 11), QQ(8, 13),
    9, QQ(10, 17), QQ(11, 19), QQ(-12, 23),
])

integer_expected = [1, -2, 3, -4, 5, 0, -7, 8, 9, 10, 11, -12]
rational_expected = [
    QQ(1, 2), QQ(-2, 3), 3, QQ(-4, 5),
    QQ(5, 7), 0, QQ(-7, 11), QQ(8, 13),
    9, QQ(10, 17), QQ(11, 19), QQ(-12, 23),
]

integer_serializations = [0]
rational_serializations = [0]
integer_sequences = [0]
rational_sequences = [0]
serialized_regions = []

original_integer_serialize = ffi.fmpz_matrix_serialize
original_rational_serialize = ffi.fmpq_matrix_serialize
original_integer_sequence = ffi.fmpz_matrix_serialize_sequence
original_rational_sequence = ffi.fmpq_matrix_serialize_sequence

def integer_serialize(source):
    integer_serializations[0] += 1
    region = original_integer_serialize(source)
    serialized_regions.append(region)
    return region

def rational_serialize(source):
    rational_serializations[0] += 1
    region = original_rational_serialize(source)
    serialized_regions.append(region)
    return region

def integer_sequence(source, start, stride, count):
    integer_sequences[0] += 1
    region = original_integer_sequence(source, start, stride, count)
    serialized_regions.append(region)
    return region

def rational_sequence(source, start, stride, count):
    rational_sequences[0] += 1
    region = original_rational_sequence(source, start, stride, count)
    serialized_regions.append(region)
    return region

def forbidden(*args):
    raise AssertionError('scalar or uniform exact-matrix boundary was used')

ffi.fmpz_matrix_serialize = integer_serialize
ffi.fmpq_matrix_serialize = rational_serialize
ffi.fmpz_matrix_serialize_sequence = integer_sequence
ffi.fmpq_matrix_serialize_sequence = rational_sequence
ffi.fmpz_matrix_entry = forbidden
ffi.fmpq_matrix_entry_numerator = forbidden
ffi.fmpq_matrix_entry_denominator = forbidden
runtime.integer_buffer_from_packed_bytes = forbidden
runtime.rational_buffers_from_packed_bytes = forbidden

def storage_is_unmaterialized(source):
    if source.base_ring() is ZZ:
        storage = source._integer_storage_cache
        assert runtime.reflect.get(storage, 'entries') is runtime.undefined
    else:
        storage = source._rational_storage_cache
        assert runtime.reflect.get(storage, 'numerators') is runtime.undefined
        assert runtime.reflect.get(storage, 'denominators') is runtime.undefined

def verify(source, expected, rational_source, expected_pivots):
    serializations = rational_serializations if rational_source else integer_serializations
    sequences = rational_sequences if rational_source else integer_sequences

    before = serializations[0]
    assert source.list() == expected
    assert serializations[0] == before + 1
    assert serialized_regions[-1].closed
    storage_is_unmaterialized(source)

    before = serializations[0]
    rows = source.rows()
    assert [entry for row in rows for entry in row] == expected
    # list() populated the canonical immutable host-value cache above.
    # Constructing row vectors reuses that snapshot instead of exporting the
    # unchanged FLINT resource a second time.
    assert serializations[0] == before
    assert serialized_regions[-1].closed
    storage_is_unmaterialized(source)

    assert source.rows(False) is source.rows(False)
    assert source.rows()[0] is rows[0]
    assert rows[0].is_immutable()

    before = serializations[0]
    columns = source.columns()
    rebuilt = []
    for row in range(source.nrows()):
        for column in range(source.ncols()):
            rebuilt.append(columns[column][row])
    assert rebuilt == expected
    assert serializations[0] == before
    assert source.columns(False) is source.columns(False)
    assert source.columns()[0] is columns[0]
    assert columns[0].is_immutable()
    assert columns[0][0] is rows[0][0]
    storage_is_unmaterialized(source)

    before_serializations = serializations[0]
    before_sequences = sequences[0]
    selected_row = source.row(-1, from_list=True)
    assert selected_row.list() == (
        expected[(source.nrows() - 1) * source.ncols() :]
    )
    assert selected_row.is_mutable()
    assert serializations[0] == before_serializations
    assert sequences[0] == before_sequences + 1
    assert serialized_regions[-1].closed
    storage_is_unmaterialized(source)

    before = serializations[0]
    assert source.pivots() == expected_pivots
    # Exact pivot discovery exports only bounded pivot metadata through its
    # generated FFI query; it does not serialize the unchanged matrix.
    assert serializations[0] == before
    storage_is_unmaterialized(source)

    before_serializations = serializations[0]
    before_sequences = sequences[0]
    selected_column = source.column(-1, from_list=True)
    assert selected_column.list() == (
        expected[source.ncols() - 1 :: source.ncols()]
    )
    assert selected_column.is_mutable()
    assert serializations[0] == before_serializations
    assert sequences[0] == before_sequences + 1
    assert serialized_regions[-1].closed
    storage_is_unmaterialized(source)

    try:
        source.row(-source.nrows() - 1)
        raise AssertionError('invalid negative row did not fail')
    except IndexError:
        pass
    try:
        source.column(source.ncols())
        raise AssertionError('invalid column did not fail')
    except IndexError:
        pass

verify(integer, integer_expected, False, (0, 1, 2))
verify(rational, rational_expected, True, (0, 1, 2))

# Returned vectors own ordinary host values rather than views into mutable FLINT
# storage.  Later matrix mutation cannot change an earlier row or column.
old_integer_row = integer.row(0)
old_rational_column = rational.column(0)
integer[0, 0] = 101
rational[0, 0] = QQ(103, 107)
assert old_integer_row[0] == 1
assert old_rational_column[0] == QQ(1, 2)
assert integer.row(0)[0] == 101
assert rational.column(0)[0] == QQ(103, 107)
storage_is_unmaterialized(integer)
storage_is_unmaterialized(rational)

# Highly skewed exact entries exercise the variable-length format directly.
large_4097 = 2**4097 + 159
large_32769 = 2**32769 + 93
large_65537 = 2**65537 + 27
skew_integer = matrix(ZZ, 2, 3, [
    0, large_4097, -large_65537,
    17, -large_32769, 23,
])
skew_rational = matrix(QQ, 2, 3, [
    0, QQ(large_65537, 3), QQ(1, large_32769),
    QQ(-large_4097, 5), 17, QQ(23, large_4097),
])
verify(
    skew_integer,
    [0, large_4097, -large_65537, 17, -large_32769, 23],
    False,
    (0, 1),
)
verify(skew_rational, [
    0, QQ(large_65537, 3), QQ(1, large_32769),
    QQ(-large_4097, 5), 17, QQ(23, large_4097),
], True, (0, 1))

# Empty dimensions still return the Sage-compatible number of empty vectors.
for base in [ZZ, QQ]:
    empty_rows = matrix(base, 0, 4)
    empty_columns = matrix(base, 3, 0)
    assert empty_rows.list() == []
    assert empty_rows.rows() == []
    assert [column.list() for column in empty_rows.columns()] == [[], [], [], []]
    assert empty_columns.list() == []
    assert [row.list() for row in empty_columns.rows()] == [[], [], []]
    assert empty_columns.columns() == []
    storage_is_unmaterialized(empty_rows)
    storage_is_unmaterialized(empty_columns)

print('exact-matrix-bulk-host-views-ok')
`;

const forbidden = {
  SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
  SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
};

assert.equal(
  runSage(behavior, forbidden),
  "exact-matrix-bulk-host-views-ok",
);
assert.equal(
  runSage(behavior, { ...forbidden, SAGEJS_NATIVE_DISABLE: "1" }),
  "exact-matrix-bulk-host-views-ok",
);

console.log("exact matrix bulk host-view tests passed");
