#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-fmpz-modp-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), script], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...environment },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const publicBehavior = String.raw`
import sagejs.ffi.flint as ffi
import sagejs.ffi.m4ri as m4ri
import sagejs.runtime as runtime

huge_positive = 2**65537 + 2**521 + 17
huge_negative = -(2**32771 + 2**333 + 29)
values = [
    huge_positive, huge_negative, -1, 0,
    1, 2, 96, 97, 98, -(2**4099) + 5,
]
source = matrix(ZZ, 2, 5, values)

# The existing reducer is explicitly a 32-bit ABI. The next prime above that
# boundary remains correct through the scalar fallback and still publishes the
# canonical word-prime resource; it must not be silently truncated.
wide_fallback_modulus = 4294967311
wide_fallback = source.change_ring(GF(wide_fallback_modulus))
assert wide_fallback._has_nmod_matrix_resource()
assert [int(entry.lift()) for entry in wide_fallback.list()] == [
    value % wide_fallback_modulus for value in values
]

calls = 0
regions = []
nmod_resources = []
original_export = ffi.fmpz_matrix_export_mod_ui
original_nmod_from_entries = ffi.nmod_matrix_from_entries
def tracked_export(resource, modulus, width):
    global calls
    calls += 1
    region = original_export(resource, modulus, width)
    regions.append(region)
    return region
def tracked_nmod_from_entries(entries, entry_count, rows, columns, modulus):
    resource = original_nmod_from_entries(
        entries, entry_count, rows, columns, modulus
    )
    nmod_resources.append(resource)
    return resource
ffi.fmpz_matrix_export_mod_ui = tracked_export
ffi.nmod_matrix_from_entries = tracked_nmod_from_entries

def forbidden(*args):
    raise AssertionError('ZZ host Integer materialization was used')

ffi.fmpz_matrix_entry = forbidden
ffi.fmpz_matrix_serialize = forbidden
ffi.fmpz_matrix_serialize_sequence = forbidden
runtime.integer_buffer_from_packed_bytes = forbidden

try:
    m4ri_is_available = bool(m4ri.available())
except Exception:
    m4ri_is_available = False

moduli = [2, 3, 97, 65521, 4294967291]
for modulus in moduli:
    target = source.change_ring(GF(modulus))
    assert target.dimensions() == source.dimensions()
    if modulus < 256:
        assert target._has_packed_prime_storage()
    else:
        assert target._has_nmod_matrix_resource()
    assert [int(entry.lift()) for entry in target.list()] == [
        value % modulus for value in values
    ]
    if modulus == 2 and m4ri_is_available:
        assert target._has_m4ri_matrix_resource()

# Empty rectangular matrices still cross both canonical storage boundaries.
empty_shapes = [(0, 0), (0, 4), (3, 0)]
for modulus in [97, 65521]:
    for rows, columns in empty_shapes:
        empty = MatrixSpace(ZZ, rows, columns)(0).change_ring(GF(modulus))
        assert empty.dimensions() == (rows, columns)
        if modulus >= 256:
            assert empty._has_nmod_matrix_resource()
        assert empty.list() == []

# Conversion snapshots the current generated resource and does not alias it.
before = source.change_ring(GF(97))
source[0, 0] = -huge_positive
after = source.change_ring(GF(97))
assert int(before[0, 0].lift()) == huge_positive % 97
assert int(after[0, 0].lift()) == (-huge_positive) % 97
assert calls == len(moduli) + 2 * len(empty_shapes) + 2
assert all(region.closed for region in regions)
assert len(nmod_resources) == 5
assert all(not resource.closed for resource in nmod_resources)

# The copied export closes even when publication into the canonical nmod
# resource fails after reduction.
def failing_nmod_from_entries(*args):
    raise RuntimeError('injected nmod construction failure')
ffi.nmod_matrix_from_entries = failing_nmod_from_entries
try:
    source.change_ring(GF(65521))
    raise AssertionError('injected nmod construction failure was ignored')
except RuntimeError as error:
    assert str(error) == 'injected nmod construction failure'
finally:
    ffi.nmod_matrix_from_entries = tracked_nmod_from_entries
assert calls == len(moduli) + 2 * len(empty_shapes) + 3
assert regions[-1].closed

# Parent validation deterministically closes a constructed nmod resource that
# cannot be published because its modulus disagrees with the target field.
rejected_resources = []
def mismatched_nmod_from_entries(entries, entry_count, rows, columns, modulus):
    zeros = runtime.uint64_buffer(entry_count)
    resource = original_nmod_from_entries(zeros, entry_count, rows, columns, 97)
    rejected_resources.append(resource)
    return resource
ffi.nmod_matrix_from_entries = mismatched_nmod_from_entries
try:
    source.change_ring(GF(65521))
    raise AssertionError('wrong-modulus nmod resource was accepted')
except ValueError as error:
    assert str(error) == 'word-prime matrix resource parent does not agree'
finally:
    ffi.nmod_matrix_from_entries = tracked_nmod_from_entries
assert calls == len(moduli) + 2 * len(empty_shapes) + 4
assert len(rejected_resources) == 1 and rejected_resources[0].closed
assert regions[-1].closed

for resource in nmod_resources:
    resource.close()
assert all(resource.closed for resource in nmod_resources)

print('fmpz-modp-public', calls)
`;

test("ZZ -> prime matrices use 32-bit bulk reduction and honest wider fallback", () => {
  for (const disabled of [false, true]) {
    const output = runSage(publicBehavior, disabled ? {
      SAGEJS_NATIVE_DISABLE: "1",
    } : {});
    assert.equal(output, "fmpz-modp-public 15");
  }
});

test("generated modular export validates resources, modulus, and width", () => {
  const flint = require("../packages/flint");
  const matrix = flint.ffiFmpzMatrixCreate(1n, 4n);
  const values = [-(1n << 521n) - 17n, -1n, 0n, (1n << 333n) + 9n];
  try {
    for (let index = 0; index < values.length; index += 1) {
      assert.equal(
        flint.ffiFmpzMatrixSetEntry(matrix, 0n, BigInt(index), values[index]),
        true,
      );
    }
    for (const [modulus, width] of [[2n, 1n], [97n, 1n], [65521n, 2n], [4294967291n, 4n]]) {
      const region = flint.ffiFmpzMatrixExportModUi(matrix, modulus, width);
      try {
        const actual = [...flint.ffiFlintByteRegionCopyBytes(region)];
        const expected = [];
        for (const value of values) {
          const residue = ((value % modulus) + modulus) % modulus;
          for (let byte = 0n; byte < width; byte += 1n) {
            expected.push(Number((residue >> (8n * byte)) & 255n));
          }
        }
        assert.deepEqual(actual, expected);
      } finally {
        flint.ffiFlintByteRegionClose(region);
      }
    }
    for (const args of [[1n, 1n], [65521n, 1n], [4294967296n, 4n], [97n, 3n]]) {
      assert.throws(
        () => flint.ffiFmpzMatrixExportModUi(matrix, ...args),
        /integer matrix modular export failed/,
      );
    }
  } finally {
    flint.ffiFmpzMatrixClose(matrix);
  }
  assert.throws(
    () => flint.ffiFmpzMatrixExportModUi(matrix, 97n, 1n),
    /FFI resource is closed/,
  );
});
