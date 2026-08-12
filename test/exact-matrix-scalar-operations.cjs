#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const sagejs = resolve(root, "bin", "sagejs");

function evaluate(source, environment = {}) {
  const directory = mkdtempSync(resolve(tmpdir(), "sagejs-matrix-scalar-"));
  try {
    const filename = resolve(directory, "check.py");
    writeFileSync(filename, source);
    const result = spawnSync(process.execPath, [sagejs, filename], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
        SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
        ...environment,
      },
      timeout: 120_000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const correctness = String.raw`
import sagejs.runtime as runtime


def assert_direct_resource(value):
    if value.base_ring() is ZZ:
        assert value._has_fmpz_matrix_resource()
        assert runtime.reflect.get(
            value._integer_storage_cache, "entries"
        ) is runtime.undefined
    else:
        assert value.base_ring() is QQ
        assert value._has_fmpq_matrix_resource()
        assert runtime.reflect.get(
            value._rational_storage_cache, "numerators"
        ) is runtime.undefined
        assert runtime.reflect.get(
            value._rational_storage_cache, "denominators"
        ) is runtime.undefined


huge = 2**4097 + 19
integers = matrix(ZZ, 2, 3, [0, -1, huge, -huge, 7, 11])
rationals = matrix(QQ, 2, 3, [
    0,
    -QQ(1) / 2,
    QQ(huge) / 97,
    -QQ(huge) / 101,
    QQ(7) / 11,
    13,
])
integer_values = integers.list()
rational_values = rationals.list()

class RationalSubclass(Rational):
    pass

integer_cases = [
    (-integers, ZZ, [-value for value in integer_values]),
    (integers * huge, ZZ, [value * huge for value in integer_values]),
    (huge * integers, ZZ, [huge * value for value in integer_values]),
    (integers * 0, ZZ, [0 for value in integer_values]),
    (integers * (QQ(-17) / 19), QQ,
        [value * QQ(-17) / 19 for value in integer_values]),
    ((QQ(-17) / 19) * integers, QQ,
        [QQ(-17) * value / 19 for value in integer_values]),
    (integers / -17, QQ, [QQ(value) / -17 for value in integer_values]),
    (integers / (QQ(-17) / 19), QQ,
        [QQ(value) * QQ(-19) / 17 for value in integer_values]),
]

rational_scalar = RationalSubclass(-17, 19)
rational_cases = [
    (-rationals, QQ, [-value for value in rational_values]),
    (rationals * huge, QQ, [value * huge for value in rational_values]),
    (huge * rationals, QQ, [huge * value for value in rational_values]),
    (rationals * rational_scalar, QQ,
        [value * rational_scalar for value in rational_values]),
    (rational_scalar * rationals, QQ,
        [rational_scalar * value for value in rational_values]),
    (rationals / rational_scalar, QQ,
        [value * QQ(-19) / 17 for value in rational_values]),
]

for result, base, expected in integer_cases + rational_cases:
    assert result.base_ring() is base
    assert result.list() == expected
    assert_direct_resource(result)

assert integers.list() == integer_values
assert rationals.list() == rational_values
assert_direct_resource(integers)
assert_direct_resource(rationals)

for source in [integers, rationals]:
    for zero in [0, ZZ(0), QQ(0)]:
        try:
            source / zero
            raise AssertionError("exact matrix division by zero succeeded")
        except ZeroDivisionError:
            pass
    try:
        source * object()
        raise AssertionError("hostile exact matrix scalar succeeded")
    except TypeError:
        pass

for base in [ZZ, QQ]:
    empty = matrix(base, 0, 3, [])
    for result in [-empty, empty * -17, empty / (QQ(-17) / 19)]:
        assert result.nrows() == 0
        assert result.ncols() == 3
        assert_direct_resource(result)

# A scalar result owns a distinct idempotently closable resource. Closing it
# must neither close nor materialize its source.
integer_temporary = -integers
integer_temporary._integer_resource().close()
integer_temporary._integer_resource().close()
rational_temporary = rationals / (QQ(17) / 19)
rational_temporary._rational_resource().close()
rational_temporary._rational_resource().close()
assert integers[0, 2] == huge
assert rationals[0, 2] == QQ(huge) / 97
assert_direct_resource(integers)
assert_direct_resource(rationals)

print("exact-matrix-scalar-operations-ok")
`;

for (const environment of [
  {},
  { SAGEJS_NATIVE_DISABLE: "1" },
]) {
  assert.equal(
    evaluate(correctness, environment),
    "exact-matrix-scalar-operations-ok",
  );
}

const trace = evaluate(String.raw`
integers = matrix(ZZ, 2, 2, [1, -2, 3, 4])
rationals = matrix(QQ, 2, 2, [QQ(1) / 2, QQ(-2) / 3, 3, QQ(4) / 5])
-integers
integers * 17
-rationals
rationals * (QQ(17) / 19)
rationals / (QQ(17) / 19)
integers / 17
`, { SAGEJS_NATIVE_TRACE: "1" });

assert.equal(trace, [
  "[sagejs native] Matrix.negate ZZ 2x2 -> generated-flint-resource",
  "[sagejs native] Matrix.scalar_multiply ZZ 2x2 -> generated-flint-resource",
  "[sagejs native] Matrix.negate QQ 2x2 -> generated-flint-resource",
  "[sagejs native] Matrix.scalar_multiply QQ 2x2 -> generated-flint-resource",
  "[sagejs native] Matrix.scalar_divide QQ 2x2 -> generated-flint-resource",
  "[sagejs native] Matrix.scalar_multiply QQ 2x2 -> generated-flint-resource",
].join("\n"));

console.log("exact matrix scalar operations passed");
