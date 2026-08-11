"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-exact-matrix-ingress-"));
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
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const construction = String.raw`
import sagejs.runtime as runtime
import sagejs.ffi.flint as ffi
from sagejs_serialization import dumps, loads

def forbidden(*args):
    raise AssertionError('uniform or scalar exact-matrix ingress was used')

# These were the old construction and SagePack load boundaries.  Production
# ingress must remain correct when all four are unavailable.
runtime.integer_buffer_from_packed_bytes = forbidden
runtime.rational_buffers_from_packed_bytes = forbidden
ffi.fmpz_matrix_set_entry = forbidden
ffi.fmpq_matrix_set_entry = forbidden

created_regions = []
original_from_bytes = ffi.FlintByteRegion.from_bytes

def tracked_from_bytes(source):
    region = original_from_bytes(source)
    created_regions.append(region)
    return region

ffi.FlintByteRegion.from_bytes = tracked_from_bytes

huge = 2**65537 + 17
zvalues = [1, -2, 0, huge, -huge, 7]
qvalues = [QQ(1, 2), QQ(-2, 3), 0, QQ(huge, 17), QQ(-5, huge), 7]
Z = matrix(ZZ, 2, 3, zvalues)
Q = matrix(QQ, 2, 3, qvalues)
assert Z.list() == zvalues
assert Q.list() == qvalues
assert all(region.closed for region in created_regions)

zroundtrip = loads(dumps(Z))
qroundtrip = loads(dumps(Q))
assert zroundtrip == Z and qroundtrip == Q
assert all(region.closed for region in created_regions)

# Ordinary rational construction preserves Sage coercion.  Packed persisted
# input is canonicalized by FLINT after the byte stream is fully validated.
space = MatrixSpace(QQ, 1, 2)
parts = runtime.exact_integer_values_to_packed_bytes([2, 4, -15, 35])
normalized = space._from_packed_rationals(parts)
assert normalized.list() == [QQ(1, 2), QQ(-3, 7)]

for ring in [ZZ, QQ]:
    assert MatrixSpace(ring, 0, 3)([]).dimensions() == (0, 3)
    assert MatrixSpace(ring, 3, 0)([]).dimensions() == (3, 0)
    assert MatrixSpace(ring, 0, 0)([]).dimensions() == (0, 0)

rows = 180
cols = 220
zlarge_values = [(17 * index - 31) ** 3 for index in range(rows * cols)]
zlarge = matrix(ZZ, rows, cols, zlarge_values)
assert zlarge[0, 0] == (-31) ** 3
assert zlarge[79, 113] == (17 * (79 * cols + 113) - 31) ** 3
assert zlarge[rows - 1, cols - 1] == (17 * (rows * cols - 1) - 31) ** 3

qrows = 120
qcols = 160
qlarge_values = [
    QQ((index % 37) - 18, (index % 19) + 1)
    for index in range(qrows * qcols)
]
qlarge = matrix(QQ, qrows, qcols, qlarge_values)
assert qlarge[0, 0] == QQ(-18)
assert qlarge[67, 101] == qlarge_values[67 * qcols + 101]
assert qlarge[qrows - 1, qcols - 1] == qlarge_values[-1]
assert loads(dumps(zlarge)) == zlarge
assert loads(dumps(qlarge)) == qlarge
assert all(region.closed for region in created_regions)

# The public rows-plus-flat-list form may reuse an exact built-in list while
# importing it, but the resulting FLINT resource must never alias that list.
owned_source = [1, 2, 3, 4, 5, 6]
owned = matrix(ZZ, 2, owned_source)
owned_source[0] = 999
owned_source.append(7)
assert owned.dimensions() == (2, 3)
assert owned.list() == [1, 2, 3, 4, 5, 6]

# A list subclass is an arbitrary Python iterable: its iteration semantics
# remain observable and therefore must not take the exact-built-in-list path.
class RewritingList(list):
    def __iter__(self):
        return iter([11, 12, 13, 14])

rewritten = RewritingList([1, 2, 3, 4])
assert matrix(ZZ, 2, rewritten).list() == [11, 12, 13, 14]

def generated_entries():
    for entry in [21, 22, 23, 24]:
        yield entry

assert matrix(ZZ, 2, generated_entries()).list() == [21, 22, 23, 24]

print('bulk-exact-matrix-construction', len(created_regions))
`;

test("ZZ and QQ construction and SagePack load use one variable byte stream", () => {
  for (const nativeDisabled of [false, true]) {
    const output = runSage(construction, {
      SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
      SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
      ...(nativeDisabled ? { SAGEJS_NATIVE_DISABLE: "1" } : {}),
    });
    assert.match(output, /^bulk-exact-matrix-construction [1-9][0-9]*$/);
  }
});

test("generated copied-byte ingress owns an independent checked copy", () => {
  const flint = require("../packages/flint");
  const source = new Uint8Array([0, 1, 127, 128, 255]);
  const region = flint.ffiFlintByteRegionFromBytes(source);
  source.fill(42);
  assert.deepEqual(
    [...flint.ffiFlintByteRegionCopyBytes(region)],
    [0, 1, 127, 128, 255],
  );
  flint.ffiFlintByteRegionClose(region);
  assert.throws(
    () => flint.ffiFlintByteRegionCopyBytes(region),
    /FFI resource is closed/,
  );

  for (const invalid of [[], new Uint16Array([1, 2]), "bytes", null]) {
    assert.throws(
      () => flint.ffiFlintByteRegionFromBytes(invalid),
      /requires a Uint8Array/,
    );
  }
  assert.throws(
    () => flint.ffiFlintByteRegionFromBytes(),
    /requires exactly one Uint8Array/,
  );
  assert.throws(
    () => flint.ffiFlintByteRegionFromBytes(
      new Uint8Array(0),
      new Uint8Array(0),
    ),
    /requires exactly one Uint8Array/,
  );
  // A rejected ingress does not poison later ownership or cleanup.
  const later = flint.ffiFlintByteRegionFromBytes(new Uint8Array(0));
  assert.equal(flint.ffiFlintByteRegionCopyBytes(later).length, 0);
  flint.ffiFlintByteRegionClose(later);
});

const malformed = String.raw`
import sagejs.runtime as runtime

def copied(source, extra=0):
    constructor = runtime.reflect.get(runtime.global_object, 'Uint8Array')
    result = runtime.reflect.construct(constructor, [len(source) + extra])
    setter = runtime.reflect.get(result, 'set')
    runtime.reflect.apply(setter, result, [source])
    return result

def rejected(callable, payload):
    try:
        callable(payload)
    except ValueError:
        return
    raise AssertionError('malformed packed matrix was accepted')

Z = MatrixSpace(ZZ, 1, 1)
Q = MatrixSpace(QQ, 1, 1)

z = runtime.exact_integer_values_to_packed_bytes([1])
rejected(Z._from_packed_integers, runtime.reflect.apply(
    runtime.reflect.get(z, 'subarray'), z, [0, len(z) - 1]
))
trailing = copied(z, 1)
trailing[len(trailing) - 1] = 99
rejected(Z._from_packed_integers, trailing)
negative_zero = runtime.exact_integer_values_to_packed_bytes([0])
negative_zero[3] = 128
rejected(Z._from_packed_integers, negative_zero)
noncanonical = copied(z, 1)
noncanonical[0] = 2
noncanonical[len(noncanonical) - 1] = 0
rejected(Z._from_packed_integers, noncanonical)

q = runtime.exact_integer_values_to_packed_bytes([1, 2])
rejected(Q._from_packed_rationals, runtime.reflect.apply(
    runtime.reflect.get(q, 'subarray'), q, [0, len(q) - 1]
))
qtrailing = copied(q, 1)
qtrailing[len(qtrailing) - 1] = 1
rejected(Q._from_packed_rationals, qtrailing)
negative_denominator = copied(q)
negative_denominator[8] = 128
rejected(Q._from_packed_rationals, negative_denominator)
zero_denominator = runtime.exact_integer_values_to_packed_bytes([1, 0])
rejected(Q._from_packed_rationals, zero_denominator)

print('malformed-exact-matrix-inputs-rejected')
`;

test("bulk exact matrix parsers reject malformed and trailing bytes", () => {
  assert.equal(
    runSage(malformed, {
      SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
      SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
    }),
    "malformed-exact-matrix-inputs-rejected",
  );
});
