#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const session = await createSage();
  try {
    await session.evaluate(String.raw`
import sagejs.runtime as _matrix_vector_runtime
from sagejs.linear_algebra.matrix_vector import (
    matrix_times_vector_entries,
    vector_times_matrix_entries,
)


def _matrix_vector_measure(function):
    started = _matrix_vector_runtime.wall_time()
    result = function()
    return [(_matrix_vector_runtime.wall_time() - started) * 1000, len(result)]


def _matrix_vector_public_right(matrix_value, vector_value):
    return matrix_value * vector_value


def _matrix_vector_public_left(matrix_value, vector_value):
    return vector_value * matrix_value


def _matrix_vector_contract_right(matrix_value, vector_value):
    return matrix_times_vector_entries(
        matrix_value.list(), matrix_value.nrows(), matrix_value.ncols(),
        vector_value.list(), matrix_value.base_ring()(0))


def _matrix_vector_contract_left(matrix_value, vector_value):
    return vector_times_matrix_entries(
        vector_value.list(), matrix_value.list(), matrix_value.nrows(),
        matrix_value.ncols(), matrix_value.base_ring()(0))


_matrix_vector_cases = []
for _base in [GF(2), GF(7), ZZ, QQ]:
    _large_matrix = random_matrix(_base, 500)
    _large_vector = vector(_base, [index for index in range(500)])
    _small_matrix = matrix(_base, 100, 100, _large_matrix.list()[:10000])
    _small_vector = vector(_base, _large_vector.list()[:100])
    _matrix_vector_cases.append([
        str(_base), _large_matrix, _large_vector, _small_matrix, _small_vector])
`);

    const results = [];
    const workloads = [
      ["public-right-500", "_matrix_vector_public_right", 500, 0, 1],
      ["public-left-500", "_matrix_vector_public_left", 500, 0, 1],
      ["dynamic-contract-right-100", "_matrix_vector_contract_right", 100, 0, 3],
      ["dynamic-contract-left-100", "_matrix_vector_contract_left", 100, 0, 3],
    ];
    for (let caseIndex = 0; caseIndex < 4; caseIndex += 1) {
      const base = (await session.evaluate(
        `_matrix_vector_cases[${caseIndex}][0]`,
      )).repr.replace(/^'|'$/g, "");
      for (const [id, functionName, expectedLength, largeOffset, samples] of workloads) {
        const offset = id.includes("dynamic-contract") ? 3 : largeOffset + 1;
        const matrixOffset = offset;
        const vectorOffset = offset + 1;
        const expression = `_matrix_vector_measure(lambda: ${functionName}(`
          + `_matrix_vector_cases[${caseIndex}][${matrixOffset}], `
          + `_matrix_vector_cases[${caseIndex}][${vectorOffset}]))`;
        await session.evaluate(expression);
        const timings = [];
        for (let index = 0; index < samples; index += 1) {
          const [milliseconds, length] = JSON.parse(
            (await session.evaluate(expression)).repr,
          );
          if (length !== expectedLength) {
            throw new Error(`${base} ${id} returned ${length}, expected ${expectedLength}`);
          }
          timings.push(milliseconds);
        }
        results.push({
          base,
          id,
          median_ms: median(timings),
          samples_ms: timings,
        });
      }
    }

    console.log(JSON.stringify({
      schema_version: 1,
      workload: "dense matrix-vector public path and storage-neutral oracle",
      host: `${process.platform}-${process.arch}`,
      notes: [
        "Public samples use 500 by 500 matrices and report warmed operation latency.",
        "Dynamic contract samples use 100 by 100 matrices and include bulk list materialization.",
        "The dynamic contract is a correctness oracle; production acceleration requires one declared storage operation.",
      ],
      results,
    }, null, 2));
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
