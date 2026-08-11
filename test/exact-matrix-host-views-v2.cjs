#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-exact-host-v2-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), script], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...environment },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const source = String.raw`
import sagejs.runtime as runtime

ffi = __import__('sagejs.ffi.flint', fromlist=['flint'])
full = [0]
sequences = [0]

original_z_full = ffi.fmpz_matrix_serialize
original_q_full = ffi.fmpq_matrix_serialize
original_z_sequence = ffi.fmpz_matrix_serialize_sequence
original_q_sequence = ffi.fmpq_matrix_serialize_sequence

def z_full(value):
    full[0] += 1
    return original_z_full(value)

def q_full(value):
    full[0] += 1
    return original_q_full(value)

def z_sequence(value, start, stride, count):
    sequences[0] += 1
    return original_z_sequence(value, start, stride, count)

def q_sequence(value, start, stride, count):
    sequences[0] += 1
    return original_q_sequence(value, start, stride, count)

def forbidden(*args):
    raise AssertionError('scalar exact entry boundary was used')

ffi.fmpz_matrix_serialize = z_full
ffi.fmpq_matrix_serialize = q_full
ffi.fmpz_matrix_serialize_sequence = z_sequence
ffi.fmpq_matrix_serialize_sequence = q_sequence
ffi.fmpz_matrix_entry = forbidden
ffi.fmpq_matrix_entry_numerator = forbidden
ffi.fmpq_matrix_entry_denominator = forbidden

def verify(base, values):
    source = matrix(base, 3, 4, values)
    before = full[0]
    rows = source.rows()
    assert full[0] == before + 1
    assert source.rows() is not rows
    assert source.rows(False) is source.rows(False)
    assert source.rows()[0] is rows[0]
    assert all(row.is_immutable() for row in rows)

    before = full[0]
    columns = source.columns()
    assert full[0] == before
    assert source.columns() is not columns
    assert source.columns(False) is source.columns(False)
    assert source.columns()[0] is columns[0]
    assert columns[2][1] is rows[1][2]
    assert all(column.is_immutable() for column in columns)

    try:
        rows[0][0] = 99
        raise AssertionError('cached row was mutable')
    except ValueError:
        pass

    before = sequences[0]
    row = source.row(1, from_list=True)
    column = source.column(2, from_list=True)
    assert sequences[0] == before + 2
    assert row.is_mutable() and column.is_mutable()
    row[0] = 101
    column[0] = 103
    assert source.rows(False)[1][0] == values[4]
    assert source.rows(False)[0][2] == values[2]

    before = sequences[0]
    assert source.diagonal() == [values[0], values[5], values[10]]
    assert source.diagonal(1) == [values[1], values[6], values[11]]
    assert source.diagonal(-1) == [values[4], values[9]]
    assert source.diagonal(4) == []
    assert source.diagonal(-3) == []
    assert sequences[0] == before + 5

    first = source.list()
    second = source.list()
    assert first == values and second == values and first is not second
    first[0] = 1009
    assert source.rows(False) is source.rows(False)

    cached = source.rows(False)
    try:
        source[source.nrows(), 0] = 7
        raise AssertionError('bad mutation succeeded')
    except IndexError:
        pass
    assert source.rows(False) is cached

    snapshot = cached[0]
    source[0, 0] = values[0] + 211
    assert source.rows(False) is not cached
    assert snapshot[0] == values[0]

    mutable = matrix(base, 2, 2, [1, 2, 3, 4])
    cached = mutable.rows(False)
    mutable.subdivide(1, 1)
    assert mutable.rows(False) is not cached
    immutable = matrix(base, 2, 2, [1, 2, 3, 4])
    cached = immutable.rows(False)
    immutable.set_immutable()
    try:
        immutable.subdivide(1, 1)
        raise AssertionError('immutable subdivision succeeded')
    except ValueError:
        pass
    assert immutable.rows(False) is cached

    assert source.rows(1) is not source.rows(False)
    assert source.rows(0) is source.rows(False)
    assert source.columns(1) is not source.columns(False)
    assert source.columns(0) is source.columns(False)
    for invalid in [None, 'yes']:
        try:
            source.rows(invalid)
            raise AssertionError('invalid rows(copy) succeeded')
        except ValueError:
            pass
        try:
            source.columns(invalid)
            raise AssertionError('invalid columns(copy) succeeded')
        except ValueError:
            pass

large = 2**65537 + 31
verify(ZZ, [1, -2, 3, 4, 5, large, -7, 8, 9, 10, 11, -12])
verify(QQ, [
    QQ(1, 2), QQ(-2, 3), 3, 4,
    5, QQ(large, 17), QQ(-7, 11), 8,
    9, 10, QQ(11, large), QQ(-12, 13),
])

for base in [ZZ, QQ]:
    zero_rows = matrix(base, 0, 4)
    assert zero_rows.rows() == []
    assert [zero_rows.column(index).list() for index in range(4)] == [[], [], [], []]
    assert [column.list() for column in zero_rows.columns()] == [[], [], [], []]
    zero_columns = matrix(base, 3, 0)
    assert [zero_columns.row(index).list() for index in range(3)] == [[], [], []]
    assert [row.list() for row in zero_columns.rows()] == [[], [], []]
    assert zero_columns.columns() == []

# The public cache contract is representation-independent even though only
# exact FLINT resources need the new bulk export.
prime = matrix(GF(7), 2, 2, [1, 2, 3, 4])
prime_rows = prime.rows(False)
assert prime.rows(False) is prime_rows
assert prime.columns(False)[0][1] is prime_rows[1][0]
assert prime_rows[0].is_immutable()
prime[0, 0] = 6
assert prime.rows(False) is not prime_rows
assert prime_rows[0][0] == 1

print('exact-matrix-host-views-v2-ok')
`;

const forbidden = {
  SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
  SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
};
assert.equal(runSage(source, forbidden), "exact-matrix-host-views-v2-ok");
assert.equal(
  runSage(source, { ...forbidden, SAGEJS_NATIVE_DISABLE: "1" }),
  "exact-matrix-host-views-v2-ok",
);

const generated = join(root, "packages", "flint", "build", "generated-ffi");
const manifest = require(join(generated, "manifest.json"));
const flint = require(join(generated, manifest.addon));
const integer = flint.ffiFmpzMatrixCreate(2n, 3n);
const rational = flint.ffiFmpqMatrixCreate(2n, 3n);
try {
  for (let index = 0; index < 6; index += 1) {
    assert.equal(
      flint.ffiFmpzMatrixSetEntry(
        integer,
        BigInt(Math.floor(index / 3)),
        BigInt(index % 3),
        BigInt(index + 1),
      ),
      true,
    );
    assert.equal(
      flint.ffiFmpqMatrixSetEntry(
        rational,
        BigInt(Math.floor(index / 3)),
        BigInt(index % 3),
        BigInt(index + 1),
        BigInt(index + 2),
      ),
      true,
    );
  }
  const row = flint.ffiFmpzMatrixSerializeSequence(integer, 3n, 1n, 3n);
  const diagonal = flint.ffiFmpqMatrixSerializeSequence(rational, 0n, 4n, 2n);
  const empty = flint.ffiFmpzMatrixSerializeSequence(
    integer,
    (1n << 64n) - 1n,
    (1n << 64n) - 1n,
    0n,
  );
  assert.ok(flint.ffiFlintByteRegionLength(row) > 0n);
  assert.ok(flint.ffiFlintByteRegionLength(diagonal) > 0n);
  assert.equal(flint.ffiFlintByteRegionLength(empty), 0n);
  flint.ffiFlintByteRegionClose(empty);
  flint.ffiFlintByteRegionClose(diagonal);
  flint.ffiFlintByteRegionClose(row);
  assert.throws(
    () => flint.ffiFmpzMatrixSerializeSequence(integer, 5n, 2n, 2n),
    /invalid integer matrix entry sequence/,
  );
  assert.throws(
    () => flint.ffiFmpzMatrixSerializeSequence(rational, 0n, 1n, 1n),
    /FmpzMatrix/,
  );
} finally {
  flint.ffiFmpqMatrixClose(rational);
  flint.ffiFmpzMatrixClose(integer);
}
assert.throws(
  () => flint.ffiFmpzMatrixSerializeSequence(integer, 0n, 1n, 1n),
  /closed/,
);

console.log("exact matrix host views v2 tests passed");
