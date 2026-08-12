#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const sagejs = resolve(root, "bin", "sagejs");

function run(executable, args, source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-public-subspaces-"));
  try {
    let input = source;
    if (executable === sagejs) {
      const script = join(directory, "witness.py");
      writeFileSync(script, source);
      args = [...args, script];
      input = undefined;
    }
    const result = spawnSync(executable, args, {
      cwd: root,
      input,
      encoding: "utf8",
      timeout: 180_000,
      env: { ...process.env, ...environment },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const witness = String.raw`
domains = [ZZ, QQ, GF(2), GF(3), GF(7), GF(251)]
for base in domains:
    source = matrix(base, 4, 5, [
        1, 2, 3, 4, 5,
        2, 4, 6, 8, 10,
        0, 1, 1, 0, 3,
        0, 0, 0, 0, 0,
    ])
    pivots = source.pivots()
    assert pivots is source.pivots()
    assert pivots == (0, 1)
    row = source.row_space()
    assert row == source.row_module() == source.image()
    column = source.column_space()
    assert column == source.column_module()
    assert row.dimension() == 2 and row.degree() == 5
    assert column.dimension() == 2 and column.degree() == 4
    assert row.basis_matrix().is_immutable()
    assert column.basis_matrix().is_immutable()
    assert source.echelon_form().pivots() is source.pivots()

    source[3, 4] = 1
    changed = source.pivots()
    assert changed == (0, 1, 4)
    assert changed is source.pivots()
    assert changed is not pivots

for base in domains:
    for rows, columns in [(0, 4), (3, 0), (0, 0)]:
        source = matrix(base, rows, columns, [])
        row = source.row_space().basis_matrix()
        column = source.column_space().basis_matrix()
        assert row.dimensions() == (0, columns)
        assert column.dimensions() == (0, rows)
        assert source.pivots() == ()

# Sage's cross-ring row-module semantics retain rational coordinate vectors
# while changing the coefficient ring of their span.
source = matrix(QQ, [[QQ(1)/2, 0], [0, 1], [QQ(1)/2, 1]])
integral_span = source.row_space(base_ring=ZZ)
assert integral_span.base_ring() is ZZ
assert integral_span.basis_matrix().base_ring() is QQ
assert integral_span.basis_matrix() == matrix(QQ, [[QQ(1)/2, 0], [0, 1]])
assert integral_span.basis_matrix().is_immutable()
assert source.row_space(base_ring=QQ) == source.row_space()

# The equal-ring exact path may scan only O(rank) pivot metadata and bulk-copy
# rows. Full serialization, host exact values, scalar entries, and host rows
# are forbidden after the canonical echelon matrix has been computed.
for base in [ZZ, QQ]:
    source = matrix(base, [[2, 4, 6], [1, 2, 3], [0, 0, 0]])
    echelon = source.echelon_form()
    transposed = source.transpose()
    column_echelon = transposed.echelon_form()
    calls = {"row_select": 0, "column_select": 0}
    original_select = echelon.matrix_from_rows
    original_column_select = column_echelon.matrix_from_rows

    def forbidden(*_args, **_kwargs):
        raise AssertionError("exact subspace path crossed a scalar host boundary")

    def select(indices):
        calls["row_select"] += 1
        return original_select(indices)

    def select_columns(indices):
        calls["column_select"] += 1
        return original_column_select(indices)

    echelon._exact_host_values = forbidden
    echelon.list = forbidden
    echelon.rows = forbidden
    echelon.row = forbidden
    echelon._entry = forbidden
    echelon.matrix_from_rows = select
    column_echelon._exact_host_values = forbidden
    column_echelon.list = forbidden
    column_echelon.rows = forbidden
    column_echelon.row = forbidden
    column_echelon._entry = forbidden
    column_echelon.matrix_from_rows = select_columns
    source.transpose = lambda: transposed
    basis = source.row_space().basis_matrix()
    column_basis = source.column_space().basis_matrix()
    assert calls == {"row_select": 1, "column_select": 1}
    assert basis.nrows() == 1 and basis.is_immutable()
    assert column_basis.nrows() == 1 and column_basis.is_immutable()

binary = matrix(GF(2), [[1, 0, 1], [0, 1, 1], [1, 1, 0]])
binary_echelon = binary.echelon_form()
binary_echelon._prime_kernel_buffer = forbidden
binary_echelon._prime_host_values = forbidden
binary_basis = binary.row_space().basis_matrix()
assert binary_basis == matrix(GF(2), [[1, 0, 1], [0, 1, 1]])
assert binary_basis.is_immutable()

print("public-exact-matrix-subspaces-ok")
`;

for (const nativeDisabled of [false, true]) {
  test(`public exact subspaces preserve semantics (${nativeDisabled ? "dynamic" : "generated"})`, () => {
    assert.equal(
      run(sagejs, ["--python"], witness, {
        SAGEJS_FORBID_MATRIX_NAPI: "1",
        SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
        SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
        ...(nativeDisabled ? { SAGEJS_NATIVE_DISABLE: "1" } : {}),
      }),
      "public-exact-matrix-subspaces-ok",
    );
  });
}

const sage = process.env.SAGE || "/home/user/bin/sagelite";
test("cross-ring rational row-space basis matches SageMath", {
  skip: !existsSync(sage),
}, () => {
  const source = String.raw`
A = matrix(QQ, [[1/2, 0], [0, 1], [1/2, 1]])
W = A.row_space(base_ring=ZZ)
assert W.base_ring() is ZZ
assert W.basis_matrix().base_ring() is QQ
assert W.basis_matrix() == matrix(QQ, [[1/2, 0], [0, 1]])
assert W.basis_matrix().is_immutable()
print("sagemath-cross-ring-subspace-ok")
`;
  assert.equal(
    run(sage, ["-c", source], ""),
    "sagemath-cross-ring-subspace-ok",
  );
});
