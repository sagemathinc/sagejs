#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync, readFileSync, rmSync, writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  sanitizerEnvironment,
  sanitizerRounds,
} = require("./helpers/sanitizers.cjs");

const root = resolve(__dirname, "..");
const flintPrefix = resolve(
  process.env.SAGEJS_FLINT_PREFIX ||
    join(root, "packages", "flint", ".native", "prefix"),
);
const flint = require(join(root, "packages", "flint"));
const generatedDirectory = join(
  root, "packages", "flint", "build", "generated-ffi",
);
const manifest = require(join(generatedDirectory, "manifest.json"));
const generated = require(join(generatedDirectory, manifest.addon));
const accounted = generated.__sagejsFfiResourceExternalMemory;

const generatedHost = readFileSync(
  join(root, "packages", "flint", "generated", "ffi_host.py"), "utf8",
);
function generatedFunction(name) {
  const start = generatedHost.indexOf(`def ${name}(`);
  assert.notEqual(start, -1, `missing generated ${name}`);
  const stop = generatedHost.indexOf("\n\n@native", start);
  return generatedHost.slice(start, stop === -1 ? undefined : stop);
}
for (const [name, call] of [
  ["ffiFmpqMatrixCharpoly", "_ffi_fmpq_matrix_charpoly"],
  ["ffiFmpqMatrixMinpoly", "_ffi_fmpq_matrix_minpoly"],
]) {
  const source = generatedFunction(name);
  assert.match(source, new RegExp(`return ${call}\\(`));
  assert.doesNotMatch(source, /napi_|ffi_call|runtime\./);
}

function closeTwice(resource, close) {
  close(resource);
  assert.equal(accounted(resource), 0n);
  close(resource);
  assert.equal(accounted(resource), 0n);
}

function rationalMatrix(rows, columns, entries) {
  const result = flint.ffiFmpqMatrixCreate(BigInt(rows), BigInt(columns));
  try {
    for (let index = 0; index < entries.length; index += 1) {
      const [numerator, denominator] = entries[index];
      assert.equal(flint.ffiFmpqMatrixSetEntry(
        result,
        BigInt(Math.floor(index / columns)),
        BigInt(index % columns),
        BigInt(numerator),
        BigInt(denominator),
      ), true);
    }
    return result;
  } catch (error) {
    flint.ffiFmpqMatrixClose(result);
    throw error;
  }
}

function coefficients(polynomial) {
  const length = Number(flint.ffiFmpqPolynomialLength(polynomial));
  return Array.from({ length }, (_, index) => [
    flint.ffiFmpqPolynomialCoefficientNumerator(
      polynomial, BigInt(index),
    ),
    flint.ffiFmpqPolynomialCoefficientDenominator(
      polynomial, BigInt(index),
    ),
  ]);
}

{
  const source = rationalMatrix(3, 3, [
    [1n, 2n], [0n, 1n], [0n, 1n],
    [0n, 1n], [1n, 2n], [0n, 1n],
    [0n, 1n], [0n, 1n], [2n, 3n],
  ]);
  const characteristic = flint.ffiFmpqMatrixCharpoly(source);
  const minimal = flint.ffiFmpqMatrixMinpoly(source);
  assert.deepEqual(coefficients(characteristic), [
    [-1n, 6n], [11n, 12n], [-5n, 3n], [1n, 1n],
  ]);
  assert.deepEqual(coefficients(minimal), [
    [1n, 3n], [-7n, 6n], [1n, 1n],
  ]);
  assert.ok(accounted(characteristic) > 0n);
  assert.ok(accounted(minimal) > 0n);
  closeTwice(characteristic, flint.ffiFmpqPolynomialClose);
  closeTwice(minimal, flint.ffiFmpqPolynomialClose);
  flint.ffiFmpqMatrixClose(source);
  assert.throws(
    () => flint.ffiFmpqMatrixCharpoly(source),
    /closed/i,
  );
  assert.throws(
    () => flint.ffiFmpqMatrixMinpoly(source),
    /closed/i,
  );
}

{
  const empty = flint.ffiFmpqMatrixCreate(0n, 0n);
  const characteristic = flint.ffiFmpqMatrixCharpoly(empty);
  const minimal = flint.ffiFmpqMatrixMinpoly(empty);
  assert.deepEqual(coefficients(characteristic), [[1n, 1n]]);
  assert.deepEqual(coefficients(minimal), [[1n, 1n]]);
  assert.throws(
    () => flint.ffiFmpqMatrixCharpoly(characteristic),
    /declared .* resource/i,
  );
  flint.ffiFmpqPolynomialClose(minimal);
  flint.ffiFmpqPolynomialClose(characteristic);
  flint.ffiFmpqMatrixClose(empty);

  const nonsquare = flint.ffiFmpqMatrixCreate(2n, 3n);
  assert.throws(
    () => flint.ffiFmpqMatrixCharpoly(nonsquare),
    /square rational matrix/,
  );
  assert.throws(
    () => flint.ffiFmpqMatrixMinpoly(nonsquare),
    /square rational matrix/,
  );
  flint.ffiFmpqMatrixClose(nonsquare);
}

// Repeated construction, publication, and deterministic close exercises the
// generated owner's success and cleanup paths without an output-size guess.
for (let round = 0; round < 200; round += 1) {
  const source = rationalMatrix(4, 4, Array.from(
    { length: 16 },
    (_, index) => [
      BigInt((round + 3 * index) % 17 - 8),
      BigInt(index % 7 + 1),
    ],
  ));
  const characteristic = flint.ffiFmpqMatrixCharpoly(source);
  const minimal = flint.ffiFmpqMatrixMinpoly(source);
  flint.ffiFmpqPolynomialClose(minimal);
  flint.ffiFmpqPolynomialClose(characteristic);
  flint.ffiFmpqMatrixClose(source);
}

function runSage(source, environment = {}, flags = []) {
  const result = spawnSync(
    process.execPath,
    [...flags, join(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      input: source,
      encoding: "utf8",
      env: { ...process.env, ...environment },
      timeout: 120_000,
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result;
}

const publicSource = String.raw`
import sagejs.ffi.flint as flint
import sagejs.runtime as runtime

MatrixClass = type(matrix(QQ, 0, 0))
def forbidden(*args):
    raise AssertionError('packed or generic matrix-polynomial path was used')
MatrixClass._materialize_rational_compatibility_buffers = forbidden
MatrixClass.list = forbidden
MatrixClass.right_kernel = forbidden
MatrixClass.__mul__ = forbidden
flint.fmpq_polynomial_coefficient_numerator = forbidden
flint.fmpq_polynomial_coefficient_denominator = forbidden

charpoly_calls = 0
minpoly_calls = 0
original_charpoly = flint.fmpq_matrix_charpoly
original_minpoly = flint.fmpq_matrix_minpoly
def counted_charpoly(source):
    global charpoly_calls
    charpoly_calls += 1
    return original_charpoly(source)
def counted_minpoly(source):
    global minpoly_calls
    minpoly_calls += 1
    return original_minpoly(source)
flint.fmpq_matrix_charpoly = counted_charpoly
flint.fmpq_matrix_minpoly = counted_minpoly

huge = 2**65537 + 17
A = matrix(QQ, 3, 3, [
    QQ(huge, 97), 1, 0,
    0, QQ(huge, 97), 0,
    0, 0, QQ(2, 3),
])
R = PolynomialRing(QQ, 't'); t = R.gen()
expected_charpoly = (t - QQ(huge, 97))**2 * (t - QQ(2, 3))
# The nonzero superdiagonal makes the repeated eigenvalue a size-two Jordan
# block, so its factor occurs twice in the minimal polynomial as well.
expected_minpoly = (t - QQ(huge, 97))**2 * (t - QQ(2, 3))
characteristic = A.characteristic_polynomial('t')
minimal = A.minimal_polynomial('t')
assert characteristic == expected_charpoly
assert minimal == expected_minpoly
assert characteristic.parent().base_ring() is QQ
assert minimal.parent().base_ring() is QQ
assert characteristic._has_fmpq_polynomial_resource()
assert minimal._has_fmpq_polynomial_resource()
assert charpoly_calls == 1 and minpoly_calls == 1
assert A.charpoly('t') is characteristic
assert A.minpoly('t') is minimal
assert charpoly_calls == 1 and minpoly_calls == 1
storage = A._rational_storage_cache
assert runtime.reflect.get(storage, 'numerators') is runtime.undefined
assert runtime.reflect.get(storage, 'denominators') is runtime.undefined

# Integral coefficients do not change the declared QQ coefficient domain.
D = diagonal_matrix(QQ, [1, 1, 2, 2])
integral_minimal = D.minpoly('z')
assert integral_minimal.parent().base_ring() is QQ
assert integral_minimal == PolynomialRing(QQ, 'z')([-2, 3, -1]) * -1
assert integral_minimal.degree() == 2

scalar = scalar_matrix(QQ, 25, QQ(7, 11))
assert scalar.minpoly().degree() == 1
assert scalar.charpoly().degree() == 25
assert zero_matrix(QQ, 0, 0).charpoly() == PolynomialRing(QQ, 'x')(1)
assert zero_matrix(QQ, 0, 0).minpoly() == PolynomialRing(QQ, 'x')(1)

for nonsquare in [zero_matrix(QQ, 0, 3), matrix(QQ, 2, 3, range(6))]:
    for operation in [nonsquare.charpoly, nonsquare.minpoly]:
        try:
            operation()
        except ArithmeticError:
            pass
        else:
            raise AssertionError('nonsquare matrix polynomial was accepted')

print('exact-rational-matrix-polynomials-ok')
`;

for (const environment of [
  {
    SAGEJS_NATIVE_TRACE: "1",
    SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
    SAGEJS_FORBID_POLYNOMIAL_NAPI: "1",
  },
  {
    SAGEJS_NATIVE_DISABLE: "1",
    SAGEJS_NATIVE_TRACE: "1",
    SAGEJS_FORBID_QQ_MATRIX_NAPI: "1",
    SAGEJS_FORBID_POLYNOMIAL_NAPI: "1",
  },
]) {
  const result = runSage(publicSource, environment);
  assert.match(result.stdout, /exact-rational-matrix-polynomials-ok/);
  assert.match(
    result.stdout,
    /Matrix\.(?:charpoly|minpoly).*generated-flint-resource/,
  );
  assert.doesNotMatch(result.stderr, /forbidden legacy mathematical N-API/);
}

// Let V8 finalize unreachable matrix and polynomial owners. This complements
// deterministic close above and catches ownership cycles in the public path.
const finalizer = runSage(String.raw`
for index in range(80):
    value = random_matrix(QQ, 35)
    value.charpoly()
    value.minpoly()
print('finalizer-ok')
`, {}, ["--expose-gc"]);
assert.match(finalizer.stdout, /finalizer-ok/);

let sanitizer = "unsupported-on-windows";
if (process.platform !== "win32") {
  const source = String.raw`
#include <stdio.h>
#include <sagejs/exact_polynomial_ffi.h>

int main(void)
{
    fmpz_t numerator, denominator;
    fmpz_init(numerator);
    fmpz_init(denominator);
    fmpz_one(denominator);
    for (slong round = 0; round < ${sanitizerRounds(500)}; round++)
    {
        sagejs_fmpq_matrix_t matrix;
        sagejs_fmpq_polynomial_t characteristic, minimal;
        if (!sagejs_fmpq_matrix_init(matrix, 8, 8))
            return 1;
        for (slong row = 0; row < 8; row++)
            for (slong column = 0; column < 8; column++)
            {
                fmpz_set_si(numerator,
                    row == column ? round + row + 1 :
                    (column == row + 1 ? 1 : 0));
                if (!sagejs_fmpq_matrix_set_entry(
                        matrix, (uint64_t) row, (uint64_t) column,
                        numerator, denominator))
                    return 2;
            }
        if (round == 0)
        {
            fmpz_one(numerator);
            fmpz_mul_2exp(numerator, numerator, 65537);
            fmpz_add_ui(numerator, numerator, 17);
            if (!sagejs_fmpq_matrix_set_entry(
                    matrix, 0, 0, numerator, denominator))
                return 3;
        }
        if (!sagejs_fmpq_matrix_charpoly_resource(characteristic, matrix) ||
            !sagejs_fmpq_matrix_minpoly_resource(minimal, matrix) ||
            !characteristic->sealed || !minimal->sealed ||
            fmpq_poly_length(characteristic->value) != 9 ||
            fmpq_poly_length(minimal->value) < 2)
            return 4;
        sagejs_fmpq_polynomial_clear(minimal);
        sagejs_fmpq_polynomial_clear(characteristic);
        sagejs_fmpq_matrix_clear(matrix);
    }
    {
        sagejs_fmpq_matrix_t nonsquare;
        sagejs_fmpq_polynomial_t failed;
        if (!sagejs_fmpq_matrix_init(nonsquare, 2, 3) ||
            sagejs_fmpq_matrix_charpoly_resource(failed, nonsquare) ||
            sagejs_fmpq_matrix_minpoly_resource(failed, nonsquare))
            return 5;
        sagejs_fmpq_matrix_clear(nonsquare);
    }
    fmpz_clear(denominator);
    fmpz_clear(numerator);
    printf("rounds=${sanitizerRounds(500)}\n");
    return 0;
}
`;
  const temporary = mkdtempSync(
    join(tmpdir(), "sagejs-rational-matrix-polynomials-"),
  );
  try {
    const sourcePath = join(temporary, "lifecycle.c");
    const executable = join(temporary, "lifecycle");
    writeFileSync(sourcePath, source);
    const compiler = process.env.CC || "cc";
    const compiled = spawnSync(compiler, [
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
      compiled.status, 0,
      `${compiled.stdout}\n${compiled.stderr}`,
    );
    const executed = spawnSync(executable, [], {
      cwd: root,
      encoding: "utf8",
      env: sanitizerEnvironment({ strictStringChecks: true }),
    });
    assert.equal(
      executed.status, 0,
      `${executed.stdout}\n${executed.stderr}`,
    );
    sanitizer = executed.stdout.trim();
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

process.stdout.write(JSON.stringify({
  schema: "sagejs.matrix/exact-rational-polynomials-v1",
  status: "ok",
  lifecycleRounds: 200,
  sanitizer,
}) + "\n");
