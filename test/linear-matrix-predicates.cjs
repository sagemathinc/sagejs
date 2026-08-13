#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { compile } = require("@sagemath/sagejs/native");

const root = resolve(__dirname, "..");
const sourcePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "linear_algebra",
  "matrix_predicates.py",
);

function close(resource, flint, kind) {
  if (kind === "integer") flint.ffiFmpzMatrixClose(resource);
  else flint.ffiFmpqMatrixClose(resource);
}

function makeResource(entries, rows, columns, flint, kind) {
  const resource = kind === "integer"
    ? flint.ffiFmpzMatrixCreate(BigInt(rows), BigInt(columns))
    : flint.ffiFmpqMatrixCreate(BigInt(rows), BigInt(columns));
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const value = BigInt(entries[row * columns + column]);
      const valid = kind === "integer"
        ? flint.ffiFmpzMatrixSetEntry(
          resource, BigInt(row), BigInt(column), value,
        )
        : flint.ffiFmpqMatrixSetEntry(
          resource, BigInt(row), BigInt(column), value, 1n,
        );
      assert.equal(valid, true);
    }
  }
  return resource;
}

function expectedPredicates(entries, rows, columns, scalar = 1) {
  const square = rows === columns;
  let diagonal = square;
  let symmetric = square;
  let upper = square;
  let lower = square;
  let inferredScalar = square;
  let explicitScalar = square;
  const inferred = rows === 0 ? 0 : entries[0];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const value = entries[row * columns + column];
      if (row !== column && value !== 0) diagonal = false;
      if (row > column && value !== 0) upper = false;
      if (column > row && value !== 0) lower = false;
      if (square && entries[column * columns + row] !== value)
        symmetric = false;
      const inferredExpected = row === column ? inferred : 0;
      const explicitExpected = row === column ? scalar : 0;
      if (value !== inferredExpected) inferredScalar = false;
      if (value !== explicitExpected) explicitScalar = false;
    }
  }
  return { diagonal, symmetric, upper, lower, inferredScalar, explicitScalar };
}

function expectedPositions(entries, rows, columns, columnOrder) {
  const answer = [];
  if (columnOrder) {
    for (let column = 0; column < columns; column += 1)
      for (let row = 0; row < rows; row += 1)
        if (entries[row * columns + column] !== 0) answer.push([row, column]);
  } else {
    for (let row = 0; row < rows; row += 1)
      for (let column = 0; column < columns; column += 1)
        if (entries[row * columns + column] !== 0) answer.push([row, column]);
  }
  return answer;
}

function unpackPositions(rows, columns, count) {
  return Array.from({ length: Number(count) }, (_, index) => [
    Number(rows[index]),
    Number(columns[index]),
  ]);
}

function multiplyMatrices(left, right, size, modulus = undefined) {
  const output = Array(size * size).fill(0n);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let value = 0n;
      for (let inner = 0; inner < size; inner += 1)
        value += left[row * size + inner] * right[inner * size + column];
      output[row * size + column] = modulus === undefined
        ? value
        : ((value % modulus) + modulus) % modulus;
    }
  }
  return output;
}

function isNilpotentByPower(entries, size, modulus = undefined) {
  if (size === 0) return true;
  const source = entries.map(BigInt);
  let power = source;
  for (let exponent = 1; exponent < size; exponent += 1)
    power = multiplyMatrices(power, source, size, modulus);
  return power.every((value) => value === 0n);
}

function runSage(cacheRoot, disableNative) {
  const program = String.raw`
from sagejs.ffi.flint import (
    fmpq_matrix,
    fmpq_matrix_set_entry,
    fmpz_matrix,
    fmpz_matrix_set_entry,
)
from sagejs.linear_algebra.matrix_predicates import (
    dense_integer_echelon_nonpivots,
    dense_integer_matrix_is_nilpotent,
    dense_integer_matrix_is_symmetric,
    dense_integer_matrix_nonzero_positions,
    dense_prime_field_matrix_is_scalar_inferred,
    dense_rational_matrix_is_nilpotent,
)
from sagejs.native import kernel_int64_zeros, kernel_uint64_buffer

z = fmpz_matrix(2, 3)
for row, column, value in [(0, 0, 1), (0, 2, 2), (1, 2, 1)]:
    assert fmpz_matrix_set_entry(z, row, column, value)
positions_r = kernel_int64_zeros(dense_integer_matrix_nonzero_positions, 6)
positions_c = kernel_int64_zeros(dense_integer_matrix_nonzero_positions, 6)
count = dense_integer_matrix_nonzero_positions(positions_r, positions_c, z, False)
nonpivots = kernel_int64_zeros(dense_integer_echelon_nonpivots, 3)
nonpivot_count = dense_integer_echelon_nonpivots(nonpivots, z)
assert [(positions_r[i], positions_c[i]) for i in range(count)] == [(0, 0), (0, 2), (1, 2)]
assert [nonpivots[i] for i in range(nonpivot_count)] == [1]
assert not dense_integer_matrix_is_symmetric(z)
z.close()

zi = fmpz_matrix(3, 3)
for row, column, value in [(0, 1, 1), (1, 2, 1)]:
    assert fmpz_matrix_set_entry(zi, row, column, value)
assert dense_integer_matrix_is_nilpotent(zi)
zi.close()

q = fmpq_matrix(2, 2)
assert fmpq_matrix_set_entry(q, 0, 1, 3, 5)
assert dense_rational_matrix_is_nilpotent(q)
q.close()

prime = kernel_uint64_buffer(dense_prime_field_matrix_is_scalar_inferred, [4, 0, 0, 4])
assert dense_prime_field_matrix_is_scalar_inferred(prime, 2, 2, 7)
print('linear-matrix-predicates-fallback-ok')
`;
  const result = spawnSync(join(root, "bin", "sagejs"), ["--python"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
      ...(disableNative ? { SAGEJS_NATIVE_DISABLE: "1" } : {
        SAGEJS_NATIVE_REQUIRED: "1",
      }),
    },
    input: program,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

(async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-matrix-predicates-"));
  try {
    const compiled = await compile({ sourcePath, cacheRoot: temporary });
    const native = require(compiled.addonPath);
    const flint = require(join(root, "packages", "flint"));
    assert.equal(compiled.ir.functions.length, 24);
    assert.ok(compiled.ir.functions.every((fn) => fn.error === undefined));
    const core = readFileSync(compiled.coreSourcePath, "utf8");
    assert.match(core, /sagejs_fmpz_matrix_entry/);
    assert.match(core, /sagejs_fmpq_matrix_entry_is_zero/);
    assert.match(core, /sagejs_fmpz_matrix_charpoly/);
    assert.match(core, /sagejs_fmpq_matrix_charpoly_resource/);
    assert.doesNotMatch(core, /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/);

    const shapes = [[0, 0], [1, 1], [2, 2], [2, 3], [3, 2], [3, 3]];
    for (const [rows, columns] of shapes) {
      const length = rows * columns;
      for (let mask = 0; mask < 2 ** length; mask += 1) {
        const entries = Array.from(
          { length },
          (_, index) => (mask >> index) & 1,
        );
        const expected = expectedPredicates(entries, rows, columns);
        const prime = BigUint64Array.from(entries, BigInt);
        assert.equal(
          native.dense_prime_field_matrix_is_diagonal(
            prime, BigInt(rows), BigInt(columns), 2n,
          ),
          expected.diagonal,
        );
        assert.equal(
          native.dense_prime_field_matrix_is_symmetric(
            prime, BigInt(rows), BigInt(columns), 2n,
          ),
          expected.symmetric,
        );
        assert.equal(
          native.dense_prime_field_matrix_is_upper_triangular(
            prime, BigInt(rows), BigInt(columns), 2n,
          ),
          expected.upper,
        );
        assert.equal(
          native.dense_prime_field_matrix_is_lower_triangular(
            prime, BigInt(rows), BigInt(columns), 2n,
          ),
          expected.lower,
        );
        assert.equal(
          native.dense_prime_field_matrix_is_scalar_inferred(
            prime, BigInt(rows), BigInt(columns), 2n,
          ),
          expected.inferredScalar,
        );
        assert.equal(
          native.dense_prime_field_matrix_is_scalar(
            prime, BigInt(rows), BigInt(columns), 2n, 1n,
          ),
          expected.explicitScalar,
        );

        const primeRows = new BigUint64Array(length);
        const primeColumns = new BigUint64Array(length);
        const primeCount = native.dense_prime_field_matrix_nonzero_positions_row_order(
          primeRows,
          primeColumns,
          prime,
          BigInt(rows),
          BigInt(columns),
          2n,
        );
        assert.deepEqual(
          unpackPositions(primeRows, primeColumns, primeCount),
          expectedPositions(entries, rows, columns, false),
        );
        const primeColumnCount =
          native.dense_prime_field_matrix_nonzero_positions_column_order(
            primeRows,
            primeColumns,
            prime,
            BigInt(rows),
            BigInt(columns),
            2n,
          );
        assert.deepEqual(
          unpackPositions(primeRows, primeColumns, primeColumnCount),
          expectedPositions(entries, rows, columns, true),
        );

        for (const kind of ["integer", "rational"]) {
          const resource = makeResource(entries, rows, columns, flint, kind);
          const prefix = kind === "integer" ? "dense_integer" : "dense_rational";
          try {
            assert.equal(native[`${prefix}_matrix_is_diagonal`](resource), expected.diagonal);
            assert.equal(native[`${prefix}_matrix_is_symmetric`](resource), expected.symmetric);
            assert.equal(native[`${prefix}_matrix_is_triangular`](resource, true), expected.upper);
            assert.equal(native[`${prefix}_matrix_is_triangular`](resource, false), expected.lower);
            const scalarArguments = kind === "integer" ? [1n] : [1n, 1n];
            assert.equal(
              native[`${prefix}_matrix_is_scalar`](
                resource, ...scalarArguments, false,
              ),
              expected.explicitScalar,
            );
            const inferredArguments = kind === "integer" ? [0n] : [0n, 1n];
            assert.equal(
              native[`${prefix}_matrix_is_scalar`](
                resource, ...inferredArguments, true,
              ),
              expected.inferredScalar,
            );
            const outputRows = new BigInt64Array(length);
            const outputColumns = new BigInt64Array(length);
            const count = native[`${prefix}_matrix_nonzero_positions`](
              outputRows, outputColumns, resource, false,
            );
            assert.deepEqual(
              unpackPositions(outputRows, outputColumns, count),
              expectedPositions(entries, rows, columns, false),
            );
            const columnCount = native[`${prefix}_matrix_nonzero_positions`](
              outputRows, outputColumns, resource, true,
            );
            assert.deepEqual(
              unpackPositions(outputRows, outputColumns, columnCount),
              expectedPositions(entries, rows, columns, true),
            );
            if (rows === columns) {
              assert.equal(
                native[`${prefix}_matrix_is_nilpotent`](resource),
                isNilpotentByPower(entries, rows),
              );
            }
          } finally {
            close(resource, flint, kind);
          }
        }

        if (rows === columns) {
          const coefficients = new BigUint64Array(rows + 1);
          assert.equal(
            flint.ffiNmodMatCharpoly(
              coefficients,
              prime,
              BigInt(rows + 1),
              BigInt(length),
              BigInt(rows),
              2n,
            ),
            true,
          );
          assert.equal(
            native.dense_prime_field_characteristic_is_nilpotent(
              coefficients, BigInt(rows), 2n,
            ),
            isNilpotentByPower(entries, rows, 2n),
          );
        }
      }
    }

    const echelon = [1, 0, 2, 0, 0, 0, 1, 3];
    const expectedNonpivots = [1n, 3n];
    const primeEchelon = BigUint64Array.from(echelon, BigInt);
    const primeNonpivots = new BigUint64Array(4);
    assert.equal(
      native.dense_prime_field_echelon_nonpivots(
        primeNonpivots, primeEchelon, 2n, 4n, 5n,
      ),
      2n,
    );
    assert.deepEqual(Array.from(primeNonpivots.slice(0, 2)), expectedNonpivots);
    for (const kind of ["integer", "rational"]) {
      const resource = makeResource(echelon, 2, 4, flint, kind);
      const output = new BigInt64Array(4);
      const prefix = kind === "integer" ? "dense_integer" : "dense_rational";
      try {
        assert.equal(native[`${prefix}_echelon_nonpivots`](output, resource), 2n);
        assert.deepEqual(Array.from(output.slice(0, 2)), expectedNonpivots);
      } finally {
        close(resource, flint, kind);
      }
    }

    const nativeOutput = runSage(temporary, false);
    assert.equal(nativeOutput, "linear-matrix-predicates-fallback-ok");
    assert.equal(runSage(temporary, true), nativeOutput);
    console.log("linear-matrix-predicates-ok");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
