#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { compile } = require("@sagemath/sagejs/native");
const { sanitizerEnvironment } = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const packagePath = join(root, "packages", "flint");
const flintPrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(packagePath, ".native", "prefix"),
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    input: options.input,
    timeout: options.timeout || 180_000,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`,
  );
  return result.stdout.trim();
}

function javascriptSources(directory) {
  const answer = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) answer.push(...javascriptSources(filename));
    else if (entry.isFile() && entry.name.endsWith(".cjs")) answer.push(filename);
  }
  return answer;
}

test("sanitizer lifecycle witnesses use the platform capability helper", () => {
  const optionName = `ASAN_${"OPTIONS"}`;
  const unsupportedRequest = `detect_${"leaks"}=1`;
  const unguardedRequest = new RegExp(
    `${optionName}\\s*:\\s*["'\\x60][^"'\\x60]*${unsupportedRequest}`,
  );
  const offenders = [];
  const packageTestDirectories = readdirSync(join(root, "packages"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, "packages", entry.name, "test"))
    .filter((directory) => existsSync(directory));
  for (const directory of [
    join(root, "test"),
    join(root, "tools", "ffi"),
    ...packageTestDirectories,
  ]) {
    for (const filename of javascriptSources(directory)) {
      const source = readFileSync(filename, "utf8");
      const match = unguardedRequest.exec(source);
      if (match !== null) {
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(`${filename}:${line}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
  const environment = sanitizerEnvironment({ strictStringChecks: true });
  assert.match(environment.ASAN_OPTIONS, /halt_on_error=1/);
  assert.match(environment.ASAN_OPTIONS, /strict_string_checks=1/);
  assert.match(environment.UBSAN_OPTIONS, /halt_on_error=1/);
  assert.match(
    environment.ASAN_OPTIONS,
    new RegExp(`detect_leaks=${process.platform === "darwin" ? 0 : 1}`),
  );
});

function decodePivots(bytes) {
  const buffer = Buffer.from(bytes);
  assert.equal(buffer.length % 8, 0);
  return Array.from(
    { length: buffer.length / 8 },
    (_, index) => buffer.readBigUInt64LE(8 * index),
  );
}

function exactMatrix(flint, kind, rows, columns, entries) {
  const result = flint[`ffi${kind}MatrixCreate`](BigInt(rows), BigInt(columns));
  try {
    for (let index = 0; index < entries.length; index += 1) {
      const row = BigInt(Math.floor(index / columns));
      const column = BigInt(index % columns);
      const entry = entries[index];
      const args = kind === "Fmpz"
        ? [result, row, column, BigInt(entry)]
        : [result, row, column, BigInt(entry[0]), BigInt(entry[1])];
      assert.equal(flint[`ffi${kind}MatrixSetEntry`](...args), true);
    }
    return result;
  } catch (error) {
    flint[`ffi${kind}MatrixClose`](result);
    throw error;
  }
}

test("generated exact-resource queries return exact-size pivot regions", () => {
  const flint = require(packagePath);
  const manifest = require(join(packagePath, "build/generated-ffi/manifest.json"));
  const addon = require(join(
    packagePath,
    "build/generated-ffi",
    manifest.addon,
  ));
  const accounted = addon.__sagejsFfiResourceExternalMemory;
  assert.equal(typeof flint.ffiFmpzMatrixEchelonPivots, "function");
  assert.equal(typeof flint.ffiFmpqMatrixEchelonPivots, "function");

  const huge = (1n << 521n) + 17n;
  const integer = exactMatrix(flint, "Fmpz", 4, 6, [
    0n, huge, -3n, 0n, 0n, 0n,
    0n, 0n, 0n, -7n, 2n, 0n,
    0n, 0n, 0n, 0n, 0n, 11n,
    0n, 0n, 0n, 0n, 0n, 0n,
  ]);
  const rational = exactMatrix(flint, "Fmpq", 4, 6, [
    [0n, 1n], [huge, 37n], [-3n, 5n], [0n, 1n], [0n, 1n], [0n, 1n],
    [0n, 1n], [0n, 1n], [0n, 1n], [-7n, 13n], [2n, 3n], [0n, 1n],
    [0n, 1n], [0n, 1n], [0n, 1n], [0n, 1n], [0n, 1n], [11n, 17n],
    [0n, 1n], [0n, 1n], [0n, 1n], [0n, 1n], [0n, 1n], [0n, 1n],
  ]);
  try {
    for (const [kind, matrix] of [
      ["Fmpz", integer],
      ["Fmpq", rational],
    ]) {
      const region = flint[`ffi${kind}MatrixEchelonPivots`](matrix);
      assert.equal(flint.ffiFlintByteRegionLength(region), 24n);
      assert.ok(accounted(region) >= 24n);
      assert.deepEqual(
        decodePivots(flint.ffiFlintByteRegionCopyBytes(region)),
        [1n, 3n, 5n],
      );
      flint.ffiFlintByteRegionClose(region);
      assert.equal(accounted(region), 0n);
      flint.ffiFlintByteRegionClose(region);
      assert.throws(
        () => flint.ffiFlintByteRegionCopyBytes(region),
        /closed|live/i,
      );
    }
  } finally {
    flint.ffiFmpqMatrixClose(rational);
    flint.ffiFmpzMatrixClose(integer);
  }
  assert.throws(
    () => flint.ffiFmpzMatrixEchelonPivots(integer),
    /closed|live/i,
  );

  for (const [kind, rows, columns] of [
    ["Fmpz", 0, 4],
    ["Fmpz", 3, 0],
    ["Fmpq", 0, 4],
    ["Fmpq", 3, 0],
  ]) {
    const matrix = exactMatrix(flint, kind, rows, columns, []);
    try {
      const region = flint[`ffi${kind}MatrixEchelonPivots`](matrix);
      try {
        assert.equal(flint.ffiFlintByteRegionLength(region), 0n);
        assert.deepEqual(decodePivots(
          flint.ffiFlintByteRegionCopyBytes(region),
        ), []);
      } finally {
        flint.ffiFlintByteRegionClose(region);
      }
    } finally {
      flint[`ffi${kind}MatrixClose`](matrix);
    }
  }

  for (const [kind, rows, columns, entries, expected] of [
    ["Fmpz", 3, 4, Array(12).fill(0n), []],
    ["Fmpq", 3, 4, Array.from({ length: 12 }, () => [0n, 1n]), []],
    ["Fmpz", 3, 3, [1n, 0n, 0n, 0n, 2n, 0n, 0n, 0n, 3n], [0n, 1n, 2n]],
    ["Fmpq", 3, 3, [
      [1n, 2n], [0n, 1n], [0n, 1n],
      [0n, 1n], [2n, 3n], [0n, 1n],
      [0n, 1n], [0n, 1n], [3n, 5n],
    ], [0n, 1n, 2n]],
  ]) {
    const matrix = exactMatrix(flint, kind, rows, columns, entries);
    try {
      const region = flint[`ffi${kind}MatrixEchelonPivots`](matrix);
      try {
        assert.equal(
          flint.ffiFlintByteRegionLength(region),
          BigInt(expected.length * 8),
        );
        assert.deepEqual(
          decodePivots(flint.ffiFlintByteRegionCopyBytes(region)),
          expected,
        );
      } finally {
        flint.ffiFlintByteRegionClose(region);
      }
    } finally {
      flint[`ffi${kind}MatrixClose`](matrix);
    }
  }
});

const nativeWitness = String.raw`
from sagejs.ffi.flint import (
    FlintByteRegion,
    FmpqMatrix,
    FmpzMatrix,
    fmpq_matrix_echelon_pivots,
    fmpz_matrix_echelon_pivots,
)
from sagejs.native import native


@native
def integer_pivots(matrix: FmpzMatrix) -> FlintByteRegion:
    return fmpz_matrix_echelon_pivots(matrix)


@native
def rational_pivots(matrix: FmpqMatrix) -> FlintByteRegion:
    return fmpq_matrix_echelon_pivots(matrix)
`;

function sageWitness(expectNative) {
  return String.raw`
from pivot_witness import integer_pivots, rational_pivots
from sagejs.ffi.flint import (
    fmpq_matrix,
    fmpq_matrix_set_entry,
    fmpz_matrix,
    fmpz_matrix_set_entry,
)


def decode(region):
    data = region.take_bytes()
    result = []
    for offset in range(0, len(data), 8):
        value = 0
        for byte in range(8):
            value += data[offset + byte] * (256 ** byte)
        result.append(value)
    return result


assert integer_pivots.nativeAvailable is ${expectNative ? "True" : "False"}
assert rational_pivots.nativeAvailable is ${expectNative ? "True" : "False"}
z = fmpz_matrix(3, 5)
q = fmpq_matrix(3, 5)
for matrix, setter, rational in [(z, fmpz_matrix_set_entry, False), (q, fmpq_matrix_set_entry, True)]:
    for row, column, value in [(0, 1, 2**521 + 17), (1, 3, -7)]:
        if rational:
            assert setter(matrix, row, column, value, 37)
        else:
            assert setter(matrix, row, column, value)
assert decode(integer_pivots(z)) == [1, 3]
assert decode(rational_pivots(q)) == [1, 3]
q.close()
z.close()
print("exact-matrix-pivot-kernel-ok")
`;
}

test("native and disabled-native paths use the same declared pivot calls", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-exact-matrix-pivots-"));
  try {
    const physicalDirectory = join(temporary, "physical-source");
    const aliasDirectory = join(temporary, "source-alias");
    mkdirSync(physicalDirectory);
    symlinkSync(
      physicalDirectory,
      aliasDirectory,
      process.platform === "win32" ? "junction" : "dir",
    );
    const witnessPath = join(aliasDirectory, "pivot_witness.py");
    writeFileSync(witnessPath, nativeWitness);
    const compiled = await compile({ sourcePath: witnessPath });
    const physicalWitnessPath = realpathSync(witnessPath);
    const manifest = JSON.parse(readFileSync(
      join(compiled.outputPath, "manifest.json"),
      "utf8",
    ));
    const discovery = JSON.parse(readFileSync(
      join(compiled.outputPath, "..", "index.json"),
      "utf8",
    ));
    assert.equal(
      manifest.sourceIdentity,
      resolve(physicalWitnessPath).replaceAll("\\", "/"),
    );
    assert.ok(discovery.sources[physicalWitnessPath]);
    assert.equal(discovery.sources[resolve(witnessPath)], undefined);
    const core = readFileSync(compiled.coreSourcePath, "utf8");
    assert.match(core, /sagejs_fmpz_matrix_echelon_pivots/);
    assert.match(core, /sagejs_fmpq_matrix_echelon_pivots/);
    assert.doesNotMatch(core, /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/);
    for (const name of ["integer_pivots", "rational_pivots"]) {
      const fn = compiled.ir.functions.find((candidate) => candidate.name === name);
      assert.ok(fn, `missing ${name}`);
      assert.equal(fn.foreignDependencies.length, 1);
      assert.match(fn.foreignDependencies[0], /_matrix_echelon_pivots$/);
    }

    const sagejs = join(root, "bin", "sagejs");
    const boundaryEnvironment = {
      SAGEJS_FORBID_ZZ_MATRIX_NAPI: "1",
      SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
    };
    assert.equal(
      run(process.execPath, [sagejs, "--python"], {
        cwd: aliasDirectory,
        env: { ...boundaryEnvironment, SAGEJS_NATIVE_REQUIRED: "1" },
        input: sageWitness(true),
      }),
      "exact-matrix-pivot-kernel-ok",
    );
    assert.equal(
      run(process.execPath, [sagejs, "--python"], {
        cwd: aliasDirectory,
        env: { ...boundaryEnvironment, SAGEJS_NATIVE_DISABLE: "1" },
        input: sageWitness(false),
      }),
      "exact-matrix-pivot-kernel-ok",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

const lifecycleSource = String.raw`
#include <stdint.h>
#include <stdio.h>
#include <sagejs/fmpz_matrix_ffi.h>

static uint64_t read_u64(const unsigned char *data)
{
    uint64_t value = 0;
    for (size_t byte = 0; byte < 8; byte++)
        value |= (uint64_t) data[byte] << (8 * byte);
    return value;
}

static int check_region(const sagejs_flint_byte_region_t region)
{
    return region->length == 24 &&
        read_u64(region->data) == 1 &&
        read_u64(region->data + 8) == 3 &&
        read_u64(region->data + 16) == 5;
}

int main(void)
{
    fmpz_t numerator, denominator;
    fmpz_init(numerator);
    fmpz_init(denominator);
    fmpz_one(denominator);
    for (slong round = 0; round < 500; round++)
    {
        sagejs_fmpz_matrix_t z;
        sagejs_fmpq_matrix_t q;
        sagejs_flint_byte_region_t zpivots, qpivots;
        if (!sagejs_fmpz_matrix_init(z, 4, 6) ||
            !sagejs_fmpq_matrix_init(q, 4, 6))
            return 1;
        for (uint64_t row = 0; row < 3; row++)
        {
            const uint64_t column = 2 * row + 1;
            fmpz_set_si(numerator, round + row + 1);
            if (!sagejs_fmpz_matrix_set_entry(z, row, column, numerator) ||
                !sagejs_fmpq_matrix_set_entry(
                    q, row, column, numerator, denominator))
                return 2;
        }
        if (!sagejs_fmpz_matrix_echelon_pivots(zpivots, z) ||
            !sagejs_fmpq_matrix_echelon_pivots(qpivots, q) ||
            !check_region(zpivots) || !check_region(qpivots))
            return 3;
        sagejs_flint_byte_region_clear(qpivots);
        sagejs_flint_byte_region_clear(zpivots);
        sagejs_fmpq_matrix_clear(q);
        sagejs_fmpz_matrix_clear(z);
    }

    sagejs_fmpz_matrix_t empty_z;
    sagejs_fmpq_matrix_t empty_q;
    sagejs_flint_byte_region_t empty_zpivots, empty_qpivots;
    if (!sagejs_fmpz_matrix_init(empty_z, 0, 7) ||
        !sagejs_fmpq_matrix_init(empty_q, 7, 0) ||
        !sagejs_fmpz_matrix_echelon_pivots(empty_zpivots, empty_z) ||
        !sagejs_fmpq_matrix_echelon_pivots(empty_qpivots, empty_q) ||
        empty_zpivots->length != 0 || empty_qpivots->length != 0)
        return 4;
    sagejs_flint_byte_region_clear(empty_qpivots);
    sagejs_flint_byte_region_clear(empty_zpivots);
    sagejs_fmpq_matrix_clear(empty_q);
    sagejs_fmpz_matrix_clear(empty_z);
    fmpz_clear(denominator);
    fmpz_clear(numerator);
    printf("rounds=500\n");
    return 0;
}
`;

test("exact pivot resources pass sanitizer-backed lifecycle stress", {
  skip: process.platform === "win32" ? "sanitizer harness is Unix-only" : false,
}, () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-exact-pivot-lifecycle-"));
  try {
    const sourcePath = join(temporary, "lifecycle.c");
    const executable = join(temporary, "lifecycle");
    writeFileSync(sourcePath, lifecycleSource);
    const compiler = process.env.CC || "cc";
    run(compiler, [
      "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer",
      "-fsanitize=address,undefined",
      `-I${join(packagePath, "include")}`,
      `-I${join(flintPrefix, "include")}`,
      sourcePath,
      `-L${join(flintPrefix, "lib")}`,
      "-lflint", "-lopenblas", "-lmpfr", "-lgmp", "-lm", "-lpthread",
      "-o", executable,
    ]);
    assert.equal(
      run(executable, [], {
        env: sanitizerEnvironment({ strictStringChecks: true }),
      }),
      "rounds=500",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
