"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");

const root = resolve(__dirname, "..");
const repositoryRoot = resolve(root, "..", "..");
const { compile } = require(join(repositoryRoot, "tools", "native-kernel.cjs"));
const m4ri = require(root);
const manifest = require(join(root, "build", "generated-ffi", "manifest.json"));
const generated = require(join(root, "build", "generated-ffi", manifest.addon));
const {
  removeLoadedNativeCache,
} = require(join(repositoryRoot, "test", "helpers", "native-cache-cleanup.cjs"));

function close(resource, closer) {
  closer(resource);
  closer(resource);
}

test("ordinary dependency builds preserve a restored dependency generation", {
  skip: process.platform === "win32",
}, () => {
  const prefix = join(root, ".native", "prefix");
  const shared = lstatSync(prefix).isSymbolicLink();
  const generation = shared ? readlinkSync(prefix) : null;
  if (!shared) {
    assert.equal(
      JSON.parse(
        readFileSync(
          join(prefix, ".sagejs-prebuilt-dependencies.json"),
          "utf8",
        ),
      ).package,
      "m4ri",
    );
  }
  const header = join(prefix, "include", "sagejs", "m4ri_matrix_ffi.h");
  const contents = readFileSync(header);
  const environment = { ...process.env };
  delete environment.SAGEJS_M4RI_PREFIX;
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts", "build-deps.cjs")],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: environment,
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(lstatSync(prefix).isSymbolicLink(), shared);
  if (shared) assert.equal(readlinkSync(prefix), generation);
  assert.deepEqual(readFileSync(header), contents);
  assert.match(result.stdout, /Native cache m4ri-dependencies: present/);
});

function fromRows(rows, columns = rows[0]?.length ?? 0) {
  const bytes = Buffer.alloc(rows.length * columns);
  for (let row = 0; row < rows.length; row += 1) {
    assert.equal(rows[row].length, columns);
    for (let column = 0; column < columns; column += 1) {
      bytes[row * columns + column] = rows[row][column];
    }
  }
  const region = m4ri.ffiM4riByteRegionFromBytes(bytes);
  try {
    return m4ri.ffiM4riMatrixFromSagepackBytes(
      region,
      BigInt(rows.length),
      BigInt(columns),
    );
  } finally {
    close(region, m4ri.ffiM4riByteRegionClose);
  }
}

function toRows(matrix) {
  const rows = Number(m4ri.ffiM4riMatrixNrows(matrix));
  const columns = Number(m4ri.ffiM4riMatrixNcols(matrix));
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => Number(
      m4ri.ffiM4riMatrixEntryCode(matrix, BigInt(row), BigInt(column)),
    )));
}

function multiply(left, right) {
  const rows = left.length;
  const inner = left[0]?.length ?? right.length;
  const columns = right[0]?.length ?? 0;
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => {
      let value = 0;
      for (let index = 0; index < inner; index += 1) {
        value ^= left[row][index] & right[index][column];
      }
      return value;
    }));
}

function transpose(source) {
  const columns = source[0]?.length ?? 0;
  return Array.from({ length: columns }, (_, column) =>
    source.map((row) => row[column]));
}

function rref(source) {
  const answer = source.map((row) => [...row]);
  const rows = answer.length;
  const columns = answer[0]?.length ?? 0;
  let rank = 0;
  for (let column = 0; column < columns && rank < rows; column += 1) {
    let pivot = rank;
    while (pivot < rows && answer[pivot][column] === 0) pivot += 1;
    if (pivot === rows) continue;
    [answer[rank], answer[pivot]] = [answer[pivot], answer[rank]];
    for (let row = 0; row < rows; row += 1) {
      if (row !== rank && answer[row][column] !== 0) {
        for (let index = column; index < columns; index += 1) {
          answer[row][index] ^= answer[rank][index];
        }
      }
    }
    rank += 1;
  }
  return { answer, rank };
}

test("M4RI capability has an explicit native Windows fallback", () => {
  assert.equal(m4ri.ffiM4riAvailable(), process.platform !== "win32");
});

test("generated M4RI resources cover checked structural operations", {
  skip: !m4ri.ffiM4riAvailable(),
}, () => {
  const leftRows = [[1, 1, 0], [0, 1, 1]];
  const rightRows = [[1, 0], [1, 1], [0, 1]];
  const left = fromRows(leftRows);
  const right = fromRows(rightRows);
  const copied = m4ri.ffiM4riMatrixCopy(left);
  const transposed = m4ri.ffiM4riMatrixTranspose(left);
  const product = m4ri.ffiM4riMatrixMul(left, right);
  assert.equal(m4ri.ffiM4riMatrixEqual(left, copied), true);
  assert.deepEqual(toRows(transposed), transpose(leftRows));
  assert.deepEqual(toRows(product), multiply(leftRows, rightRows));
  assert.equal(m4ri.ffiM4riMatrixRank(left), 2n);
  assert.equal(m4ri.ffiM4riMatrixEntryCode(left, 0n, 0n), 1n);
  assert.equal(m4ri.ffiM4riMatrixEntryCode(left, 2n, 0n), 2n);
  assert.throws(
    () => m4ri.ffiM4riMatrixSetEntry(left, 0n, 0n, 2n),
    /entry or index is invalid/,
  );
  assert.throws(
    () => m4ri.ffiM4riMatrixSetEntry(left, 9n, 0n, 0n),
    /entry or index is invalid/,
  );
  assert.equal(m4ri.ffiM4riMatrixSetEntry(copied, 0n, 0n, 0n), true);
  assert.equal(m4ri.ffiM4riMatrixEntryCode(left, 0n, 0n), 1n);
  assert.equal(m4ri.ffiM4riMatrixEntryCode(copied, 0n, 0n), 0n);
  assert.throws(
    () => m4ri.ffiM4riMatrixMul(left, left),
    /incompatible for multiplication/,
  );
  for (const resource of [product, transposed, copied, right, left]) {
    close(resource, m4ri.ffiM4riMatrixClose);
  }
});

test("generated M4RI row selection preserves resources and shapes", {
  skip: !m4ri.ffiM4riAvailable(),
}, () => {
  const sourceRows = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 1],
  ];
  const source = fromRows(sourceRows);
  const selected = m4ri.ffiM4riMatrixSelectRows(
    source,
    new BigUint64Array([3n, 1n, 3n]),
    3n,
  );
  const empty = m4ri.ffiM4riMatrixSelectRows(
    source,
    new BigUint64Array(0),
    0n,
  );
  const zeroColumnsSource = m4ri.ffiM4riMatrixCreate(3n, 0n);
  const zeroColumns = m4ri.ffiM4riMatrixSelectRows(
    zeroColumnsSource,
    new BigUint64Array([2n, 0n]),
    2n,
  );

  assert.deepEqual(toRows(source), sourceRows);
  assert.deepEqual(toRows(selected), [sourceRows[3], sourceRows[1], sourceRows[3]]);
  assert.deepEqual(
    [m4ri.ffiM4riMatrixNrows(empty), m4ri.ffiM4riMatrixNcols(empty)],
    [0n, 3n],
  );
  assert.deepEqual(
    [
      m4ri.ffiM4riMatrixNrows(zeroColumns),
      m4ri.ffiM4riMatrixNcols(zeroColumns),
    ],
    [2n, 0n],
  );
  assert.throws(
    () => m4ri.ffiM4riMatrixSelectRows(
      source,
      new BigUint64Array([4n]),
      1n,
    ),
    /row index is out of range/,
  );
  assert.throws(
    () => m4ri.ffiM4riMatrixSelectRows(
      source,
      new BigUint64Array([0n]),
      2n,
    ),
    /packed slice length does not match/,
  );

  m4ri.ffiM4riMatrixSetEntry(selected, 0n, 0n, 0n);
  assert.equal(m4ri.ffiM4riMatrixEntryCode(source, 3n, 0n), 1n);
  assert.equal(m4ri.ffiM4riMatrixEntryCode(selected, 2n, 0n), 1n);
  close(source, m4ri.ffiM4riMatrixClose);
  assert.deepEqual(toRows(selected), [[0, 1, 1], [0, 1, 0], [1, 1, 1]]);

  for (const resource of [zeroColumns, zeroColumnsSource, empty, selected]) {
    close(resource, m4ri.ffiM4riMatrixClose);
  }
});

test("generated M4RI prefix selection preserves resources and shapes", {
  skip: !m4ri.ffiM4riAvailable(),
}, () => {
  const sourceRows = [[1, 0, 1], [0, 1, 1], [1, 1, 0]];
  const source = fromRows(sourceRows);
  const prefix = m4ri.ffiM4riMatrixPrefixRows(source, 2n);
  const empty = m4ri.ffiM4riMatrixPrefixRows(source, 0n);
  assert.deepEqual(toRows(prefix), sourceRows.slice(0, 2));
  assert.deepEqual(
    [m4ri.ffiM4riMatrixNrows(empty), m4ri.ffiM4riMatrixNcols(empty)],
    [0n, 3n],
  );
  assert.throws(
    () => m4ri.ffiM4riMatrixPrefixRows(source, 4n),
    /row-prefix count is invalid/,
  );
  m4ri.ffiM4riMatrixSetEntry(prefix, 0n, 0n, 0n);
  assert.equal(m4ri.ffiM4riMatrixEntryCode(source, 0n, 0n), 1n);
  close(source, m4ri.ffiM4riMatrixClose);
  assert.deepEqual(toRows(prefix), [[0, 0, 1], [0, 1, 1]]);
  close(prefix, m4ri.ffiM4riMatrixClose);
  close(empty, m4ri.ffiM4riMatrixClose);
});

test("RREF, determinant, inverse, solve, and right kernel are differential", {
  skip: !m4ri.ffiM4riAvailable(),
}, () => {
  let state = 0x6d_34_91_27;
  function bit() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 31;
  }
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const rows = 1 + (iteration % 7);
    const columns = 1 + ((iteration * 5) % 9);
    const sourceRows = Array.from({ length: rows }, () =>
      Array.from({ length: columns }, bit));
    const expected = rref(sourceRows);
    const source = fromRows(sourceRows);
    const reduced = m4ri.ffiM4riMatrixRref(source);
    const kernel = m4ri.ffiM4riMatrixRightKernel(source);
    const kernelRows = toRows(kernel);
    assert.equal(m4ri.ffiM4riMatrixRank(source), BigInt(expected.rank));
    // RREF records the rank returned by the same elimination. This query is
    // therefore a scalar metadata read rather than a second echelonization.
    assert.equal(m4ri.ffiM4riMatrixRank(reduced), BigInt(expected.rank));
    assert.deepEqual(toRows(reduced), expected.answer);
    if (expected.rank !== 0) {
      for (let column = 0; column < columns; column += 1) {
        m4ri.ffiM4riMatrixSetEntry(reduced, 0n, BigInt(column), 0n);
      }
      assert.equal(
        m4ri.ffiM4riMatrixRank(reduced),
        BigInt(expected.rank - 1),
      );
    }
    assert.equal(kernelRows.length, columns - expected.rank);
    assert.deepEqual(
      multiply(sourceRows, transpose(kernelRows)),
      Array.from({ length: rows }, () => Array(kernelRows.length).fill(0)),
    );
    assert.equal(m4ri.ffiM4riMatrixRank(kernel), BigInt(kernelRows.length));
    close(kernel, m4ri.ffiM4riMatrixClose);
    close(reduced, m4ri.ffiM4riMatrixClose);
    close(source, m4ri.ffiM4riMatrixClose);
  }

  const invertible = fromRows([[1, 1, 0], [0, 1, 1], [1, 1, 1]]);
  const inverse = m4ri.ffiM4riMatrixInverse(invertible);
  const identity = m4ri.ffiM4riMatrixMul(invertible, inverse);
  assert.deepEqual(toRows(identity), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  assert.equal(m4ri.ffiM4riMatrixDeterminantCode(invertible), 1n);
  const rhs = fromRows([[1, 0], [0, 1], [1, 1]]);
  const solution = m4ri.ffiM4riMatrixSolve(invertible, rhs);
  const solvedProduct = m4ri.ffiM4riMatrixMul(invertible, solution);
  assert.deepEqual(toRows(solvedProduct), toRows(rhs));
  close(solvedProduct, m4ri.ffiM4riMatrixClose);

  const singular = fromRows([[1, 1], [1, 1]]);
  assert.equal(m4ri.ffiM4riMatrixDeterminantCode(singular), 0n);
  assert.throws(() => m4ri.ffiM4riMatrixInverse(singular), /not invertible/);
  assert.equal(m4ri.ffiM4riMatrixDeterminantCode(rhs), 2n);

  const overdetermined = fromRows([[1, 0], [0, 1], [1, 1]]);
  const consistent = fromRows([[1], [0], [1]]);
  const rectangularSolution = m4ri.ffiM4riMatrixSolve(
    overdetermined,
    consistent,
  );
  assert.deepEqual(toRows(rectangularSolution), [[1], [0]]);
  const inconsistent = fromRows([[1], [0], [0]]);
  assert.throws(
    () => m4ri.ffiM4riMatrixSolve(overdetermined, inconsistent),
    /no solution/,
  );

  const underdetermined = fromRows([[1, 0, 1], [0, 1, 1]]);
  const underdeterminedRhs = fromRows([[1], [0]]);
  const underdeterminedSolution = m4ri.ffiM4riMatrixSolve(
    underdetermined,
    underdeterminedRhs,
  );
  const underdeterminedProduct = m4ri.ffiM4riMatrixMul(
    underdetermined,
    underdeterminedSolution,
  );
  assert.deepEqual(toRows(underdeterminedProduct), toRows(underdeterminedRhs));
  for (const resource of [
    underdeterminedProduct,
    underdeterminedSolution,
    underdeterminedRhs,
    underdetermined,
    inconsistent,
    rectangularSolution,
    consistent,
    overdetermined,
  ]) {
    close(resource, m4ri.ffiM4riMatrixClose);
  }
  for (const resource of [singular, solution, rhs, identity, inverse, invertible]) {
    close(resource, m4ri.ffiM4riMatrixClose);
  }
});

test("empty shapes and canonical logical row words are explicit", {
  skip: !m4ri.ffiM4riAvailable(),
}, () => {
  for (const [rows, columns] of [[0, 0], [0, 13], [9, 0]]) {
    const matrix = m4ri.ffiM4riMatrixCreate(BigInt(rows), BigInt(columns));
    const copy = m4ri.ffiM4riMatrixCopy(matrix);
    const transposed = m4ri.ffiM4riMatrixTranspose(matrix);
    const reduced = m4ri.ffiM4riMatrixRref(matrix);
    assert.deepEqual(
      [m4ri.ffiM4riMatrixNrows(copy), m4ri.ffiM4riMatrixNcols(copy)],
      [BigInt(rows), BigInt(columns)],
    );
    assert.deepEqual(
      [m4ri.ffiM4riMatrixNrows(transposed), m4ri.ffiM4riMatrixNcols(transposed)],
      [BigInt(columns), BigInt(rows)],
    );
    assert.equal(m4ri.ffiM4riMatrixRank(reduced), 0n);
    for (const resource of [reduced, transposed, copy, matrix]) {
      close(resource, m4ri.ffiM4riMatrixClose);
    }
  }

  const source = m4ri.ffiM4riMatrixCreate(2n, 67n);
  for (const [row, column] of [[0, 0], [0, 63], [0, 64], [0, 66], [1, 65]]) {
    m4ri.ffiM4riMatrixSetEntry(source, BigInt(row), BigInt(column), 1n);
  }
  const words = m4ri.ffiM4riMatrixLogicalWords(source);
  const bytes = m4ri.ffiM4riByteRegionCopyBytes(words);
  assert.equal(bytes.length, 32);
  assert.equal(bytes.readBigUInt64LE(0), (1n << 63n) | 1n);
  assert.equal(bytes.readBigUInt64LE(8), 5n);
  assert.equal(bytes.readBigUInt64LE(16), 0n);
  assert.equal(bytes.readBigUInt64LE(24), 2n);
  const roundtrip = m4ri.ffiM4riMatrixFromLogicalWords(words, 2n, 67n);
  assert.equal(m4ri.ffiM4riMatrixEqual(source, roundtrip), true);

  const badBytes = Buffer.from(bytes);
  badBytes.writeBigUInt64LE(1n << 63n, 8);
  const bad = m4ri.ffiM4riByteRegionFromBytes(badBytes);
  assert.throws(
    () => m4ri.ffiM4riMatrixFromLogicalWords(bad, 2n, 67n),
    /invalid canonical/,
  );
  close(bad, m4ri.ffiM4riByteRegionClose);
  close(roundtrip, m4ri.ffiM4riMatrixClose);
  close(words, m4ri.ffiM4riByteRegionClose);
  close(source, m4ri.ffiM4riMatrixClose);
});

test("SagePack-compatible bytes, format, accounting, and lifecycle are checked", {
  skip: !m4ri.ffiM4riAvailable(),
}, () => {
  const source = fromRows([[1, 0, 1], [0, 1, 1]]);
  const packed = m4ri.ffiM4riMatrixSagepackBytes(source);
  assert.deepEqual([...m4ri.ffiM4riByteRegionCopyBytes(packed)], [1, 0, 1, 0, 1, 1]);
  const restored = m4ri.ffiM4riMatrixFromSagepackBytes(packed, 2n, 3n);
  assert.equal(m4ri.ffiM4riMatrixEqual(source, restored), true);
  const formatted = m4ri.ffiM4riMatrixFormat(source);
  assert.equal(m4ri.ffiM4riByteRegionCopyBytes(formatted).toString(), "[1 0 1]\n[0 1 1]");

  const accounted = generated.__sagejsFfiResourceExternalMemory;
  assert.equal(typeof accounted, "function");
  assert.ok(accounted(source) >= 64n);
  assert.ok(accounted(packed) >= 6n);
  close(formatted, m4ri.ffiM4riByteRegionClose);
  close(restored, m4ri.ffiM4riMatrixClose);
  close(packed, m4ri.ffiM4riByteRegionClose);
  close(source, m4ri.ffiM4riMatrixClose);
  assert.equal(accounted(source), 0n);
  assert.throws(() => m4ri.ffiM4riMatrixNrows(source), /resource is closed/);

  const invalid = m4ri.ffiM4riByteRegionFromBytes(Buffer.from([0, 2]));
  assert.throws(
    () => m4ri.ffiM4riMatrixFromSagepackBytes(invalid, 1n, 2n),
    /invalid GF\(2\)/,
  );
  close(invalid, m4ri.ffiM4riByteRegionClose);
  assert.throws(
    () => m4ri.ffiM4riMatrixCreate(BigInt(2 ** 31), 1n),
    /dimensions are too large/,
  );
});

test("generated Python wrappers own and deterministically close resources", {
  skip: !m4ri.ffiM4riAvailable(),
}, () => {
  const source = [
    "from sagejs.ffi.m4ri import matrix, matrix_set_entry, matrix_format",
    "value = matrix(2, 3)",
    "matrix_set_entry(value, 0, 2, 1)",
    "region = matrix_format(value)",
    "print(bytes(region.take_bytes()).decode())",
    "print(value.closed)",
    "value.close()",
    "value.close()",
    "print(value.closed)",
    "",
  ].join("\n");
  const run = spawnSync(
    process.execPath,
    [join(repositoryRoot, "bin", "sagejs"), "--python"],
    { cwd: repositoryRoot, encoding: "utf8", input: source },
  );
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.equal(run.stdout.trim(), "True\n[0 0 1]\n[0 0 0]\nFalse\nTrue");
});

test("ordinary typed Python safely borrows and traverses M4RI resources", {
  skip: !m4ri.ffiM4riAvailable(),
}, async () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-m4ri-resource-kernel-"));
  try {
    const compiled = await compile({
      sourcePath: join(root, "test", "resource_kernel.py"),
      cacheRoot: directory,
    });
    const native = require(compiled.addonPath);
    const source = fromRows([[1, 0, 1], [0, 1, 1]]);
    try {
      assert.equal(native.m4ri_matrix_nonzero_count(source), 4n);
    } finally {
      close(source, m4ri.ffiM4riMatrixClose);
    }
    const core = readFileSync(compiled.coreSourcePath, "utf8");
    assert.match(core, /sagejs_m4ri_matrix_(?:nrows|ncols|entry_code)/);
    assert.doesNotMatch(core, /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/);
    const functionIr = compiled.ir.functions.find(
      (candidate) => candidate.name === "m4ri_matrix_nonzero_count",
    );
    assert.ok(functionIr);
    assert.equal(functionIr.foreignDependencies.length, 3);
  } finally {
    removeLoadedNativeCache(directory);
  }
});

test("unclosed generated resources are reclaimed by the V8 finalizer", {
  skip: !m4ri.ffiM4riAvailable() || process.platform === "darwin"
    ? "Darwin allocator RSS retention cannot witness native finalization"
    : false,
}, () => {
  const source = `
const m4ri = require(${JSON.stringify(root)});
(async () => {
  let warmedResidentMiB = 0;
  for (let batch = 0; batch < 10; batch += 1) {
    for (let index = 0; index < 20; index += 1) {
      // Large allocations bypass libc's small-block arenas, so RSS distinguishes
      // native finalization from allocator retention after free.
      m4ri.ffiM4riMatrixCreate(4096n, 4096n);
    }
    global.gc();
    // V8 does not promise to run weak native finalizers inside the synchronous
    // gc() call. Give their queue an event-loop turn before allocating the next
    // wave, otherwise this test measures delayed scheduling rather than leaks.
    await new Promise(setImmediate);
    if (batch === 4) {
      warmedResidentMiB = process.memoryUsage().rss / (1024 * 1024);
    }
  }
  global.gc();
  await new Promise(setImmediate);
  const residentMiB = process.memoryUsage().rss / (1024 * 1024);
  // Compare steady-state growth after five warmup waves instead of imposing
  // an absolute RSS ceiling. An unreclaimed resource still grows by roughly
  // 200 MiB over the remaining five waves.
  const growthMiB = residentMiB - warmedResidentMiB;
  if (growthMiB > 128) {
    throw new Error(
      \`M4RI finalizers grew RSS by \${growthMiB.toFixed(1)} MiB after warmup \` +
      \`(\${warmedResidentMiB.toFixed(1)} -> \${residentMiB.toFixed(1)} MiB)\`,
    );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
  const run = spawnSync(process.execPath, ["--expose-gc", "-e", source], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
});

test("sanitizers exercise façade allocation and destruction", (t) => {
  if (process.platform !== "linux") {
    t.skip("sanitizer compiler probe is Linux-only");
    return;
  }
  const directory = mkdtempSync(join(tmpdir(), "sagejs-m4ri-asan-"));
  const source = join(directory, "lifecycle.c");
  const executable = join(directory, "lifecycle");
  writeFileSync(source, `
#include <stdint.h>
#include "sagejs/m4ri_matrix_ffi.h"
int main(void) {
  for (uint64_t iteration = 0; iteration < 200; ++iteration) {
    sagejs_m4ri_matrix_t a, b, c, r, k, selected;
    const uint64_t repeated_rows[3] = {0, 0, 0};
    if (!sagejs_m4ri_matrix_init(a, iteration % 17, iteration % 71)) return 1;
    if (!a->rank_is_known || a->known_rank != 0) return 2;
    if (!sagejs_m4ri_matrix_init_set(b, a)) return 3;
    if (!sagejs_m4ri_matrix_add(c, a, b)) return 4;
    if (!sagejs_m4ri_matrix_rref(r, c)) return 5;
    if (!r->rank_is_known) return 6;
    if (sagejs_m4ri_matrix_rank(r) != r->known_rank) return 7;
    if (r->value->nrows != 0 && r->value->ncols != 0) {
      const uint64_t old_value = sagejs_m4ri_matrix_entry_code(r, 0, 0);
      if (!sagejs_m4ri_matrix_set_entry(r, 0, 0, old_value ^ 1)) return 8;
      if (r->rank_is_known) return 9;
      (void) sagejs_m4ri_matrix_rank(r);
    }
    if (!sagejs_m4ri_matrix_right_kernel(k, r)) return 10;
    const uint64_t selection_count = a->value->nrows == 0 ? 0 : 3;
    if (!sagejs_m4ri_matrix_select_rows(
            selected, a, repeated_rows, selection_count)) return 11;
    if (selected->value->nrows != (rci_t) selection_count ||
        selected->value->ncols != a->value->ncols) return 12;
    sagejs_m4ri_matrix_clear(selected);
    sagejs_m4ri_matrix_clear(k);
    sagejs_m4ri_matrix_clear(r);
    sagejs_m4ri_matrix_clear(c);
    sagejs_m4ri_matrix_clear(b);
    sagejs_m4ri_matrix_clear(a);
  }
  return 0;
}
`);
  const prefix = join(root, ".native", "prefix");
  const compile = spawnSync("cc", [
    "-std=gnu17", "-O1", "-g", "-fsanitize=address,undefined",
    `-I${join(prefix, "include")}`, source,
    join(prefix, "lib", "libm4ri.a"), "-lm", "-o", executable,
  ], { encoding: "utf8" });
  assert.equal(compile.status, 0, `${compile.stdout}\n${compile.stderr}`);
  const run = spawnSync(executable, [], {
    encoding: "utf8",
    env: { ...process.env, ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1" },
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
});
