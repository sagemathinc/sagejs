#!/usr/bin/env node
// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const flintPrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);
const generatedDirectory = join(
  root, "packages", "flint", "build", "generated-ffi",
);
const manifest = require(join(generatedDirectory, "manifest.json"));
const flint = require(join(generatedDirectory, manifest.addon));
const accounted = flint.__sagejsFfiResourceExternalMemory;

function matrix(rows, columns, values) {
  const result = flint.ffiFmpzMatrixCreate(BigInt(rows), BigInt(columns));
  try {
    for (let index = 0; index < values.length; index += 1) {
      assert.equal(flint.ffiFmpzMatrixSetEntry(
        result,
        BigInt(Math.floor(index / columns)),
        BigInt(index % columns),
        BigInt(values[index]),
      ), true);
    }
    return result;
  } catch (error) {
    flint.ffiFmpzMatrixClose(result);
    throw error;
  }
}

function filledMatrix(rows, columns, value) {
  return matrix(rows, columns, Array(rows * columns).fill(value));
}

function entries(resource) {
  const rows = Number(flint.ffiFmpzMatrixNrows(resource));
  const columns = Number(flint.ffiFmpzMatrixNcols(resource));
  return Array.from({ length: rows * columns }, (_, index) =>
    flint.ffiFmpzMatrixEntry(
      resource,
      BigInt(Math.floor(index / columns)),
      BigInt(index % columns),
    ));
}

function prefixEntries(resource, rows, columns) {
  return Array.from({ length: rows * columns }, (_, index) =>
    flint.ffiFmpzMatrixEntry(
      resource,
      BigInt(Math.floor(index / columns)),
      BigInt(index % columns),
    ));
}

function assertOutsidePrefix(resource, rows, columns, sentinel) {
  const capacityRows = Number(flint.ffiFmpzMatrixNrows(resource));
  const capacityColumns = Number(flint.ffiFmpzMatrixNcols(resource));
  for (let row = 0; row < capacityRows; row += 1) {
    for (let column = 0; column < capacityColumns; column += 1) {
      if (row >= rows || column >= columns) {
        assert.equal(
          flint.ffiFmpzMatrixEntry(resource, BigInt(row), BigInt(column)),
          sentinel,
        );
      }
    }
  }
}

function closeAll(...resources) {
  for (const resource of resources.reverse()) {
    flint.ffiFmpzMatrixClose(resource);
    assert.equal(accounted(resource), 0n);
  }
}

test("logical-prefix HNF and SNF reuse oversized roots exactly", () => {
  const sourceValues = [
    2n, 4n, 6n,
    1n, 3n, 5n,
    7n, 11n, 13n,
    17n, 19n, 23n,
    29n, 31n, 37n,
    41n, 43n, 47n,
    53n, 59n, 61n,
    67n, 71n, 73n,
  ];
  const sentinel = -991n;
  const source = matrix(8, 3, sourceValues);
  const hermite = filledMatrix(9, 5, sentinel);
  const smith = filledMatrix(9, 5, sentinel);
  const transform = filledMatrix(9, 9, sentinel);
  const owned = [source, hermite, smith, transform];
  try {
    for (const rows of [5, 8]) {
      const sourcePrefix = flint.ffiFmpzMatrixSubmatrix(
        source, 0n, BigInt(rows), 0n, 3n,
      );
      const ordinaryHnf = flint.ffiFmpzMatrixHnf(sourcePrefix);
      const ordinarySnf = flint.ffiFmpzMatrixSnf(sourcePrefix);
      owned.push(sourcePrefix, ordinaryHnf, ordinarySnf);

      assert.equal(flint.ffiFmpzMatrixHnfPrefixInto(
        hermite, source, BigInt(rows), 3n,
      ), true);
      assert.deepEqual(
        prefixEntries(hermite, rows, 3),
        entries(ordinaryHnf),
      );
      assertOutsidePrefix(hermite, rows, 3, sentinel);

      assert.equal(flint.ffiFmpzMatrixSnfPrefixInto(
        smith, source, BigInt(rows), 3n,
      ), true);
      assert.deepEqual(prefixEntries(smith, rows, 3), entries(ordinarySnf));
      assertOutsidePrefix(smith, rows, 3, sentinel);

      assert.equal(flint.ffiFmpzMatrixHnfTransformPrefix(
        hermite, transform, source, BigInt(rows), 3n,
      ), true);
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          let value = 0n;
          for (let inner = 0; inner < rows; inner += 1) {
            value += flint.ffiFmpzMatrixEntry(
              transform, BigInt(row), BigInt(inner),
            ) * sourceValues[inner * 3 + column];
          }
          assert.equal(
            value,
            flint.ffiFmpzMatrixEntry(
              hermite, BigInt(row), BigInt(column),
            ),
          );
        }
      }
      assert.deepEqual(
        prefixEntries(hermite, rows, 3),
        entries(ordinaryHnf),
      );
      assertOutsidePrefix(hermite, rows, 3, sentinel);
      assertOutsidePrefix(transform, rows, rows, sentinel);
    }
    assert.deepEqual(entries(source), sourceValues);
  } finally {
    closeAll(...owned);
  }
});

test("logical-prefix exact LLL reuses roots and returns its row transform", () => {
  const sourceValues = [
    100n, 1n, 0n, 0n, 0n, 0n, 0n, 0n,
    99n, 0n, 1n, 0n, 0n, 0n, 0n, 0n,
    101n, 0n, 0n, 1n, 0n, 0n, 0n, 0n,
    -97n, 0n, 0n, 0n, 1n, 0n, 0n, 0n,
  ];
  const sentinel = -733n;
  const source = matrix(4, 8, sourceValues);
  const reduced = filledMatrix(5, 10, sentinel);
  const transform = filledMatrix(5, 5, sentinel);
  const owned = [source, reduced, transform];
  try {
    for (const [rows, columns] of [[2, 5], [4, 8]]) {
      const sourcePrefix = flint.ffiFmpzMatrixSubmatrix(
        source, 0n, BigInt(rows), 0n, BigInt(columns),
      );
      const ordinaryReduced = filledMatrix(rows, columns, 0n);
      const ordinaryTransform = filledMatrix(rows, rows, 0n);
      owned.push(sourcePrefix, ordinaryReduced, ordinaryTransform);
      assert.equal(flint.ffiFmpzMatrixLllTransform(
        ordinaryReduced, ordinaryTransform, sourcePrefix,
      ), true);

      assert.equal(flint.ffiFmpzMatrixLllTransformPrefix(
        reduced, transform, source, BigInt(rows), BigInt(columns),
      ), true);
      assert.deepEqual(
        prefixEntries(reduced, rows, columns),
        entries(ordinaryReduced),
      );
      assert.deepEqual(
        prefixEntries(transform, rows, rows),
        entries(ordinaryTransform),
      );
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          let value = 0n;
          for (let inner = 0; inner < rows; inner += 1) {
            value += flint.ffiFmpzMatrixEntry(
              transform, BigInt(row), BigInt(inner),
            ) * sourceValues[inner * 8 + column];
          }
          assert.equal(
            value,
            flint.ffiFmpzMatrixEntry(
              reduced, BigInt(row), BigInt(column),
            ),
          );
        }
      }
      assertOutsidePrefix(reduced, rows, columns, sentinel);
      assertOutsidePrefix(transform, rows, rows, sentinel);
    }
    assert.deepEqual(entries(source), sourceValues);
  } finally {
    closeAll(...owned);
  }
});

test("logical-prefix rejection is transactional and accounting is refreshed", () => {
  const huge = 1n << 32768n;
  const source = matrix(3, 3, [
    1n, huge, 0n,
    0n, 1n, 0n,
    0n, 0n, 1n,
  ]);
  const hermite = filledMatrix(4, 4, -17n);
  const transform = filledMatrix(4, 4, -19n);
  try {
    const before = accounted(transform);
    assert.equal(flint.ffiFmpzMatrixHnfTransformPrefix(
      hermite, transform, source, 2n, 2n,
    ), true);
    assert.ok(accounted(transform) > before + 4000n);
    assertOutsidePrefix(hermite, 2, 2, -17n);
    assertOutsidePrefix(transform, 2, 2, -19n);

    const hermiteBefore = entries(hermite);
    const transformBefore = entries(transform);
    const sourceBefore = entries(source);
    for (const operation of [
      () => flint.ffiFmpzMatrixHnfPrefixInto(hermite, source, 5n, 3n),
      () => flint.ffiFmpzMatrixSnfPrefixInto(hermite, source, 3n, 5n),
      () => flint.ffiFmpzMatrixHnfPrefixInto(hermite, source, 0n, 3n),
      () => flint.ffiFmpzMatrixHnfPrefixInto(hermite, hermite, 2n, 2n),
      () => flint.ffiFmpzMatrixHnfTransformPrefix(
        hermite, hermite, source, 2n, 2n,
      ),
      () => flint.ffiFmpzMatrixLllTransformPrefix(
        hermite, transform, source, 3n, 2n,
      ),
      () => flint.ffiFmpzMatrixLllTransformPrefix(
        hermite, transform, source, 0n, 2n,
      ),
    ]) {
      assert.throws(operation, /logical-prefix bounds or aliases/);
      assert.deepEqual(entries(hermite), hermiteBefore);
      assert.deepEqual(entries(transform), transformBefore);
      assert.deepEqual(entries(source), sourceBefore);
    }
  } finally {
    closeAll(source, hermite, transform);
  }
});

test("logical-prefix adapters lower and execute in one native arena", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-prefix-native-"));
  try {
    const sourcePath = join(temporary, "logical-prefix-native.py");
    writeFileSync(sourcePath, String.raw`
from sagejs.ffi.flint import (
    FmpzMatrix,
    fmpz_matrix,
    fmpz_matrix_entry,
    fmpz_matrix_hnf_prefix_into,
    fmpz_matrix_hnf_transform_prefix,
    fmpz_matrix_lll_transform_prefix,
    fmpz_matrix_set_entry,
    fmpz_matrix_snf_prefix_into,
)
from sagejs.native import NativeExactArena, native, uint64

@native
def logical_prefix_witness(
    memory_limit: uint64,
    temporary_limit: uint64,
) -> int:
    with NativeExactArena(memory_limit, temporary_limit) as arena:
        source = arena.foreign_resource(fmpz_matrix, 8, 3)
        hermite = arena.foreign_resource(fmpz_matrix, 8, 3)
        smith = arena.foreign_resource(fmpz_matrix, 8, 3)
        transform = arena.foreign_resource(fmpz_matrix, 8, 8)
        lattice = arena.foreign_resource(fmpz_matrix, 4, 8)
        reduced = arena.foreign_resource(fmpz_matrix, 4, 8)
        lll_transform = arena.foreign_resource(fmpz_matrix, 4, 4)
        row: uint64 = 0
        while row < 8:
            column: uint64 = 0
            while column < 3:
                fmpz_matrix_set_entry(
                    source,
                    row,
                    column,
                    (row + 2) * (column + 3) + row * row,
                )
                column += 1
            row += 1
        row = 0
        while row < 4:
            column = 0
            while column < 8:
                if column == 0:
                    fmpz_matrix_set_entry(lattice, row, column, 97 + row)
                elif column == row + 1:
                    fmpz_matrix_set_entry(lattice, row, column, 1)
                else:
                    fmpz_matrix_set_entry(lattice, row, column, 0)
                column += 1
            row += 1
        if not fmpz_matrix_hnf_prefix_into(hermite, source, 5, 3):
            return -1
        if not fmpz_matrix_snf_prefix_into(smith, source, 5, 3):
            return -2
        if not fmpz_matrix_hnf_transform_prefix(
            hermite, transform, source, 8, 3
        ):
            return -3
        row = 0
        while row < 8:
            column = 0
            while column < 3:
                value = 0
                inner: uint64 = 0
                while inner < 8:
                    value += (
                        fmpz_matrix_entry(transform, row, inner)
                        * fmpz_matrix_entry(source, inner, column)
                    )
                    inner += 1
                if value != fmpz_matrix_entry(hermite, row, column):
                    return -4
                column += 1
            row += 1
        if not fmpz_matrix_lll_transform_prefix(
            reduced, lll_transform, lattice, 2, 5
        ):
            return -5
        if not fmpz_matrix_lll_transform_prefix(
            reduced, lll_transform, lattice, 4, 8
        ):
            return -6
        row = 0
        while row < 4:
            column = 0
            while column < 8:
                value = 0
                inner = 0
                while inner < 4:
                    value += (
                        fmpz_matrix_entry(lll_transform, row, inner)
                        * fmpz_matrix_entry(lattice, inner, column)
                    )
                    inner += 1
                if value != fmpz_matrix_entry(reduced, row, column):
                    return -7
                column += 1
            row += 1
        return 1
`);
    const compiled = await compileKernel({
      sourcePath,
      cacheRoot: join(temporary, "cache"),
      functions: ["logical_prefix_witness"],
    });
    const run = spawnSync(process.execPath, [
      "-e",
      String.raw`
"use strict";
const assert = require("node:assert/strict");
const module = require(process.argv[1]);
assert.equal(module.logical_prefix_witness(1048576n, 1048576n), 1n);
`,
      compiled.modulePath,
    ], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("logical-prefix FLINT windows survive sanitizer lifecycle stress", {
  skip: process.platform === "win32",
}, () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-prefix-sanitize-"));
  try {
    const sourcePath = join(temporary, "logical-prefix-sanitize.c");
    const executable = join(temporary, "logical-prefix-sanitize");
    writeFileSync(sourcePath, String.raw`
#include <stdint.h>
#include <sagejs/fmpz_matrix_ffi.h>

static int verify_left_product(
    const sagejs_fmpz_matrix_t result,
    const sagejs_fmpz_matrix_t transform,
    const sagejs_fmpz_matrix_t source,
    slong rows,
    slong columns)
{
    fmpz_t value;
    fmpz_init(value);
    for (slong row = 0; row < rows; row++)
        for (slong column = 0; column < columns; column++)
        {
            fmpz_zero(value);
            for (slong inner = 0; inner < rows; inner++)
                fmpz_addmul(value,
                    fmpz_mat_entry(transform->value, row, inner),
                    fmpz_mat_entry(source->value, inner, column));
            if (!fmpz_equal(value,
                    fmpz_mat_entry(result->value, row, column)))
            {
                fmpz_clear(value);
                return 0;
            }
        }
    fmpz_clear(value);
    return 1;
}

int main(void)
{
    sagejs_fmpz_matrix_t source, hermite, smith, transform;
    sagejs_fmpz_matrix_t lattice, reduced, lll_transform;
    if (!sagejs_fmpz_matrix_init(source, 8, 3) ||
        !sagejs_fmpz_matrix_init(hermite, 9, 5) ||
        !sagejs_fmpz_matrix_init(smith, 9, 5) ||
        !sagejs_fmpz_matrix_init(transform, 9, 9) ||
        !sagejs_fmpz_matrix_init(lattice, 4, 8) ||
        !sagejs_fmpz_matrix_init(reduced, 5, 10) ||
        !sagejs_fmpz_matrix_init(lll_transform, 5, 5))
        return 2;
    for (slong row = 0; row < 8; row++)
        for (slong column = 0; column < 3; column++)
            fmpz_set_si(fmpz_mat_entry(source->value, row, column),
                (row + 2) * (column + 3) + row * row);
    for (slong row = 0; row < 4; row++)
        for (slong column = 0; column < 8; column++)
            fmpz_set_si(fmpz_mat_entry(lattice->value, row, column),
                column == 0 ? 97 + row : column == row + 1 ? 1 : 0);
    for (slong round = 0; round < 300; round++)
    {
        uint64_t rows = round % 2 == 0 ? 5 : 8;
        uint64_t lattice_rows = round % 2 == 0 ? 2 : 4;
        uint64_t lattice_columns = round % 2 == 0 ? 5 : 8;
        if (!sagejs_fmpz_matrix_hnf_prefix_into(
                hermite, source, rows, 3) ||
            !sagejs_fmpz_matrix_snf_prefix_into(
                smith, source, rows, 3) ||
            !sagejs_fmpz_matrix_hnf_transform_prefix(
                hermite, transform, source, rows, 3) ||
            !verify_left_product(
                hermite, transform, source, (slong) rows, 3) ||
            !sagejs_fmpz_matrix_lll_transform_prefix(
                reduced, lll_transform, lattice,
                lattice_rows, lattice_columns) ||
            !verify_left_product(
                reduced, lll_transform, lattice,
                (slong) lattice_rows, (slong) lattice_columns))
            return 3;
    }
    if (sagejs_fmpz_matrix_hnf_prefix_into(source, source, 5, 3) ||
        sagejs_fmpz_matrix_hnf_prefix_into(hermite, source, 10, 3) ||
        sagejs_fmpz_matrix_snf_prefix_into(smith, source, 8, 6) ||
        sagejs_fmpz_matrix_hnf_transform_prefix(
            hermite, hermite, source, 5, 3) ||
        sagejs_fmpz_matrix_lll_transform_prefix(
            reduced, lll_transform, lattice, 4, 3))
        return 4;
    sagejs_fmpz_matrix_clear(lll_transform);
    sagejs_fmpz_matrix_clear(reduced);
    sagejs_fmpz_matrix_clear(lattice);
    sagejs_fmpz_matrix_clear(transform);
    sagejs_fmpz_matrix_clear(smith);
    sagejs_fmpz_matrix_clear(hermite);
    sagejs_fmpz_matrix_clear(source);
    flint_cleanup();
    return 0;
}
`);
    const compile = spawnSync(process.env.CC || "cc", [
      "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
      "-fsanitize=address,undefined",
      `-I${join(root, "packages", "flint", "include")}`,
      `-I${join(flintPrefix, "include")}`,
      sourcePath,
      `-L${join(flintPrefix, "lib")}`,
      "-lflint", "-lopenblas", "-lmpfr", "-lgmp", "-lm", "-lpthread",
      "-o", executable,
    ], { cwd: root, encoding: "utf8" });
    assert.equal(
      compile.status,
      0,
      `sanitizer harness compile failed:\n${compile.stdout}${compile.stderr}`,
    );
    const run = spawnSync(executable, [], {
      cwd: root,
      env: sanitizerEnvironment({ strictStringChecks: true }),
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(
      run.status,
      0,
      `sanitizer harness failed:\n${run.stdout}${run.stderr}`,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
