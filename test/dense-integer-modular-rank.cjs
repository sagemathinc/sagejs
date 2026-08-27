#!/usr/bin/env node
// sagejs-test-tier: integration
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

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-zz-modular-rank-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), "--python", script],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...environment },
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return { stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const behavior = String.raw`
from sagejs.ffi.flint import fmpz_matrix_rank, fmpz_matrix_rank_mod_46337

def packed_forbidden(*args):
    raise AssertionError('hidden full host materialization')

def compare(matrix):
    expected = matrix.__copy__().rank(algorithm='flint')
    matrix._packed_integers = packed_forbidden
    assert matrix.rank() == expected
    return expected

# Both rectangular maximal-rank orientations are certified by a maximal
# minor. Empty matrices have exact rank zero without a special host path.
wide = identity_matrix(ZZ, 40).augment(zero_matrix(ZZ, 40, 23))
tall = identity_matrix(ZZ, 40).stack(zero_matrix(ZZ, 17, 40))
assert compare(wide) == 40
assert compare(tall) == 40
assert compare(matrix(ZZ, 0, 19)) == 0
assert compare(matrix(ZZ, 13, 0)) == 0

# Differential random full-rank examples exercise ordinary resource-backed
# construction while the exact FLINT operation remains the oracle.
set_random_seed(1729)
for rows, columns in [(23, 31), (31, 23), (32, 32)]:
    source = random_matrix(ZZ, rows, columns, x=-1000, y=1001)
    assert compare(source) == min(rows, columns)

# A smaller modular rank is inconclusive. Structured deficient matrices must
# therefore execute exact rank once and return the true non-maximal rank.
deficient = identity_matrix(ZZ, 39).augment(zero_matrix(ZZ, 39, 22))
deficient = deficient.stack(deficient.row(0))
assert compare(deficient) == 39

# Prime collision: this matrix has full exact rank, but its determinant is zero
# modulo 46337. This is the decisive no-false-negative fallback witness.
collision = diagonal_matrix(ZZ, [46337, 1, 1, 1])
assert fmpz_matrix_rank_mod_46337(collision._integer_resource()) == 3
assert fmpz_matrix_rank(collision._integer_resource()) == 4
collision._packed_integers = packed_forbidden
assert collision.rank() == 4

# Explicit backend choices retain their exact semantics. Mutation clears the
# rank cache before selecting the modular/exact route again.
for algorithm in ['flint', 'linbox']:
    assert wide.__copy__().rank(algorithm=algorithm) == 40
mutable = identity_matrix(ZZ, 8)
assert mutable.rank() == 8
mutable[7, 7] = 0
assert mutable.rank() == 7

print('dense-integer-modular-rank-ok')
`;

for (const nativeDisabled of [false, true]) {
  const { stdout } = runSage(behavior, {
    SAGEJS_NATIVE_DISABLE: nativeDisabled ? "1" : "0",
    SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
  });
  assert.equal(stdout, "dense-integer-modular-rank-ok");
}

const tracing = String.raw`
full = identity_matrix(ZZ, 4).augment(zero_matrix(ZZ, 4, 3))
deficient = full.stack(full.row(0))
collision = diagonal_matrix(ZZ, [46337, 1, 1, 1])
assert full.rank() == 4
assert deficient.rank() == 4
assert collision.rank() == 4
assert full.__copy__().rank(algorithm='flint') == 4
`;
const trace = runSage(tracing, { SAGEJS_NATIVE_TRACE: "1" }).stdout;
assert.match(
  trace,
  /Matrix\.rank ZZ 4x7 -> generated-flint-resource-modular-certificate/,
);
assert.match(
  trace,
  /Matrix\.rank ZZ 5x7 -> generated-flint-resource-modular-inconclusive-exact/,
);
assert.match(
  trace,
  /Matrix\.rank ZZ 4x4 -> generated-flint-resource-modular-inconclusive-exact/,
);
assert.match(
  trace,
  /Matrix\.rank ZZ 4x7 -> generated-flint-resource-exact/,
);

// Repeated direct adapter calls exercise the local nmod allocation/clear path
// and verify that neither operation mutates or consumes the borrowed resource.
const flint = require(join(root, "packages", "flint"));
for (let round = 0; round < 500; round += 1) {
  const matrix = flint.ffiFmpzMatrixCreate(3n, 4n);
  try {
    for (let index = 0; index < 3; index += 1) {
      assert.equal(
        flint.ffiFmpzMatrixSetEntry(
          matrix,
          BigInt(index),
          BigInt(index),
          BigInt(index === 0 && round % 2 === 1 ? 46337 : round + index + 1),
        ),
        true,
      );
    }
    const modular = flint.ffiFmpzMatrixRankMod46337(matrix);
    const exact = flint.ffiFmpzMatrixRank(matrix);
    assert.ok(modular <= exact);
    assert.equal(exact, 3n);
    assert.equal(flint.ffiFmpzMatrixNrows(matrix), 3n);
    assert.equal(flint.ffiFmpzMatrixNcols(matrix), 4n);
  } finally {
    flint.ffiFmpzMatrixClose(matrix);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`,
  );
  return result.stdout;
}

if (process.platform !== "win32") {
  const cSource = String.raw`
#include <stdint.h>
#include <stdio.h>
#include <sagejs/fmpz_matrix_ffi.h>

int main(void)
{
    for (slong round = 0; round < 1000; round++)
    {
        sagejs_fmpz_matrix_t matrix;
        fmpz_t entry;
        if (!sagejs_fmpz_matrix_init(matrix, 3, 4))
            return 1;
        fmpz_init(entry);
        for (slong index = 0; index < 3; index++)
        {
            fmpz_set_si(entry,
                index == 0 && (round & 1) ? 46337 : round + index + 1);
            if (!sagejs_fmpz_matrix_set_entry(
                    matrix, (uint64_t) index, (uint64_t) index, entry))
                return 2;
        }
        const uint64_t modular =
            sagejs_fmpz_matrix_rank_mod_46337(matrix);
        const uint64_t exact = sagejs_fmpz_matrix_rank(matrix);
        if (modular > exact || exact != 3)
            return 3;
        fmpz_clear(entry);
        sagejs_fmpz_matrix_clear(matrix);
    }
    printf("rounds=1000\n");
    return 0;
}
`;
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-zz-rank-lifecycle-"));
  try {
    const sourcePath = join(temporary, "lifecycle.c");
    const executable = join(temporary, "lifecycle");
    writeFileSync(sourcePath, cSource);
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
    assert.equal(
      run(executable, [], {
        env: {
          ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1",
          UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1",
        },
      }).trim(),
      "rounds=1000",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

const performance = String.raw`
import time

set_random_seed(20260812)
source = random_matrix(ZZ, 200, 300, x=-1000, y=1001)

def elapsed(function):
    start = time.perf_counter()
    answer = function()
    return answer, (time.perf_counter() - start) * 1000

certified_rank, certified_ms = elapsed(lambda: source.__copy__().rank())
exact_rank, exact_ms = elapsed(
    lambda: source.__copy__().rank(algorithm='flint')
)
assert certified_rank == exact_rank == 200

deficient = source.matrix_from_rows(range(199)).stack(source.row(0))
deficient_rank, deficient_ms = elapsed(lambda: deficient.rank())
assert deficient_rank == 199
print('TIMES', certified_ms, exact_ms, deficient_ms)
`;
const timing = runSage(performance).stdout;
const match = /^TIMES\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$/m.exec(timing);
assert.ok(match, timing);
const [certifiedMs, exactMs, deficientMs] = match.slice(1).map(Number);
assert.ok(certifiedMs < 100, timing);
assert.ok(exactMs > certifiedMs * 5, timing);
assert.ok(deficientMs > certifiedMs * 5, timing);

console.log(`dense integer modular rank tests passed (${timing})`);
