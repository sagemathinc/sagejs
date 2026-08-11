#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function setting(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid positive benchmark setting ${name}=${value}`);
  }
  return parsed;
}

async function main() {
  const samples = Math.max(
    3,
    Math.floor(setting("SAGEJS_MATRIX_CONSTRUCTOR_SAMPLES", 5)),
  );
  const scale = setting("SAGEJS_MATRIX_CONSTRUCTOR_BUDGET_SCALE", 1);
  const session = await createSage();
  try {
    await session.evaluate(String.raw`
import sagejs.runtime as runtime
import sagejs.kernels.matrix.dense_integer_flint as integer_kernels
import sagejs.kernels.matrix.dense_prime_field as prime_kernels
import sagejs.kernels.matrix.dense_rational_flint as rational_kernels

assert integer_kernels.flint_dense_integer_resource_set_diagonal.nativeAvailable
assert integer_kernels.flint_dense_integer_matrix_space_random_fill.nativeAvailable
assert prime_kernels.dense_prime_field_matrix_identity.nativeAvailable
assert prime_kernels.dense_prime_field_matrix_set_diagonal.nativeAvailable
assert prime_kernels.dense_prime_field_matrix_space_random_fill.nativeAvailable
assert rational_kernels.flint_dense_rational_matrix_set_diagonal.nativeAvailable

_constructor_diagonal = [index - 500 for index in range(1000)]

def _constructor_close(matrix):
    if matrix.base_ring() is ZZ:
        matrix._integer_storage_cache.resource.close()
    elif matrix.base_ring() is QQ:
        matrix._rational_storage_cache.resource.close()

def _constructor_time(function):
    started = runtime.wall_time()
    result = function()
    elapsed = (runtime.wall_time() - started) * 1000
    if result.nrows() < 0:
        raise AssertionError('constructor returned an invalid matrix')
    _constructor_close(result)
    return elapsed

def _random_element_zz(): return MatrixSpace(ZZ, 500).random_element()
def _random_element_qq(): return MatrixSpace(QQ, 500).random_element()
def _random_element_gf(): return MatrixSpace(GF(97), 500).random_element()
def _random_matrix_zz(): return random_matrix(ZZ, 500)
def _random_matrix_qq(): return random_matrix(QQ, 500)
def _random_matrix_gf(): return random_matrix(GF(97), 500)
def _identity_zz(): return identity_matrix(ZZ, 1000)
def _identity_qq(): return identity_matrix(QQ, 1000)
def _identity_gf(): return identity_matrix(GF(97), 1000)
def _diagonal_zz(): return diagonal_matrix(ZZ, _constructor_diagonal)
def _diagonal_qq(): return diagonal_matrix(QQ, _constructor_diagonal)
def _diagonal_gf(): return diagonal_matrix(GF(97), _constructor_diagonal)
`);

    const cases = [
      ["MatrixSpace.random ZZ 500²", "_random_element_zz", 80],
      ["MatrixSpace.random QQ 500²", "_random_element_qq", 100],
      ["MatrixSpace.random GF 500²", "_random_element_gf", 50],
      ["identity ZZ 1000", "_identity_zz", 50],
      ["identity QQ 1000", "_identity_qq", 100],
      ["identity GF 1000", "_identity_gf", 50],
      ["diagonal ZZ 1000", "_diagonal_zz", 60],
      ["diagonal QQ 1000", "_diagonal_qq", 100],
      ["diagonal GF 1000", "_diagonal_gf", 50],
    ];
    const baselines = [
      ["random_matrix ZZ 500²", "_random_matrix_zz"],
      ["random_matrix QQ 500²", "_random_matrix_qq"],
      ["random_matrix GF 500²", "_random_matrix_gf"],
    ];
    const measurements = new Map();
    const failures = [];

    for (const [, functionName] of [...cases, ...baselines]) {
      await session.evaluate(`_constructor_time(${functionName})`);
      const values = [];
      for (let sample = 0; sample < samples; sample += 1) {
        const result = await session.evaluate(
          `_constructor_time(${functionName})`,
        );
        values.push(Number(result.repr));
      }
      measurements.set(functionName, median(values));
    }

    console.log(`Canonical matrix constructors (${samples} warm samples)`);
    for (const [name, functionName, budget] of cases) {
      const elapsed = measurements.get(functionName);
      const limit = budget * scale;
      console.log(
        `  ${name.padEnd(30)} ${elapsed.toFixed(2)} ms / ${limit.toFixed(2)} ms`,
      );
      if (!(elapsed >= 0 && elapsed <= limit)) failures.push(name);
    }
    for (const [name, functionName] of baselines) {
      console.log(
        `  ${name.padEnd(30)} ${measurements.get(functionName).toFixed(2)} ms`,
      );
    }

    for (const [elementName, matrixName, label] of [
      ["_random_element_zz", "_random_matrix_zz", "ZZ random parity"],
      ["_random_element_qq", "_random_matrix_qq", "QQ random parity"],
      ["_random_element_gf", "_random_matrix_gf", "GF random parity"],
    ]) {
      const element = measurements.get(elementName);
      const matrix = measurements.get(matrixName);
      if (!(element <= matrix * 4 + 10 * scale)) failures.push(label);
    }

    if (failures.length !== 0) {
      throw new Error(
        `canonical matrix constructor budget exceeded: ${failures.join(", ")}`,
      );
    }
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
