#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { compile } = require("@sagemath/sagejs/native");

const root = resolve(__dirname, "..");
const resourceSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "matrix",
  "dense_integer_flint.py",
);
const packedSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "matrix",
  "dense_integer.py",
);

const wordBase = 4294967296n;
const multiplier = 1664525n;
const increment = 1013904223n;

function close(resource, flint) {
  flint.ffiFmpzMatrixClose(resource);
}

function matrixEntries(resource, flint) {
  const rows = Number(flint.ffiFmpzMatrixNrows(resource));
  const columns = Number(flint.ffiFmpzMatrixNcols(resource));
  return Array.from({ length: rows * columns }, (_, index) =>
    flint.ffiFmpzMatrixEntry(
      resource,
      BigInt(Math.floor(index / columns)),
      BigInt(index % columns),
    ));
}

function expectedRange(length, lower, span, initialState) {
  const values = [];
  const limit = wordBase - wordBase % span;
  let state = initialState;
  for (let index = 0; index < length; index += 1) {
    while (state >= limit) {
      state = (multiplier * state + increment) % wordBase;
    }
    values.push(lower + state % span);
    if (index + 1 < length) {
      state = (multiplier * state + increment) % wordBase;
    }
  }
  return { values, state };
}

function expectedDefault(length, initialState) {
  const zeroCutoff = 858993459n;
  const signCutoff = 2147483648n;
  const values = [];
  let state = initialState;
  for (let index = 0; index < length; index += 1) {
    const first = state;
    state = (multiplier * state + increment) % wordBase;
    if (first < zeroCutoff) {
      values.push(0n);
    } else {
      let tail = state;
      state = (multiplier * state + increment) % wordBase;
      while (tail === 0n) {
        tail = state;
        state = (multiplier * state + increment) % wordBase;
      }
      const magnitude = wordBase / tail;
      values.push(state >= signCutoff ? -magnitude : magnitude);
      state = (multiplier * state + increment) % wordBase;
    }
  }
  return { values, state };
}

function runSage(source, environment) {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...environment },
      input: source,
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function median(values) {
  return [...values].sort((left, right) => left - right)[
    Math.floor(values.length / 2)
  ];
}

function timeMilliseconds(fn, warmup = 1, samples = 7) {
  for (let index = 0; index < warmup; index += 1) fn();
  const values = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const start = process.hrtime.bigint();
    fn();
    values.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  return median(values);
}

const fallbackWitness = String.raw`
from sagejs.ffi.flint import (
    fmpz_matrix,
    fmpz_matrix_entry,
    fmpz_matrix_ncols,
    fmpz_matrix_nrows,
)
from sagejs.kernels.matrix.dense_integer_flint import (
    flint_dense_integer_resource_import,
    flint_dense_integer_resource_nonzero_count,
    flint_dense_integer_resource_random_fill,
    flint_dense_integer_resource_random_fill_default,
)
from sagejs.native import kernel_integer_buffer

word_base = 4294967296
multiplier = 1664525
increment = 1013904223

def entries(matrix):
    rows = fmpz_matrix_nrows(matrix)
    columns = fmpz_matrix_ncols(matrix)
    return [
        fmpz_matrix_entry(matrix, index // columns, index % columns)
        for index in range(rows * columns)
    ]

imported = fmpz_matrix(2, 3)
import_source = kernel_integer_buffer(
    flint_dense_integer_resource_import,
    [2**220, -7, 0, 11, -(2**190), 5],
)
assert flint_dense_integer_resource_import(imported, import_source, 2, 3)
assert entries(imported) == [2**220, -7, 0, 11, -(2**190), 5]
imported.close()

matrix = fmpz_matrix(2, 3)
valid, state = flint_dense_integer_resource_random_fill(
    matrix, -(2**190), 17, 123, word_base, multiplier, increment
)
assert valid and state == 1543727538
assert entries(matrix) == [
    -(2**190) + value for value in [4, 14, 10, 4, 6, 4]
]
assert flint_dense_integer_resource_nonzero_count(matrix) == 6
matrix.close()

default = fmpz_matrix(3, 5)
valid, state = flint_dense_integer_resource_random_fill_default(
    default,
    1729,
    word_base,
    858993459,
    2147483648,
    multiplier,
    increment,
)
assert valid
assert entries(default) == [0, -9, 1, 1, -3, -1, -1, 1, 4, 6, 1, -4, 19, 2, 1]
assert state == 503141958
default.close()

empty = fmpz_matrix(0, 100000)
assert flint_dense_integer_resource_random_fill(
    empty, 0, 5, 99, word_base, multiplier, increment
) == (True, 99)
assert flint_dense_integer_resource_nonzero_count(empty) == 0
empty.close()

skew = fmpz_matrix(1, 4096)
valid, state = flint_dense_integer_resource_random_fill(
    skew, -11, 23, 271828, word_base, multiplier, increment
)
assert valid and state < word_base
assert len(entries(skew)) == 4096
skew.close()

sentinel = fmpz_matrix(1, 1)
assert flint_dense_integer_resource_random_fill(
    sentinel, 0, 0, 17, word_base, multiplier, increment
) == (False, 17)
assert flint_dense_integer_resource_random_fill(
    sentinel, 0, word_base + 1, 17, word_base, multiplier, increment
) == (False, 17)
assert flint_dense_integer_resource_random_fill(
    sentinel, 0, 5, word_base, word_base, multiplier, increment
) == (False, word_base)
assert flint_dense_integer_resource_random_fill_default(
    sentinel, 17, word_base, word_base + 1, 0, multiplier, increment
) == (False, 17)
assert fmpz_matrix_entry(sentinel, 0, 0) == 0
sentinel.close()
print("fmpz-resource-kernel-equivalence-ok")
`;

(async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-resource-kernel-"));
  try {
    const compiled = await compile({
      sourcePath: resourceSource,
      cacheRoot: temporary,
    });
    const packedCompiled = await compile({
      sourcePath: packedSource,
      cacheRoot: temporary,
    });
    const native = require(compiled.addonPath);
    const publicKernel = require(compiled.modulePath);
    const packed = require(packedCompiled.modulePath);
    const flint = require(join(root, "packages", "flint"));

    for (const name of [
      "flint_dense_integer_resource_import",
      "flint_dense_integer_resource_random_fill",
      "flint_dense_integer_resource_random_fill_default",
      "flint_dense_integer_resource_nonzero_count",
    ]) {
      assert.equal(publicKernel[name].nativeAvailable, true);
      const fn = compiled.ir.functions.find((candidate) => candidate.name === name);
      assert.ok(fn, `missing ${name}`);
      assert.ok(fn.foreignDependencies.length >= 3);
      assert.ok(fn.foreignDependencies.every((dependency) =>
        dependency.includes(":fmpz_matrix_")));
    }
    const core = readFileSync(compiled.coreSourcePath, "utf8");
    assert.match(core, /sagejs_fmpz_matrix_set_entry/);
    assert.match(core, /sagejs_fmpz_matrix_entry/);
    assert.doesNotMatch(core, /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/);

    const range = flint.ffiFmpzMatrixCreate(3n, 5n);
    try {
      const expected = expectedRange(15, -(1n << 190n), 17n, 123n);
      assert.deepEqual(
        native.flint_dense_integer_resource_random_fill(
          range,
          -(1n << 190n),
          17n,
          123n,
          wordBase,
          multiplier,
          increment,
        ),
        [true, expected.state],
      );
      assert.deepEqual(matrixEntries(range, flint), expected.values);
      assert.equal(
        native.flint_dense_integer_resource_nonzero_count(range),
        15n,
      );
    } finally {
      close(range, flint);
    }

    const imported = flint.ffiFmpzMatrixCreate(2n, 3n);
    try {
      const values = [1n << 220n, -7n, 0n, 11n, -(1n << 190n), 5n];
      const source = publicKernel.flint_dense_integer_resource_import
        .packIntegerBuffer(values);
      assert.equal(
        native.flint_dense_integer_resource_import(
          imported,
          source,
          2n,
          3n,
        ),
        true,
      );
      assert.deepEqual(matrixEntries(imported, flint), values);
      assert.equal(
        native.flint_dense_integer_resource_import(
          imported,
          source,
          3n,
          2n,
        ),
        false,
      );
      assert.deepEqual(matrixEntries(imported, flint), values);
    } finally {
      close(imported, flint);
    }

    const defaultMatrix = flint.ffiFmpzMatrixCreate(3n, 5n);
    try {
      const expected = expectedDefault(15, 1729n);
      assert.deepEqual(
        native.flint_dense_integer_resource_random_fill_default(
          defaultMatrix,
          1729n,
          wordBase,
          858993459n,
          2147483648n,
          multiplier,
          increment,
        ),
        [true, expected.state],
      );
      assert.deepEqual(matrixEntries(defaultMatrix, flint), expected.values);
    } finally {
      close(defaultMatrix, flint);
    }

    for (const [rows, columns] of [[0n, 100000n], [100000n, 0n]]) {
      const empty = flint.ffiFmpzMatrixCreate(rows, columns);
      try {
        assert.deepEqual(
          native.flint_dense_integer_resource_random_fill(
            empty,
            0n,
            5n,
            99n,
            wordBase,
            multiplier,
            increment,
          ),
          [true, 99n],
        );
        assert.equal(
          native.flint_dense_integer_resource_nonzero_count(empty),
          0n,
        );
      } finally {
        close(empty, flint);
      }
    }

    const invalid = flint.ffiFmpzMatrixCreate(1n, 1n);
    try {
      assert.equal(flint.ffiFmpzMatrixSetEntry(invalid, 0n, 0n, 73n), true);
      for (const [span, state, base] of [
        [0n, 17n, wordBase],
        [wordBase + 1n, 17n, wordBase],
        [5n, wordBase, wordBase],
        [5n, 17n, 0n],
      ]) {
        assert.deepEqual(
          native.flint_dense_integer_resource_random_fill(
            invalid,
            0n,
            span,
            state,
            base,
            multiplier,
            increment,
          ),
          [false, state],
        );
        assert.equal(flint.ffiFmpzMatrixEntry(invalid, 0n, 0n), 73n);
      }
    } finally {
      close(invalid, flint);
    }

    const required = runSage(fallbackWitness, {
      SAGEJS_NATIVE_CACHE_DIR: temporary,
      SAGEJS_NATIVE_REQUIRED: "1",
    });
    const fallback = runSage(fallbackWitness, {
      SAGEJS_NATIVE_CACHE_DIR: temporary,
      SAGEJS_NATIVE_AUTOLOAD: "0",
    });
    assert.equal(required, "fmpz-resource-kernel-equivalence-ok");
    assert.equal(fallback, required);

    const rows = 300;
    const columns = 300;
    const length = rows * columns;
    const lower = -17n;
    const span = 101n;
    const initial = 3141592653n;
    const resource = flint.ffiFmpzMatrixCreate(BigInt(rows), BigInt(columns));
    const host = flint.ffiFmpzMatrixCreate(BigInt(rows), BigInt(columns));
    const benchmarkImported = flint.ffiFmpzMatrixCreate(
      BigInt(rows),
      BigInt(columns),
    );
    const hostImported = flint.ffiFmpzMatrixCreate(
      BigInt(rows),
      BigInt(columns),
    );
    const packedOutput = packed.createIntegerBuffer(length, 1);
    const importValues = Array.from(
      { length },
      (_, index) => BigInt(index % 211 - 105),
    );
    const importSource = publicKernel.flint_dense_integer_resource_import
      .packIntegerBuffer(importValues);
    try {
      const nativeResourceMs = timeMilliseconds(() =>
        native.flint_dense_integer_resource_random_fill(
          resource,
          lower,
          span,
          initial,
          wordBase,
          multiplier,
          increment,
        ));
      const packedMs = timeMilliseconds(() =>
        packed.dense_integer_matrix_random_fill(
          packedOutput,
          lower,
          span,
          initial,
          wordBase,
          multiplier,
          increment,
        ));
      const hostPerEntryMs = timeMilliseconds(() => {
        let state = initial;
        const limit = wordBase - wordBase % span;
        for (let index = 0; index < length; index += 1) {
          while (state >= limit) {
            state = (multiplier * state + increment) % wordBase;
          }
          flint.ffiFmpzMatrixSetEntry(
            host,
            BigInt(Math.floor(index / columns)),
            BigInt(index % columns),
            lower + state % span,
          );
          if (index + 1 < length) {
            state = (multiplier * state + increment) % wordBase;
          }
        }
        return state;
      }, 0, 5);
      const nativeImportMs = timeMilliseconds(() =>
        native.flint_dense_integer_resource_import(
          benchmarkImported,
          importSource,
          BigInt(rows),
          BigInt(columns),
        ));
      const hostImportMs = timeMilliseconds(() => {
        for (let index = 0; index < length; index += 1) {
          flint.ffiFmpzMatrixSetEntry(
            hostImported,
            BigInt(Math.floor(index / columns)),
            BigInt(index % columns),
            importValues[index],
          );
        }
      }, 0, 5);

      assert.ok(
        nativeResourceMs < hostPerEntryMs * 0.5,
        `native resource ${nativeResourceMs}ms vs host ${hostPerEntryMs}ms`,
      );
      assert.ok(
        nativeResourceMs < Math.max(30, packedMs * 12),
        `native resource ${nativeResourceMs}ms vs packed ${packedMs}ms`,
      );
      assert.ok(
        nativeImportMs < hostImportMs * 0.5,
        `native import ${nativeImportMs}ms vs host ${hostImportMs}ms`,
      );
      console.log(JSON.stringify({
        schema: "sagejs.benchmark/fmpz-resource-kernel-v1",
        workload: {
          operation: "deterministic exact range fill",
          rows,
          columns,
          samples: 7,
        },
        nativeResourceMs,
        packedIntegerBufferMs: packedMs,
        hostPerEntryMs,
        nativeImportMs,
        hostImportMs,
      }));
    } finally {
      close(hostImported, flint);
      close(benchmarkImported, flint);
      close(host, flint);
      close(resource, flint);
    }

    console.log("fmpz matrix resource kernel tests passed");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
