"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-qq-bulk-construction-"));
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
import sagejs.ffi.flint as ffi

imports = [0]
original_import = ffi.fmpq_matrix_deserialize
original_set = ffi.fmpq_matrix_set_entry
def bulk_import(*args):
    imports[0] += 1
    return original_import(*args)
def forbidden_set(*args):
    raise AssertionError('scalar rational resource ingress was used')
ffi.fmpq_matrix_deserialize = bulk_import
ffi.fmpq_matrix_set_entry = forbidden_set

class Candidate:
    calls = 0

class RationalList(list):
    calls = 0
    def __iter__(self):
        RationalList.calls += 1
        return super().__iter__()

huge = 2**65537 + 17
values = [QQ(1, 2), QQ(-6, 9), 5, QQ(huge, 11)]
packed = runtime.canonical_rational_values_to_packed_bytes(
    values, runtime.rational_class, QQ
)
assert packed is not runtime.undefined
direct = MatrixSpace(QQ, 2, 2)._from_packed_rationals(packed)
assert direct.list() == [QQ(1, 2), QQ(-2, 3), 5, QQ(huge, 11)]

# The intrinsic is deliberately fail-closed: it does not invoke coercion,
# iteration, getters, or arbitrary protocol methods.
candidate = Candidate()
assert runtime.canonical_rational_values_to_packed_bytes(
    [candidate], runtime.rational_class, QQ
) is runtime.undefined
assert Candidate.calls == 0

# Flat, nested, and callable constructors all converge on one bulk resource
# import after their normal Python evaluation semantics have completed.
flat = matrix(QQ, 2, 2, values)
nested_source = RationalList([
    [QQ(1, 2), QQ(-2, 3)],
    [5, QQ(huge, 11)],
])
nested = matrix(QQ, nested_source)
assert RationalList.calls == 1
call_count = [0]
def entry(row, column):
    call_count[0] += 1
    return values[row * 2 + column]
callable_matrix = matrix(QQ, 2, 2, entry)
assert call_count[0] == 4
assert flat == nested and nested == callable_matrix
assert imports[0] == 4

# Unrecognized entries retain the ordinary public QQ coercion failure.
try:
    matrix(QQ, 1, 1, [candidate])
    raise AssertionError('unsupported entry was accepted')
except TypeError:
    pass
assert Candidate.calls == 0

ffi.fmpq_matrix_set_entry = original_set

# Input is copied into the owned resource, and later mutation stays isolated.
values[0] = QQ(99)
assert flat[0, 0] == QQ(1, 2)
flat[0, 0] = QQ(7, 13)
assert flat[0, 0] == QQ(7, 13)
assert nested[0, 0] == QQ(1, 2)

print('dense-qq-bulk-construction-ok')
`;

test("dense QQ constructors bulk-import canonical exact scalars", () => {
  const environment = { SAGEJS_FORBID_QQ_MATRIX_NAPI: "1" };
  assert.equal(runSage(source, environment), "dense-qq-bulk-construction-ok");
  assert.equal(
    runSage(source, { ...environment, SAGEJS_NATIVE_DISABLE: "1" }),
    "dense-qq-bulk-construction-ok",
  );
});
