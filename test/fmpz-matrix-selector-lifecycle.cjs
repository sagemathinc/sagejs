#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
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

function dynamicLifecycleFuzz() {
  for (let round = 0; round < 300; round += 1) {
    const source = flint.ffiFmpzMatrixCreate(7n, 9n);
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 9; column += 1) {
        const exponent = (round + row * 7 + column * 13) % 193;
        const value = ((1n << BigInt(exponent)) + BigInt(round + column + 1)) *
          (column % 2 === 0 ? 1n : -1n);
        assert.equal(flint.ffiFmpzMatrixSetEntry(
          source, BigInt(row), BigInt(column), value,
        ), true);
      }
    }
    const rows = flint.ffiFmpzMatrixSelectRows(
      source, new BigUint64Array([6n, 0n, 3n, 6n]), 4n,
    );
    const columns = flint.ffiFmpzMatrixSelectColumns(
      source, new BigUint64Array([8n, 1n, 8n, 0n, 4n]), 5n,
    );
    assert.equal(flint.ffiFmpzMatrixNrows(rows), 4n);
    assert.equal(flint.ffiFmpzMatrixNcols(rows), 9n);
    assert.equal(flint.ffiFmpzMatrixNrows(columns), 7n);
    assert.equal(flint.ffiFmpzMatrixNcols(columns), 5n);
    assert.ok(accounted(rows) > 0n);
    assert.ok(accounted(columns) > 0n);
    assert.throws(
      () => flint.ffiFmpzMatrixSelectRows(
        source, new BigUint64Array([7n]), 1n,
      ),
      /invalid index/,
    );
    flint.ffiFmpzMatrixClose(columns);
    flint.ffiFmpzMatrixClose(columns);
    flint.ffiFmpzMatrixClose(rows);
    flint.ffiFmpzMatrixClose(rows);
    flint.ffiFmpzMatrixClose(source);
    flint.ffiFmpzMatrixClose(source);
    assert.equal(accounted(columns), 0n);
    assert.equal(accounted(rows), 0n);
    assert.equal(accounted(source), 0n);
  }
  return 300;
}

const dynamicRounds = dynamicLifecycleFuzz();
if (process.platform === "win32") {
  process.stdout.write(JSON.stringify({
    schema: "sagejs.ffi/fmpz-matrix-selector-lifecycle-v1",
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
#include <sagejs/fmpz_matrix_ffi.h>

int main(void)
{
    fmpz_t value;
    fmpz_init(value);
    for (slong round = 0; round < 1000; round++)
    {
        sagejs_fmpz_matrix_t source, selected_rows, selected_columns, failed;
        const uint64_t rows[4] = {6, 0, 3, 6};
        const uint64_t columns[5] = {8, 1, 8, 0, 4};
        const uint64_t invalid_row[1] = {7};
        const uint64_t invalid_column[1] = {9};
        const uint64_t harmless[1] = {0};
        if (!sagejs_fmpz_matrix_init(source, 7, 9))
            return 1;
        for (slong row = 0; row < 7; row++)
            for (slong column = 0; column < 9; column++)
            {
                fmpz_set_ui(value,
                    (ulong) (1 + round + 11 * row + 17 * column));
                fmpz_mul_2exp(value, value,
                    (ulong) ((round + 7 * row + 13 * column) % 193));
                if ((column & 1) != 0)
                    fmpz_neg(value, value);
                if (!sagejs_fmpz_matrix_set_entry(
                        source, (uint64_t) row, (uint64_t) column, value))
                    return 2;
            }
        if (!sagejs_fmpz_matrix_select_rows(
                selected_rows, source, rows, 4) ||
            !sagejs_fmpz_matrix_select_columns(
                selected_columns, source, columns, 5) ||
            sagejs_fmpz_matrix_nrows(selected_rows) != 4 ||
            sagejs_fmpz_matrix_ncols(selected_rows) != 9 ||
            sagejs_fmpz_matrix_nrows(selected_columns) != 7 ||
            sagejs_fmpz_matrix_ncols(selected_columns) != 5 ||
            !fmpz_equal(
                fmpz_mat_entry(selected_rows->value, 0, 8),
                fmpz_mat_entry(source->value, 6, 8)) ||
            !fmpz_equal(
                fmpz_mat_entry(selected_columns->value, 6, 2),
                fmpz_mat_entry(source->value, 6, 8)))
            return 3;
        if (sagejs_fmpz_matrix_select_rows(
                failed, source, invalid_row, 1) ||
            sagejs_fmpz_matrix_select_columns(
                failed, source, invalid_column, 1) ||
            sagejs_fmpz_matrix_select_rows(failed, source, NULL, 1) ||
            sagejs_fmpz_matrix_select_rows(
                failed, source, harmless, UINT64_MAX))
            return 4;

        /*
         * Reuse the output storage directly after every rejected call. If a
         * selector initialized it before validation, this overwrite leaks and
         * LeakSanitizer catches the non-transactional failure path.
         */
        if (!sagejs_fmpz_matrix_init(failed, 1, 1))
            return 5;
        sagejs_fmpz_matrix_clear(failed);
        sagejs_fmpz_matrix_clear(selected_columns);
        sagejs_fmpz_matrix_clear(selected_rows);
        sagejs_fmpz_matrix_clear(source);
    }
    {
        sagejs_fmpz_matrix_t no_rows, no_columns;
        sagejs_fmpz_matrix_t empty_rows, columns_of_no_rows;
        sagejs_fmpz_matrix_t rows_of_no_columns, empty_columns;
        const uint64_t two_columns[2] = {3, 1};
        const uint64_t two_rows[2] = {2, 0};
        if (!sagejs_fmpz_matrix_init(no_rows, 0, 4) ||
            !sagejs_fmpz_matrix_init(no_columns, 3, 0) ||
            !sagejs_fmpz_matrix_select_rows(
                empty_rows, no_rows, NULL, 0) ||
            !sagejs_fmpz_matrix_select_columns(
                columns_of_no_rows, no_rows, two_columns, 2) ||
            !sagejs_fmpz_matrix_select_rows(
                rows_of_no_columns, no_columns, two_rows, 2) ||
            !sagejs_fmpz_matrix_select_columns(
                empty_columns, no_columns, NULL, 0) ||
            sagejs_fmpz_matrix_nrows(empty_rows) != 0 ||
            sagejs_fmpz_matrix_ncols(empty_rows) != 4 ||
            sagejs_fmpz_matrix_nrows(columns_of_no_rows) != 0 ||
            sagejs_fmpz_matrix_ncols(columns_of_no_rows) != 2 ||
            sagejs_fmpz_matrix_nrows(rows_of_no_columns) != 2 ||
            sagejs_fmpz_matrix_ncols(rows_of_no_columns) != 0 ||
            sagejs_fmpz_matrix_nrows(empty_columns) != 3 ||
            sagejs_fmpz_matrix_ncols(empty_columns) != 0)
            return 6;
        sagejs_fmpz_matrix_clear(empty_columns);
        sagejs_fmpz_matrix_clear(rows_of_no_columns);
        sagejs_fmpz_matrix_clear(columns_of_no_rows);
        sagejs_fmpz_matrix_clear(empty_rows);
        sagejs_fmpz_matrix_clear(no_columns);
        sagejs_fmpz_matrix_clear(no_rows);
    }
    fmpz_clear(value);
    printf("rounds=1000\n");
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

const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-selectors-"));
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
    env: sanitizerEnvironment({ strictStringChecks: true }),
  }).trim();
  process.stdout.write(JSON.stringify({
    schema: "sagejs.ffi/fmpz-matrix-selector-lifecycle-v1",
    capability: "sanitizers",
    supported: true,
    compiler,
    dynamicRounds,
    result: output,
  }, null, 2) + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
