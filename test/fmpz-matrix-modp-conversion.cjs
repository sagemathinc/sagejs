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

calls = 0
regions = []
original_export = ffi.fmpz_matrix_export_mod_ui
def tracked_export(resource, modulus, width):
    global calls
    calls += 1
    region = original_export(resource, modulus, width)
    regions.append(region)
    return region
ffi.fmpz_matrix_export_mod_ui = tracked_export

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

for modulus in [2, 3, 97, 65521, 4294967291]:
    target = source.change_ring(GF(modulus))
    assert target.dimensions() == source.dimensions()
    assert [int(entry.lift()) for entry in target.list()] == [
        value % modulus for value in values
    ]
    if modulus == 2 and m4ri_is_available:
        assert target._has_m4ri_matrix_resource()

# Empty rectangular matrices still cross the same checked bulk boundary.
for rows, columns in [(0, 0), (0, 4), (3, 0)]:
    empty = MatrixSpace(ZZ, rows, columns)(0).change_ring(GF(97))
    assert empty.dimensions() == (rows, columns)
    assert empty.list() == []

# Conversion snapshots the current generated resource and does not alias it.
before = source.change_ring(GF(97))
source[0, 0] = -huge_positive
after = source.change_ring(GF(97))
assert int(before[0, 0].lift()) == huge_positive % 97
assert int(after[0, 0].lift()) == (-huge_positive) % 97
assert calls == 10
assert all(region.closed for region in regions)

print('fmpz-modp-public', calls)
`;

test("ZZ -> small-prime matrices use one generated bulk reduction", () => {
  for (const disabled of [false, true]) {
    const output = runSage(publicBehavior, disabled ? {
      SAGEJS_NATIVE_DISABLE: "1",
    } : {});
    assert.equal(output, "fmpz-modp-public 10");
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
