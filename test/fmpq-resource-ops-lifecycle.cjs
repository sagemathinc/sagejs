#!/usr/bin/env node
// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const flintPrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);

function dynamicLifecycleFuzz() {
  const flint = require(join(root, "packages", "flint"));
  // FLINT's `ulong` remains 64-bit on Windows LLP64 even though the C
  // `unsigned long` used by ULONG_MAX is only 32-bit there.
  const maximumWordSeed = (1n << 64n) - 1n;
  const seeded = flint.ffiFmpqMatrixRandbits(
    1n, 1n, 1n, maximumWordSeed, maximumWordSeed,
  );
  flint.ffiFmpqMatrixClose(seeded);
  for (let round = 0; round < 200; round += 1) {
    const left = flint.ffiFmpqMatrixCreate(3n, 3n);
    const right = flint.ffiFmpqMatrixRandbits(
      3n, 3n, 4n, BigInt(round + 1), BigInt(round + 2),
    );
    for (let index = 0; index < 9; index += 1) {
      const row = Math.floor(index / 3);
      const column = index % 3;
      assert.equal(flint.ffiFmpqMatrixSetEntry(
        left,
        BigInt(row),
        BigInt(column),
        BigInt(row > column ? 0 :
          (row === column ? round + row + 1 : round + 3 * index + 11)),
        BigInt(1 + (round + index) % 7),
      ), true);
    }
    assert.equal(
      flint.ffiFmpqMatrixAddScaledEntry(left, 0n, 2n, -5n, 7n, 2n),
      true,
    );
    assert.throws(
      () => flint.ffiFmpqMatrixAddScaledEntry(left, 0n, 2n, 1n, 0n, 1n),
      /invalid rational matrix entry update/,
    );
    const sum = flint.ffiFmpqMatrixAdd(left, right);
    const difference = flint.ffiFmpqMatrixSub(sum, right);
    const negated = flint.ffiFmpqMatrixNeg(left);
    const scaled = flint.ffiFmpqMatrixScalarMul(left, -17n, 19n);
    const transposed = flint.ffiFmpqMatrixTranspose(left);
    const inverse = flint.ffiFmpqMatrixInv(left);
    const solution = flint.ffiFmpqMatrixSolve(left, right);
    const kernel = flint.ffiFmpqMatrixRightKernel(left);
    const submatrix = flint.ffiFmpqMatrixSubmatrix(left, 1n, 3n, 0n, 2n);
    const selectedRows = flint.ffiFmpqMatrixSelectRows(
      left, new BigUint64Array([2n, 0n]), 2n,
    );
    const prefixRows = flint.ffiFmpqMatrixPrefixRows(left, 2n);
    const selectedColumns = flint.ffiFmpqMatrixSelectColumns(
      left, new BigUint64Array([2n, 0n]), 2n,
    );
    const stacked = flint.ffiFmpqMatrixStack(selectedRows, selectedRows);
    const augmented = flint.ffiFmpqMatrixAugment(
      selectedColumns, selectedColumns,
    );
    const blockTarget = flint.ffiFmpqMatrixCreate(3n, 3n);
    assert.equal(
      flint.ffiFmpqMatrixSetBlock(blockTarget, 1n, 1n, submatrix), true,
    );
    const trace = flint.ffiFmpqMatrixTrace(left);
    assert.equal(flint.ffiFmpqMatrixEqual(left, difference), true);
    assert.equal(flint.ffiFmpqMatrixIsZero(left), false);
    assert.equal(flint.ffiFmpqMatrixIsOne(left), false);
    assert.equal(flint.ffiFmpqMatrixRank(left), 3n);
    assert.equal(flint.ffiFmpqMatrixRank(left), 3n);
    assert.equal(flint.ffiFmpqMatrixNonzeroCount(left), 6n);
    assert.equal(flint.ffiFmpqMatrixNrows(stacked), 4n);
    assert.equal(flint.ffiFmpqMatrixNrows(prefixRows), 2n);
    assert.equal(
      flint.ffiFmpqMatrixEntryNumerator(prefixRows, 0n, 0n),
      flint.ffiFmpqMatrixEntryNumerator(left, 0n, 0n),
    );
    assert.equal(flint.ffiFmpqMatrixNcols(augmented), 4n);
    assert.equal(flint.ffiFmpqMatrixNrows(kernel), 0n);
    assert.equal(flint.ffiFmpqMatrixNcols(kernel), 3n);
    for (let index = 0; index < 9; index += 1) {
      const row = BigInt(Math.floor(index / 3));
      const column = BigInt(index % 3);
      assert.equal(
        flint.ffiFmpqMatrixEntryNumerator(difference, row, column),
        flint.ffiFmpqMatrixEntryNumerator(left, row, column),
      );
      assert.equal(
        flint.ffiFmpqMatrixEntryDenominator(difference, row, column),
        flint.ffiFmpqMatrixEntryDenominator(left, row, column),
      );
    }
    flint.ffiFmpqValueClose(trace);
    flint.ffiFmpqMatrixClose(blockTarget);
    flint.ffiFmpqMatrixClose(augmented);
    flint.ffiFmpqMatrixClose(stacked);
    flint.ffiFmpqMatrixClose(selectedColumns);
    flint.ffiFmpqMatrixClose(prefixRows);
    flint.ffiFmpqMatrixClose(selectedRows);
    flint.ffiFmpqMatrixClose(submatrix);
    flint.ffiFmpqMatrixClose(solution);
    flint.ffiFmpqMatrixClose(kernel);
    flint.ffiFmpqMatrixClose(inverse);
    flint.ffiFmpqMatrixClose(transposed);
    flint.ffiFmpqMatrixClose(scaled);
    flint.ffiFmpqMatrixClose(negated);
    flint.ffiFmpqMatrixClose(difference);
    flint.ffiFmpqMatrixClose(sum);
    flint.ffiFmpqMatrixClose(right);
    flint.ffiFmpqMatrixClose(left);

    const singular = flint.ffiFmpqMatrixCreate(2n, 2n);
    const inconsistent = flint.ffiFmpqMatrixCreate(2n, 1n);
    assert.equal(
      flint.ffiFmpqMatrixSetEntry(inconsistent, 0n, 0n, 1n, 1n), true,
    );
    assert.throws(() => flint.ffiFmpqMatrixInv(singular), /singular/);
    assert.throws(
      () => flint.ffiFmpqMatrixSolve(singular, inconsistent),
      /no solutions/,
    );
    assert.throws(
      () => flint.ffiFmpqMatrixScalarMul(singular, 1n, 0n),
      /invalid rational matrix scalar/,
    );
    assert.throws(
      () => flint.ffiFmpqMatrixTrace(inconsistent),
      /trace requires a square rational matrix/,
    );
    assert.throws(
      () => flint.ffiFmpqMatrixSelectRows(
        singular, new BigUint64Array([2n]), 1n,
      ),
      /row selection contains an invalid index/,
    );
    assert.throws(
      () => flint.ffiFmpqMatrixPrefixRows(singular, 3n),
      /row-prefix count is invalid/,
    );
    assert.throws(
      () => flint.ffiFmpqMatrixSetBlock(singular, 0n, 0n, singular),
      /block bounds or aliases are invalid/,
    );
    flint.ffiFmpqMatrixClose(inconsistent);
    flint.ffiFmpqMatrixClose(singular);
  }
  return 200;
}

const dynamicRounds = dynamicLifecycleFuzz();
if (process.platform === "win32") {
  process.stdout.write(JSON.stringify({
    schema: "sagejs.ffi/fmpq-resource-ops-lifecycle-v1",
    capability: "sanitizers",
    supported: false,
    reason: "ASan/UBSan lifecycle harness is currently a Unix CI capability",
    dynamicRounds,
  }) + "\n");
  process.exit(0);
}

const source = String.raw`
#include <stdint.h>
#include <stdio.h>
#include <sagejs/fmpq_matrix_ffi.h>

int main(void)
{
    fmpz_t numerator, denominator, scale;
    uint64_t dimension_sum = 0;
    if (sagejs_fmpq_matrix_dimension_add(
            &dimension_sum, UINT64_MAX, UINT64_C(1)) ||
        !sagejs_fmpq_matrix_dimension_add(
            &dimension_sum, UINT64_MAX - UINT64_C(1), UINT64_C(1)) ||
        dimension_sum != UINT64_MAX)
        return 1;
    fmpz_init(numerator);
    fmpz_init(denominator);
    fmpz_init(scale);
    for (slong round = 0; round < 500; round++)
    {
        sagejs_fmpq_matrix_t left, right, sum, difference;
        sagejs_fmpq_matrix_t negated, scaled, transposed, inverse, solution;
        sagejs_fmpq_matrix_t kernel;
        sagejs_fmpq_matrix_t submatrix, selected_rows, prefix_rows;
        sagejs_fmpq_matrix_t selected_columns;
        sagejs_fmpq_matrix_t stacked, augmented, block_target;
        sagejs_fmpq_matrix_t singular, inconsistent, failed;
        sagejs_fmpq_value_t trace, failed_value;
        const uint64_t selected[2] = {2, 0};
        const uint64_t invalid[1] = {2};
        if (!sagejs_fmpq_matrix_init(left, 3, 3) ||
            !sagejs_fmpq_matrix_randbits(
                right, 3, 3, 4, (uint64_t) round + UINT64_C(1),
                (uint64_t) round + UINT64_C(2)))
            return 2;
        for (slong row = 0; row < 3; row++)
            for (slong column = 0; column < 3; column++)
            {
                if (row > column)
                    fmpz_zero(numerator);
                else if (row == column)
                    fmpz_set_ui(numerator, (ulong) (round + row + 1));
                else
                    fmpz_set_ui(numerator,
                        (ulong) (round + 9 * row + 3 * column + 11));
                fmpz_set_ui(denominator,
                    (ulong) (1 + (round + 3 * row + column) % 7));
                if (!sagejs_fmpq_matrix_set_entry(
                        left, (uint64_t) row, (uint64_t) column,
                        numerator, denominator))
                    return 3;
            }
        fmpz_set_si(numerator, -5);
        fmpz_set_ui(denominator, 7);
        fmpz_set_si(scale, 2);
        if (!sagejs_fmpq_matrix_add_scaled_entry(
                left, 0, 2, numerator, denominator, scale))
            return 3;
        if (!sagejs_fmpq_matrix_add(sum, left, right) ||
            !sagejs_fmpq_matrix_sub(difference, sum, right) ||
            !sagejs_fmpq_matrix_neg(negated, left) ||
            !sagejs_fmpq_matrix_scalar_mul(
                scaled, left, numerator, denominator) ||
            !sagejs_fmpq_matrix_transpose(transposed, left) ||
            !sagejs_fmpq_matrix_inv(inverse, left) ||
            !sagejs_fmpq_matrix_solve(solution, left, right) ||
            !sagejs_fmpq_matrix_right_kernel(kernel, left) ||
            !sagejs_fmpq_matrix_submatrix(
                submatrix, left, 1, 3, 0, 2) ||
            !sagejs_fmpq_matrix_select_rows(
                selected_rows, left, selected, 2) ||
            !sagejs_fmpq_matrix_prefix_rows(prefix_rows, left, 2) ||
            !sagejs_fmpq_matrix_select_columns(
                selected_columns, left, selected, 2) ||
            !sagejs_fmpq_matrix_stack(
                stacked, selected_rows, selected_rows) ||
            !sagejs_fmpq_matrix_augment(
                augmented, selected_columns, selected_columns) ||
            !sagejs_fmpq_matrix_init(block_target, 3, 3) ||
            !sagejs_fmpq_matrix_set_block(
                block_target, 1, 1, submatrix) ||
            !sagejs_fmpq_matrix_trace(trace, left) ||
            !sagejs_fmpq_matrix_equal(left, difference) ||
            sagejs_fmpq_matrix_is_zero(left) ||
            sagejs_fmpq_matrix_is_one(left) ||
            sagejs_fmpq_matrix_rank(left) != 3 ||
            sagejs_fmpq_matrix_rank(left) != 3 ||
            sagejs_fmpq_matrix_nonzero_count(left) != 6 ||
            sagejs_fmpq_matrix_nrows(stacked) != 4 ||
            sagejs_fmpq_matrix_nrows(prefix_rows) != 2 ||
            sagejs_fmpq_matrix_ncols(augmented) != 4)
            return 4;
        if (sagejs_fmpq_matrix_nrows(kernel) != 0 ||
            sagejs_fmpq_matrix_ncols(kernel) != 3)
            return 4;
        for (slong row = 0; row < 3; row++)
            for (slong column = 0; column < 3; column++)
                if (!fmpq_equal(
                        fmpq_mat_entry(difference->value, row, column),
                        fmpq_mat_entry(left->value, row, column)))
                    return 5;
        fmpz_one(numerator);
        fmpz_one(denominator);
        if (!sagejs_fmpq_matrix_init(singular, 2, 2) ||
            !sagejs_fmpq_matrix_init(inconsistent, 2, 1) ||
            !sagejs_fmpq_matrix_set_entry(
                inconsistent, 0, 0, numerator, denominator))
            return 6;
        fmpz_zero(denominator);
        if (sagejs_fmpq_matrix_inv(failed, singular) ||
            sagejs_fmpq_matrix_solve(failed, singular, inconsistent) ||
            sagejs_fmpq_matrix_add(failed, left, singular) ||
            sagejs_fmpq_matrix_sub(failed, left, singular) ||
            sagejs_fmpq_matrix_scalar_mul(
                failed, singular, numerator, denominator) ||
            sagejs_fmpq_matrix_add_scaled_entry(
                singular, 0, 0, numerator, denominator, scale) ||
            sagejs_fmpq_matrix_add_scaled_entry(
                singular, 2, 0, numerator, scale, scale) ||
            sagejs_fmpq_matrix_select_rows(
                failed, singular, NULL, 1) ||
            sagejs_fmpq_matrix_select_rows(
                failed, singular, invalid, 1) ||
            sagejs_fmpq_matrix_prefix_rows(failed, singular, 3) ||
            sagejs_fmpq_matrix_set_block(singular, 0, 0, singular) ||
            sagejs_fmpq_matrix_trace(failed_value, inconsistent))
            return 6;
        sagejs_fmpq_matrix_clear(inconsistent);
        sagejs_fmpq_matrix_clear(singular);
        sagejs_fmpq_matrix_clear(block_target);
        sagejs_fmpq_matrix_clear(augmented);
        sagejs_fmpq_matrix_clear(stacked);
        sagejs_fmpq_matrix_clear(selected_columns);
        sagejs_fmpq_matrix_clear(prefix_rows);
        sagejs_fmpq_matrix_clear(selected_rows);
        sagejs_fmpq_matrix_clear(submatrix);
        sagejs_fmpq_matrix_clear(solution);
        sagejs_fmpq_matrix_clear(kernel);
        sagejs_fmpq_matrix_clear(inverse);
        sagejs_fmpq_matrix_clear(transposed);
        sagejs_fmpq_matrix_clear(scaled);
        sagejs_fmpq_matrix_clear(negated);
        sagejs_fmpq_matrix_clear(difference);
        sagejs_fmpq_matrix_clear(sum);
        sagejs_fmpq_matrix_clear(right);
        sagejs_fmpq_matrix_clear(left);
        sagejs_fmpq_value_clear(trace);
    }
    {
        sagejs_fmpq_matrix_t no_rows, no_columns;
        sagejs_fmpq_matrix_t empty_rows, columns_of_no_rows;
        sagejs_fmpq_matrix_t rows_of_no_columns, empty_columns;
        const uint64_t two_columns[2] = {3, 1};
        const uint64_t two_rows[2] = {2, 0};
        if (!sagejs_fmpq_matrix_init(no_rows, 0, 4) ||
            !sagejs_fmpq_matrix_init(no_columns, 3, 0) ||
            !sagejs_fmpq_matrix_select_rows(
                empty_rows, no_rows, NULL, 0) ||
            !sagejs_fmpq_matrix_select_columns(
                columns_of_no_rows, no_rows, two_columns, 2) ||
            !sagejs_fmpq_matrix_select_rows(
                rows_of_no_columns, no_columns, two_rows, 2) ||
            !sagejs_fmpq_matrix_select_columns(
                empty_columns, no_columns, NULL, 0) ||
            sagejs_fmpq_matrix_nrows(empty_rows) != 0 ||
            sagejs_fmpq_matrix_ncols(empty_rows) != 4 ||
            sagejs_fmpq_matrix_nrows(columns_of_no_rows) != 0 ||
            sagejs_fmpq_matrix_ncols(columns_of_no_rows) != 2 ||
            sagejs_fmpq_matrix_nrows(rows_of_no_columns) != 2 ||
            sagejs_fmpq_matrix_ncols(rows_of_no_columns) != 0 ||
            sagejs_fmpq_matrix_nrows(empty_columns) != 3 ||
            sagejs_fmpq_matrix_ncols(empty_columns) != 0)
            return 7;
        sagejs_fmpq_matrix_clear(empty_columns);
        sagejs_fmpq_matrix_clear(rows_of_no_columns);
        sagejs_fmpq_matrix_clear(columns_of_no_rows);
        sagejs_fmpq_matrix_clear(empty_rows);
        sagejs_fmpq_matrix_clear(no_columns);
        sagejs_fmpq_matrix_clear(no_rows);
    }
    /* A generated kernel and the public FLINT addon may be separately linked
       allocator domains. Model the publication sequence through the adapter
       primitives visible to this sanitizer harness: make a read-only deep
       copy, close the private source first, then grow and destroy only the
       public copy. ASan/UBSan/LSan exercise the large-limb lifecycle. */
    for (slong round = 0; round < 200; round++)
    {
        sagejs_fmpq_matrix_t private_matrix, public_matrix;
        fmpz_one(numerator);
        fmpz_mul_2exp(numerator, numerator, 521 + (ulong) round);
        fmpz_add_ui(numerator, numerator, (ulong) (2 * round + 1));
        fmpz_one(denominator);
        fmpz_mul_2exp(denominator, denominator, 607 + (ulong) round);
        fmpz_add_ui(denominator, denominator, (ulong) (2 * round + 3));
        if (!sagejs_fmpq_matrix_init(private_matrix, 2, 2) ||
            !sagejs_fmpq_matrix_set_entry(
                private_matrix, 0, 0, numerator, denominator) ||
            !sagejs_fmpq_matrix_init_set(public_matrix, private_matrix))
            return 8;
        sagejs_fmpq_matrix_clear(private_matrix);

        fmpz_mul_2exp(numerator, numerator, 733);
        fmpz_add_ui(numerator, numerator, (ulong) (2 * round + 5));
        fmpz_mul_2exp(denominator, denominator, 911);
        fmpz_add_ui(denominator, denominator, (ulong) (2 * round + 7));
        if (!sagejs_fmpq_matrix_set_entry(
                public_matrix, 1, 1, numerator, denominator))
            return 8;
        sagejs_fmpq_matrix_clear(public_matrix);
    }
    fmpz_clear(scale);
    fmpz_clear(denominator);
    fmpz_clear(numerator);
    printf("rounds=500\n");
    return 0;
}
`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}):\n` +
      `${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
}

const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpq-resource-ops-"));
try {
  const sourcePath = join(temporary, "lifecycle.c");
  const executable = join(temporary, "lifecycle");
  writeFileSync(sourcePath, source);
  const compiler = process.env.CC || "cc";
  run(compiler, [
    "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
    "-fsanitize=address,undefined",
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(flintPrefix, "include")}`,
    sourcePath,
    `-L${join(flintPrefix, "lib")}`,
    "-lflint", "-lopenblas", "-lmpfr", "-lgmp", "-lm", "-lpthread",
    "-o", executable,
  ]);
  const output = run(executable, [], {
    env: {
      ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1:strict_string_checks=1",
      UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1",
    },
  }).trim();
  process.stdout.write(JSON.stringify({
    schema: "sagejs.ffi/fmpq-resource-ops-lifecycle-v1",
    capability: "sanitizers",
    supported: true,
    compiler,
    dynamicRounds,
    result: output,
  }, null, 2) + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
