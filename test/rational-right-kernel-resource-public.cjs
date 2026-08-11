#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-rational-kernel-"));
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

def forbid_materialization(*args):
    raise AssertionError('hidden rational matrix materialization')

def assert_resource(matrix_value):
    assert matrix_value._has_fmpq_matrix_resource()
    storage = matrix_value._rational_storage_cache
    assert runtime.reflect.get(storage, 'numerators') is runtime.undefined
    assert runtime.reflect.get(storage, 'denominators') is runtime.undefined

def verify(source):
    source_before = source.__copy__()
    source._packed_rationals = forbid_materialization
    source._rational_numerators = forbid_materialization
    source._rational_denominators = forbid_materialization
    subspace = source.right_kernel()
    basis = subspace.basis_matrix()
    assert_resource(source)
    assert_resource(basis)
    assert source == source_before
    assert basis.dimensions() == (source.ncols() - source.rank(), source.ncols())
    assert source*basis.transpose() == zero_matrix(
        QQ, source.nrows(), basis.nrows()
    )
    # Recompute RREF on an independent resource instead of trusting the
    # right-kernel constructor's canonical-basis cache.
    assert basis.__copy__().rref() == basis
    assert basis.is_immutable()
    assert basis._rref_cache is basis
    assert source.right_kernel() is subspace
    assert source.right_kernel_matrix() is basis
    assert source._rank_cache == source.ncols() - basis.nrows()
    return basis

dependent = matrix(QQ, 2, 3, [1, 2, 3, 2, 4, 6])
dependent_basis = verify(dependent)
assert dependent_basis == matrix(QQ, [
    [1, 0, -QQ(1, 3)],
    [0, 1, -QQ(2, 3)],
])

for source, expected_shape in [
    (matrix(QQ, 0, 4), (4, 4)),
    (matrix(QQ, 3, 0), (0, 0)),
    (identity_matrix(QQ, 4), (0, 4)),
    (zero_matrix(QQ, 2, 5), (5, 5)),
    (matrix(QQ, 4, 2, [1, 0, 0, 1, 2, 3, 5, 7]), (0, 2)),
]:
    basis = verify(source)
    assert basis.dimensions() == expected_shape

state = 1
for round_index in range(24):
    rows = round_index % 7
    columns = (round_index * 5) % 9
    values = []
    for index in range(rows * columns):
        state = (1664525*state + 1013904223) % 4294967296
        values.append(QQ(state % 41 - 20, index % 7 + 1))
    if rows > 1 and round_index % 3 == 0:
        for column in range(columns):
            values[(rows - 1)*columns + column] = values[column]
    if columns > 0 and round_index % 4 == 0:
        for row in range(rows):
            values[row*columns + columns - 1] = 0
    verify(matrix(QQ, rows, columns, values))

huge = 2**4097 + 159
skew = 2**257 + 93
skew_source = matrix(QQ, 2, 5, [
    QQ(huge, 3), 0, QQ(1, skew), QQ(-7, 11), QQ(13, 17),
    0, QQ(skew, 5), QQ(-11, 19), QQ(huge, 23), QQ(-29, 31),
])
verify(skew_source)

# Mutation invalidates both public rank and kernel caches. The next kernel is
# a separately owned resource and reflects the changed matrix.
mutable = matrix(QQ, [[1, 2, 3], [2, 4, 6]])
first_basis = mutable.right_kernel_matrix()
mutable[1, 2] = 7
second_basis = mutable.right_kernel_matrix()
assert second_basis is not first_basis
assert second_basis.nrows() == 1
assert mutable*second_basis.transpose() == zero_matrix(QQ, 2, 1)

print('public-rational-right-kernel-resource-ok')
`;

const forbidden = { SAGEJS_FORBID_QQ_MATRIX_NAPI: "1" };
assert.equal(
  runSage(behavior, forbidden),
  "public-rational-right-kernel-resource-ok",
);
assert.equal(
  runSage(behavior, { ...forbidden, SAGEJS_NATIVE_DISABLE: "1" }),
  "public-rational-right-kernel-resource-ok",
);

const trace = runSage(String.raw`
A = matrix(QQ, [[1, 2, 3], [2, 4, 6]])
K = A.right_kernel_matrix()
assert A*K.transpose() == zero_matrix(QQ, 2, K.nrows())
print('trace-ok')
`, {
  ...forbidden,
  SAGEJS_NATIVE_DISABLE: "1",
  SAGEJS_NATIVE_TRACE: "1",
});
assert.match(
  trace,
  /Matrix\.right_kernel QQ 2x3 -> generated-flint-resource/,
);
assert.match(trace, /trace-ok/);

console.log("public rational right-kernel resource tests passed");
