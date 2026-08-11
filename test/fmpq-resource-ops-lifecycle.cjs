#!/usr/bin/env node
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
    const sum = flint.ffiFmpqMatrixAdd(left, right);
    const difference = flint.ffiFmpqMatrixSub(sum, right);
    const negated = flint.ffiFmpqMatrixNeg(left);
    const scaled = flint.ffiFmpqMatrixScalarMul(left, -17n, 19n);
    const transposed = flint.ffiFmpqMatrixTranspose(left);
    const inverse = flint.ffiFmpqMatrixInv(left);
    const solution = flint.ffiFmpqMatrixSolve(left, right);
    const trace = flint.ffiFmpqMatrixTrace(left);
    assert.equal(flint.ffiFmpqMatrixEqual(left, difference), true);
    assert.equal(flint.ffiFmpqMatrixIsZero(left), false);
    assert.equal(flint.ffiFmpqMatrixIsOne(left), false);
    assert.equal(flint.ffiFmpqMatrixRank(left), 3n);
    assert.equal(flint.ffiFmpqMatrixRank(left), 3n);
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
    flint.ffiFmpqMatrixClose(solution);
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
    fmpz_t numerator, denominator;
    fmpz_init(numerator);
    fmpz_init(denominator);
    for (slong round = 0; round < 500; round++)
    {
        sagejs_fmpq_matrix_t left, right, sum, difference;
        sagejs_fmpq_matrix_t negated, scaled, transposed, inverse, solution;
        sagejs_fmpq_matrix_t singular, inconsistent, failed;
        sagejs_fmpq_value_t trace, failed_value;
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
        if (!sagejs_fmpq_matrix_add(sum, left, right) ||
            !sagejs_fmpq_matrix_sub(difference, sum, right) ||
            !sagejs_fmpq_matrix_neg(negated, left) ||
            !sagejs_fmpq_matrix_scalar_mul(
                scaled, left, numerator, denominator) ||
            !sagejs_fmpq_matrix_transpose(transposed, left) ||
            !sagejs_fmpq_matrix_inv(inverse, left) ||
            !sagejs_fmpq_matrix_solve(solution, left, right) ||
            !sagejs_fmpq_matrix_trace(trace, left) ||
            !sagejs_fmpq_matrix_equal(left, difference) ||
            sagejs_fmpq_matrix_is_zero(left) ||
            sagejs_fmpq_matrix_is_one(left) ||
            sagejs_fmpq_matrix_rank(left) != 3 ||
            sagejs_fmpq_matrix_rank(left) != 3)
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
            sagejs_fmpq_matrix_trace(failed_value, inconsistent))
            return 6;
        sagejs_fmpq_matrix_clear(inconsistent);
        sagejs_fmpq_matrix_clear(singular);
        sagejs_fmpq_matrix_clear(solution);
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
