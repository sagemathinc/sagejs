#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { compile } = require("@sagemath/sagejs/native");
const flint = require("../packages/flint");

const root = join(__dirname, "..");
const sourcePath = join(
  root, "src", "lib", "sagejs", "kernels", "dense_prime.py",
);
const flintSourcePath = join(
  root, "src", "lib", "sagejs", "kernels", "dense_prime_flint.py",
);
const matrixSourcePath = join(root, "src", "baselib", "matrix.py");

function randomEntries(rows, columns, modulus, initialSeed) {
  let seed = BigInt(initialSeed) & ((1n << 64n) - 1n);
  const entries = [];
  for (let index = 0; index < rows * columns; index += 1) {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) &
      ((1n << 64n) - 1n);
    entries.push(seed % modulus);
  }
  return entries;
}

function sageRandomResidues(length, modulus, initialState) {
  const wordBase = 4294967296n;
  const limit = wordBase - wordBase % modulus;
  let state = BigInt(initialState);
  const entries = [];
  for (let index = 0; index < length; index += 1) {
    while (state >= limit) {
      state = (1664525n * state + 1013904223n) % wordBase;
    }
    entries.push(state % modulus);
    if (index + 1 < length) {
      state = (1664525n * state + 1013904223n) % wordBase;
    }
  }
  return { entries, state };
}

function matrix(rows, columns, modulus, entries) {
  return flint.nmodMatrix(rows, columns, entries, modulus);
}

function triangularEntries(size, modulus, seed) {
  const entries = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      entries.push(column > row
        ? 0n
        : column === row
          ? BigInt((row + seed) % Number(modulus - 1n) + 1)
          : BigInt((row * 17 + column * 29 + seed) % Number(modulus)));
    }
  }
  return entries;
}

function denseTriangularProduct(size, modulus, singular) {
  const lower = [];
  const upper = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      lower.push(column > row
        ? 0n
        : column === row
          ? 1n
          : BigInt(row * 104729 + column * 13007 + 17) % modulus);
      upper.push(column < row || (singular && row === size - 1)
        ? 0n
        : column === row
          ? BigInt(row + 1)
          : BigInt(row * 65537 + column * 8191 + 29) % modulus);
    }
  }
  const product = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let value = 0n;
      for (let inner = 0; inner < size; inner += 1) {
        value += lower[row * size + inner] * upper[inner * size + column];
      }
      product.push(value % modulus);
    }
  }
  return product;
}

function packed(kernel, entriesOrLength) {
  return kernel.createUInt64Buffer(entriesOrLength);
}

function denseRecord(entries, rows, columns, modulus) {
  return { entries, rows, columns, modulus };
}

function runSage(source, environment) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-dense-prime-script-"));
  try {
    const scriptPath = join(directory, "production.py");
    writeFileSync(scriptPath, source);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), scriptPath],
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

function runSageFailure(source, environment) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-native-failure-"));
  try {
    const scriptPath = join(directory, "failure.py");
    writeFileSync(scriptPath, source);
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), scriptPath],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ...environment },
      },
    );
    if (result.error) throw result.error;
    assert.notEqual(result.status, 0, "script unexpectedly succeeded");
    return `${result.stdout}\n${result.stderr}`;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const productionScript = String.raw`
import sagejs.runtime as runtime
from sagejs.kernels.dense_prime import (
    DensePrimeMatrix,
    dense_prime_rank,
    dense_prime_rref,
    dense_prime_right_kernel,
    dense_prime_solve,
)

backend = runtime.flint_backend()
packed_source = matrix(GF(97), 3, 3, range(9))
assert not hasattr(packed_source, '_native_handle')
assert packed_source.is_mutable()
packed_source[1, 2] = -1
assert packed_source[1, 2] == 96
packed_reduced = packed_source.rref()
assert not hasattr(packed_source, '_native_handle')
assert not hasattr(packed_reduced, '_native_handle')
assert packed_reduced.is_immutable()
try:
    packed_reduced[0, 0] = 0
    raise AssertionError('immutable RREF accepted mutation')
except ValueError:
    pass
set_random_seed(1729)
random_source = random_matrix(GF(97), 12, 9)
assert not hasattr(random_source, '_native_handle')
set_random_seed(1729)
assert random_matrix(GF(97), 12, 9) == random_source
packed_left = matrix(GF(97), 2, 3, [1, 2, 3, 4, 5, 6])
packed_right = matrix(GF(97), 3, 2, [7, 8, 9, 10, 11, 12])
packed_product = packed_left * packed_right
assert not hasattr(packed_left, '_native_handle')
assert not hasattr(packed_right, '_native_handle')
assert not hasattr(packed_product, '_native_handle')
assert packed_product == matrix(GF(97), 2, 2, [58, 64, 42, 57])
for modulus in [2, 3, 5, 101, 65521, 4294967291]:
    field = GF(modulus)
    for rows, columns in [(0, 0), (0, 4), (4, 0), (1, 1), (2, 5), (5, 2), (7, 7)]:
        entries = [
            (row * 97 + column * 53 + modulus + rows) % modulus
            for row in range(rows)
            for column in range(columns)
        ]
        source = matrix(field, rows, columns, entries)
        legacy_rank = int(backend.matrixRank(source._native))
        legacy_rref = source._new(backend.matrixRref(source._native))
        legacy_kernel = source._new_shape(
            backend.matrixRightKernel(source._native),
            columns - legacy_rank,
            columns,
        )
        source_buffer = list(entries)
        source_record = DensePrimeMatrix(
            source_buffer, rows, columns, modulus)
        rank_workspace = [0 for _index in range(rows * columns)]
        assert dense_prime_rank(
            source_record, rank_workspace,
        ) == legacy_rank
        rref_output = [0 for _index in range(rows * columns)]
        rref_rank = dense_prime_rref(
            source_record, rref_output)
        assert rref_rank == legacy_rank
        assert matrix(field, rows, columns, rref_output) == legacy_rref
        kernel_workspace = [0 for _index in range(rows * columns)]
        kernel_output = [0 for _index in range(columns * columns)]
        nullity = dense_prime_right_kernel(
            source_record,
            kernel_workspace,
            kernel_output,
        )
        assert matrix(
            field,
            nullity,
            columns,
            kernel_output[:nullity * columns],
        ) == legacy_kernel
        assert source.rank() == legacy_rank
        assert source.rref() == legacy_rref
        assert source.right_kernel_matrix() == legacy_kernel

    size = 6
    left_entries = []
    for row in range(size):
        for column in range(size):
            if column > row:
                left_entries.append(0)
            elif column == row:
                left_entries.append((row + 1) % modulus or 1)
            else:
                left_entries.append((row * 11 + column * 7 + 1) % modulus)
    right_entries = [
        (row * 13 + column * 19 + 2) % modulus
        for row in range(size)
        for column in range(3)
    ]
    left = matrix(field, size, size, left_entries)
    right = matrix(field, size, 3, right_entries)
    legacy_solution = left._new_shape(
        backend.matrixSolve(left._native, right._native), size, 3)
    solve_workspace = [0 for _index in range(size * (size + 3))]
    solve_output = [0 for _index in range(size * 3)]
    assert dense_prime_solve(
        DensePrimeMatrix(left_entries, size, size, modulus),
        DensePrimeMatrix(right_entries, size, 3, modulus),
        solve_workspace,
        solve_output,
    ) == 1
    assert matrix(field, size, 3, solve_output) == legacy_solution
    assert left.solve_right(right) == legacy_solution
    assert left * legacy_solution == right
print("dense-prime-production-ok")
`;

(async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-dense-prime-"));
  try {
    const matrixSource = readFileSync(matrixSourcePath, "utf8");
    assert.doesNotMatch(matrixSource, /__sagejs_load_module__|Reflect\.apply/);
    assert.match(
      matrixSource,
      /__import__\(\s*['"]sagejs\.kernels\.dense_prime['"]/,
    );
    const compiled = await compile({ sourcePath, cacheRoot: temporary });
    const compiledFlint = await compile({
      sourcePath: flintSourcePath,
      cacheRoot: temporary,
    });
    const kernel = require(compiled.modulePath);
    const flintKernel = require(compiledFlint.modulePath);
    const functions = new Map(
      compiled.ir.functions.map((fn) => [fn.name, fn]),
    );
    assert.deepEqual(
      functions.get("dense_prime_rank").dependencies,
      ["_dense_prime_blocked_full_rank", "_dense_prime_rank_inplace"],
    );
    assert.deepEqual(
      functions.get("dense_prime_right_kernel").dependencies,
      ["_dense_prime_rref_inplace", "dense_prime_rref"],
    );
    assert.deepEqual(
      functions.get("dense_prime_solve").dependencies,
      ["_dense_prime_rref_inplace"],
    );
    assert.equal(
      functions.get("dense_prime_random_fill").kernelKind,
      "prime-field-source",
    );
    assert.match(
      compiledFlint.ir.functions.find(
        (fn) => fn.name === "flint_dense_prime_mul",
      ).foreignDependencies[0],
      /^flint@[a-f0-9]{64}:nmod_mat_mul$/,
    );
    const core = readFileSync(compiled.coreSourcePath, "utf8");
    const header = readFileSync(compiled.coreHeaderPath, "utf8");
    assert.doesNotMatch(core, /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/);
    assert.match(header, /sagejs_source_u64_buffer/);
    assert.match(header, /sagejs_native_record_DensePrimeMatrix/);
    assert.doesNotMatch(header, /\bsagejs_matrix\s*\*|napi_value/);

    for (const [length, modulus, seed] of [
      [0, 2n, 0n],
      [1, 97n, 1729n],
      [1000, 97n, 0xffffffffn],
      [1000, 4294967291n, 4000000000n],
    ]) {
      const target = packed(kernel, length);
      const expected = sageRandomResidues(length, modulus, seed);
      const finalState = kernel.dense_prime_random_fill(
        target, modulus, seed,
      );
      assert.deepEqual(Array.from(target), expected.entries);
      assert.equal(BigInt(finalState), expected.state);
    }

    const shapes = [
      [0, 0], [0, 5], [5, 0], [1, 1], [2, 7], [7, 2], [8, 8],
    ];
    for (const modulus of [2n, 3n, 5n, 101n, 65521n, 4294967291n]) {
      for (const [rows, columns] of shapes) {
        for (let seed = 1; seed <= 5; seed += 1) {
          const entries = randomEntries(
            rows, columns, modulus, seed * 101,
          );
          const sourceMatrix = matrix(rows, columns, modulus, entries);
          const expectedRank = flint.matrixRank(sourceMatrix);
          const expectedRref = flint.matrixRref(sourceMatrix);
          const expectedKernel = flint.matrixRightKernel(sourceMatrix);
          const source = packed(kernel, entries);
          const sourceRecord = denseRecord(
            source, rows, columns, modulus,
          );
          const original = Array.from(source);

          const rankWorkspace = packed(kernel, rows * columns);
          assert.equal(
            kernel.dense_prime_rank(
              sourceRecord, rankWorkspace,
            ),
            expectedRank,
          );

          const rref = packed(kernel, rows * columns);
          assert.equal(
            kernel.dense_prime_rref(sourceRecord, rref),
            expectedRank,
          );
          assert.equal(
            flint.matrixEqual(
              matrix(rows, columns, modulus, Array.from(rref)),
              expectedRref,
            ),
            true,
          );

          const kernelWorkspace = packed(kernel, rows * columns);
          const kernelOutput = packed(kernel, columns * columns);
          const nullity = kernel.dense_prime_right_kernel(
            sourceRecord,
            kernelWorkspace,
            kernelOutput,
          );
          assert.equal(nullity, columns - expectedRank);
          assert.equal(
            flint.matrixEqual(
              matrix(
                nullity,
                columns,
                modulus,
                Array.from(kernelOutput).slice(0, nullity * columns),
              ),
              expectedKernel,
            ),
            true,
          );
          assert.deepEqual(Array.from(source), original);

          assert.equal(Number(flintKernel.flint_dense_prime_rank(
            source, rows, columns, modulus,
          )), expectedRank);
          const flintRref = packed(kernel, rows * columns);
          assert.equal(Number(flintKernel.flint_dense_prime_rref(
            flintRref, source, rows, columns, modulus,
          )), expectedRank);
          assert.equal(flint.matrixEqual(
            matrix(rows, columns, modulus, Array.from(flintRref)),
            expectedRref,
          ), true);
          const flintKernelOutput = packed(kernel, columns * columns);
          assert.equal(Number(flintKernel.flint_dense_prime_right_kernel(
            flintKernelOutput, source, rows, columns, modulus,
          )), nullity);
          assert.equal(flint.matrixEqual(
            matrix(
              nullity,
              columns,
              modulus,
              Array.from(flintKernelOutput).slice(
                0, nullity * columns,
              ),
            ),
            expectedKernel,
          ), true);
        }
      }

      for (let size = 0; size <= 12; size += 1) {
        const leftEntries = triangularEntries(size, modulus, size + 3);
        const rightEntries = randomEntries(size, 3, modulus, size + 701);
        const leftMatrix = matrix(size, size, modulus, leftEntries);
        const rightMatrix = matrix(size, 3, modulus, rightEntries);
        const expected = flint.matrixSolve(leftMatrix, rightMatrix);
        const left = packed(kernel, leftEntries);
        const right = packed(kernel, rightEntries);
        const workspace = packed(kernel, size * (size + 3));
        const output = packed(kernel, size * 3);
        assert.equal(
          kernel.dense_prime_solve(
            denseRecord(left, size, size, modulus),
            denseRecord(right, size, 3, modulus),
            workspace,
            output,
          ),
          1,
        );
        const flintOutput = packed(kernel, size * 3);
        assert.equal(flintKernel.flint_dense_prime_solve(
          flintOutput,
          left,
          right,
          size,
          3,
          modulus,
        ), true);
        assert.equal(flint.matrixEqual(
          matrix(size, 3, modulus, Array.from(flintOutput)),
          expected,
        ), true);
        const actual = matrix(size, 3, modulus, Array.from(output));
        assert.equal(flint.matrixEqual(actual, expected), true);
        assert.equal(
          flint.matrixEqual(flint.matrixMul(leftMatrix, actual), rightMatrix),
          true,
        );
      }

      const leftRows = 7;
      const inner = 5;
      const rightColumns = 9;
      const leftEntries = randomEntries(
        leftRows, inner, modulus, Number(modulus % 7919n) + 31,
      );
      const rightEntries = randomEntries(
        inner, rightColumns, modulus, Number(modulus % 7877n) + 73,
      );
      const product = packed(kernel, leftRows * rightColumns);
      assert.equal(flintKernel.flint_dense_prime_mul(
        product,
        packed(kernel, leftEntries),
        packed(kernel, rightEntries),
        leftRows,
        inner,
        rightColumns,
        modulus,
      ), true);
      assert.equal(flint.matrixEqual(
        matrix(leftRows, rightColumns, modulus, Array.from(product)),
        flint.matrixMul(
          matrix(leftRows, inner, modulus, leftEntries),
          matrix(inner, rightColumns, modulus, rightEntries),
        ),
      ), true);
    }

    // Exercise the blocked panel update at the largest 32-bit prime.  The
    // rank-(n-1) product detects accidental uint64 accumulation wraparound:
    // an incorrect Schur complement would usually invent a final pivot.
    const boundaryPrime = 4294967291n;
    const blockedSize = 40;
    for (const singular of [false, true]) {
      const entries = denseTriangularProduct(
        blockedSize, boundaryPrime, singular,
      );
      const source = packed(kernel, entries);
      const workspace = packed(kernel, blockedSize * blockedSize);
      assert.equal(
        kernel.dense_prime_rank(
          denseRecord(source, blockedSize, blockedSize, boundaryPrime),
          workspace,
        ),
        singular ? blockedSize - 1 : blockedSize,
      );
    }

    const singularLeft = packed(kernel, [1n, 2n, 2n, 4n]);
    const singularRight = packed(kernel, [1n, 0n]);
    assert.equal(
      kernel.dense_prime_solve(
        denseRecord(singularLeft, 2, 2, 5n),
        denseRecord(singularRight, 2, 1, 5n),
        packed(kernel, 6),
        packed(kernel, 2),
      ),
      0,
    );
    assert.throws(
      () => kernel.dense_prime_rank(
        denseRecord(packed(kernel, 3), 2, 2, 5n), packed(kernel, 4),
      ),
      /shape mismatch/,
    );

    assert.equal(
      runSage(productionScript, {
        SAGEJS_NATIVE_CACHE_DIR: temporary,
      }),
      "dense-prime-production-ok",
    );
    assert.equal(
      runSage(productionScript, {
        SAGEJS_NATIVE_CACHE_DIR: temporary,
        SAGEJS_NATIVE_AUTOLOAD: "0",
      }),
      "dense-prime-production-ok",
    );

    const traceScript = String.raw`
source = matrix(GF(97), 2, 2, [1, 2, 3, 4])
random_matrix(GF(97), 2, 2)
source * source
source.rref()
print("trace-ok")
`;
    assert.match(
      runSage(traceScript, {
        SAGEJS_NATIVE_CACHE_DIR: temporary,
        SAGEJS_NATIVE_TRACE: "1",
      }),
      /Matrix\.random_matrix GF\(97\) 2x2 -> typed-python-isolated/,
    );
    assert.match(
      runSage(traceScript, {
        SAGEJS_NATIVE_CACHE_DIR: temporary,
        SAGEJS_NATIVE_TRACE: "1",
      }),
      /Matrix\.multiply GF\(97\) 2x2 -> declared-flint-isolated/,
    );
    assert.match(
      runSage(traceScript, {
        SAGEJS_NATIVE_CACHE_DIR: temporary,
        SAGEJS_NATIVE_TRACE: "1",
      }),
      /Matrix\.rref GF\(97\) 2x2 -> declared-flint-isolated/,
    );
    assert.match(
      runSage(traceScript, {
        SAGEJS_NATIVE_CACHE_DIR: temporary,
        SAGEJS_NATIVE_AUTOLOAD: "0",
        SAGEJS_NATIVE_TRACE: "1",
      }),
      /Matrix\.random_matrix GF\(97\) 2x2 -> typed-python-dynamic-fallback/,
    );
    assert.match(
      runSage(traceScript, {
        SAGEJS_NATIVE_CACHE_DIR: temporary,
        SAGEJS_NATIVE_AUTOLOAD: "0",
        SAGEJS_NATIVE_TRACE: "1",
      }),
      /Matrix\.multiply GF\(97\) 2x2 -> declared-flint-adapter/,
    );
    assert.match(
      runSage(traceScript, {
        SAGEJS_NATIVE_CACHE_DIR: temporary,
        SAGEJS_NATIVE_AUTOLOAD: "0",
        SAGEJS_NATIVE_TRACE: "1",
      }),
      /Matrix\.rref GF\(97\) 2x2 -> declared-flint-adapter/,
    );

    const importKernel = String.raw`
from sagejs.kernels.dense_prime import dense_prime_rref
print("import-ok")
`;
    const warning = runSage(importKernel, {
      SAGEJS_NATIVE_CACHE_DIR: temporary,
      SAGEJS_NATIVE_AUTOLOAD: "0",
      SAGEJS_NATIVE_WARN_FALLBACK: "1",
    });
    assert.match(warning, /using dynamic fallbacks/);
    assert.equal(
      warning.match(/using dynamic fallbacks/g)?.length,
      1,
      "fallback diagnostics must warn once per source",
    );
    assert.match(
      runSageFailure(importKernel, {
        SAGEJS_NATIVE_CACHE_DIR: temporary,
        SAGEJS_NATIVE_AUTOLOAD: "0",
        SAGEJS_NATIVE_REQUIRED: "1",
      }),
      /has no matching compiled artifact/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  console.log(
    "Packed production Matrix, typed Python, declared FFI, mutation, and FLINT dense GF(p) oracles passed.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
