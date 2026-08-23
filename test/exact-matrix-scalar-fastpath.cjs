#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

function runSage(environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-exact-scalar-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, String.raw`
import sagejs.runtime as runtime

huge = 2**4097 + 19
integers = matrix(ZZ, 2, 3, [0, -1, huge, -huge, 7, 11])
rationals = matrix(QQ, 2, 3, [
    0, -QQ(1, 2), QQ(huge, 97), QQ(-huge, 101), QQ(7, 11), 13,
])

assert integers[0, 0] == 0
assert integers[-1, -1] == 11
assert integers[0, -1] == huge
assert rationals[0, 0] == 0
assert rationals[-1, -1] == 13
assert rationals[0, -1] == QQ(huge, 97)
assert rationals[0, -1].numerator() == huge
assert rationals[0, -1].denominator() == 97

for source in [integers, rationals]:
    for index in [(-3, 0), (2, 0), (0, -4), (0, 3)]:
        try:
            source[index[0], index[1]]
            raise AssertionError('out-of-bounds exact matrix read succeeded')
        except IndexError:
            pass
    try:
        source[0, 0, 0]
        raise AssertionError('three-component matrix read succeeded')
    except IndexError:
        pass

class RationalSubclass(Rational):
    pass

integers[0, 0] = QQ(37)
rationals[0, 0] = RationalSubclass(17, 23)
assert integers[0, 0] == 37
assert rationals[0, 0] == QQ(17, 23)
for source in [integers, rationals]:
    before = source[0, 0]
    try:
        source[0, 0] = object()
        raise AssertionError('hostile exact matrix value was accepted')
    except TypeError:
        pass
    assert source[0, 0] == before

# Successful scalar writes invalidate every derived public view and algebraic
# result, while failed writes leave the existing snapshots valid.
for base in [ZZ, QQ]:
    source = matrix(base, 2, 2, [1, 2, 3, 5])
    determinant = source.det()
    rank = source.rank()
    rows = source.rows(False)
    columns = source.columns(False)
    values = source.list()
    charpoly = source.charpoly()
    minpoly = source.minpoly()
    charpoly_map = source._charpoly_cache
    minpoly_map = source._minpoly_cache

    try:
        source[2, 0] = 99
        raise AssertionError('out-of-bounds exact matrix write succeeded')
    except IndexError:
        pass
    assert source.det() is determinant
    assert source.rank() == rank
    assert source.rows(False) is rows
    assert source.columns(False) is columns

    source[0, 0] = 7
    assert source[0, 0] == 7
    assert source.det() != determinant
    assert source.rows(False) is not rows
    assert source.columns(False) is not columns
    assert values[0] == 1
    assert source.charpoly() != charpoly
    assert source.minpoly() != minpoly
    assert source._charpoly_cache is charpoly_map
    assert source._minpoly_cache is minpoly_map

    immutable = source.__copy__()
    immutable.set_immutable()
    try:
        immutable[0, 0] = 1
        raise AssertionError('immutable exact matrix write succeeded')
    except ValueError:
        pass

# Repeated scalar construction does not materialize the obsolete uniform-limb
# compatibility representation.
for base in [ZZ, QQ]:
    source = zero_matrix(base, 8)
    for index in range(1000):
        source[index % 8, (index * 5) % 8] = index - 500
    if base is ZZ:
        assert runtime.reflect.get(
            source._integer_storage_cache, 'entries'
        ) is runtime.undefined
    else:
        assert runtime.reflect.get(
            source._rational_storage_cache, 'numerators'
        ) is runtime.undefined
        assert runtime.reflect.get(
            source._rational_storage_cache, 'denominators'
        ) is runtime.undefined

print('exact-matrix-scalar-fastpath-ok')
`);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), script],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
          SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
          ...environment,
        },
        timeout: 120_000,
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "exact-matrix-scalar-fastpath-ok");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

runSage();
runSage({ SAGEJS_NATIVE_DISABLE: "1" });
console.log("exact matrix scalar fast paths passed");
