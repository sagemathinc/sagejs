"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-dense-qq-host-"));
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
import sagejs.ffi.flint as ffi
from sagejs_serialization import dumps, loads

promotions = [0]
full_exports = [0]
temporary_integers = []

original_promote = ffi.fmpq_matrix_from_fmpz
original_full_export = ffi.fmpq_matrix_serialize
original_rational_set = ffi.fmpq_matrix_set_entry
original_integer_set = ffi.fmpz_matrix_set_entry

def promote(value):
    promotions[0] += 1
    temporary_integers.append(value)
    return original_promote(value)

def full_export(value):
    full_exports[0] += 1
    return original_full_export(value)

def forbidden_set(*args):
    raise AssertionError('scalar exact matrix ingress was used')

ffi.fmpq_matrix_from_fmpz = promote
ffi.fmpq_matrix_serialize = full_export
ffi.fmpq_matrix_set_entry = forbidden_set
ffi.fmpz_matrix_set_entry = forbidden_set

huge = 2**65537 + 17
source_values = [1, -2, 0, huge, -huge, 7, 11, 13, -17, 19, 23, -29]
Q = matrix(QQ, 3, 4, source_values)
assert promotions[0] == 1
assert len(temporary_integers) == 1 and temporary_integers[0].closed
assert Q[0, 0] == 1 and Q[1, 0] == -huge and Q[2, 3] == -29

# The resource owns an independent copy of the exact integer input.
source_values[0] = 1009
source_values.append(1013)

ffi.fmpq_matrix_set_entry = original_rational_set
ffi.fmpz_matrix_set_entry = original_integer_set

before = full_exports[0]
first = Q.list()
assert full_exports[0] == before + 1
second = Q.list()
assert full_exports[0] == before + 1
assert first is not second
assert first == second
assert first[0] == 1 and len(first) == 12
assert all(value.parent() is QQ for value in first)
assert all(first[index] is second[index] for index in range(len(first)))

# Rows and columns share the same immutable scalar snapshots while returning
# fresh outer containers according to Sage's cache contract.
rows = Q.rows()
columns = Q.columns()
assert full_exports[0] == before + 1
assert Q.rows() is not rows and Q.columns() is not columns
assert Q.rows(False) is Q.rows(False)
assert Q.columns(False) is Q.columns(False)
assert rows[1][2] is first[6]
assert columns[2][1] is first[6]
assert all(row.is_immutable() for row in rows)
assert all(column.is_immutable() for column in columns)

# Mutating a returned list changes neither the resource nor the cache.
first[0] = QQ(12345)
assert Q.list()[0] == 1
assert full_exports[0] == before + 1

# Failed mutation preserves the presentation cache; successful mutation
# invalidates it and causes exactly one new bulk materialization.
stable = Q.list()
try:
    Q[Q.nrows(), 0] = 31
    raise AssertionError('out-of-range mutation succeeded')
except IndexError:
    pass
after_failed = Q.list()
assert full_exports[0] == before + 1
assert all(stable[index] is after_failed[index] for index in range(len(stable)))

Q[0, 0] = QQ(5, 7)
updated = Q.list()
assert full_exports[0] == before + 2
assert updated[0] == QQ(5, 7)
assert stable[0] == 1
assert updated[1] is not stable[1]
assert Q.list()[0] is updated[0]
assert full_exports[0] == before + 2

# Presentation caching does not alter the stable serialized form.
encoded = dumps(Q)
assert loads(encoded) == Q
assert dumps(Q) == encoded

# List subclasses retain their observable iteration semantics. The ordinary
# rational path continues to normalize non-integral exact entries.
class RewritingList(list):
    def __iter__(self):
        return iter([11, 12, 13, 14])

rewritten = matrix(QQ, 2, 2, RewritingList([1, 2, 3, 4]))
assert rewritten.list() == [11, 12, 13, 14]
fractions = matrix(QQ, 1, 3, [QQ(2, 4), QQ(-6, 9), 5])
assert fractions.list() == [QQ(1, 2), QQ(-2, 3), 5]

print('dense-qq-host-views-v1-ok')
`;

test("dense QQ integer ingress and host views are bulk and cache-safe", () => {
  const forbidden = { SAGEJS_FORBID_QQ_MATRIX_NAPI: "1" };
  assert.equal(runSage(source, forbidden), "dense-qq-host-views-v1-ok");
  assert.equal(
    runSage(source, { ...forbidden, SAGEJS_NATIVE_DISABLE: "1" }),
    "dense-qq-host-views-v1-ok",
  );
});
