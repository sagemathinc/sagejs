#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

async function main() {
  const session = await createSage();
  try {
    await session.evaluate(String.raw`
import sagejs.runtime as _sparse_bench_runtime

_sparse_import_started = _sparse_bench_runtime.wall_time()
from sagejs.linear_algebra.sparse_random import (
    construct_from_sparse_random_spec,
    sage_binary_sparse_random_spec,
    sage_row_sparse_random_spec,
)
_sparse_import_ms = (
    _sparse_bench_runtime.wall_time() - _sparse_import_started
) * 1000


def _sparse_count_constructor(
    rows, columns, sampling, density, draws_per_row, collision
):
    sampling_code = 1 if sampling == "row-with-replacement" else 2
    collision_code = 1 if collision == "keep-first" else 2
    return [rows, columns, draws_per_row, sampling_code, collision_code]


def _sparse_row_spec(collision):
    spec = sage_row_sparse_random_spec(
        1000, 1000, 0.1, collision=collision
    )
    return construct_from_sparse_random_spec(spec, _sparse_count_constructor)


def _sparse_binary_spec():
    spec = sage_binary_sparse_random_spec(1000, 1000, 0.1)
    return construct_from_sparse_random_spec(spec, _sparse_count_constructor)


def _sparse_spec_zz():
    return _sparse_row_spec("keep-first")


def _sparse_spec_qq():
    return _sparse_row_spec("replace")


def _sparse_spec_gf7():
    return _sparse_row_spec("replace")


def _sparse_public_zz():
    return random_matrix(ZZ, 1000, 1000, density=0.1)


def _sparse_public_qq():
    return random_matrix(QQ, 1000, 1000, density=0.1)


def _sparse_public_gf2():
    return random_matrix(GF(2), 1000, 1000, density=0.1)


def _sparse_public_gf7():
    return random_matrix(GF(7), 1000, 1000, density=0.1)


def _sparse_timed(function):
    started = _sparse_bench_runtime.wall_time()
    result = function()
    elapsed = (_sparse_bench_runtime.wall_time() - started) * 1000
    if hasattr(result, "nrows"):
        detail = [result.nrows(), result.ncols()]
    else:
        detail = result
    return [elapsed, detail]
`);

    const cases = [
      ["spec-zz-1000-density-0.1", "_sparse_spec_zz"],
      ["spec-qq-1000-density-0.1", "_sparse_spec_qq"],
      ["spec-gf2-1000-density-0.1", "_sparse_binary_spec"],
      ["spec-gf7-1000-density-0.1", "_sparse_spec_gf7"],
      ["current-public-zz-1000-density-0.1", "_sparse_public_zz"],
      ["current-public-qq-1000-density-0.1", "_sparse_public_qq"],
      ["current-public-gf2-1000-density-0.1", "_sparse_public_gf2"],
      ["current-public-gf7-1000-density-0.1", "_sparse_public_gf7"],
    ];
    const results = [];
    for (const [id, functionName] of cases) {
      const coldResult = await session.evaluate(`_sparse_timed(${functionName})`);
      const [coldMilliseconds, detail] = JSON.parse(coldResult.repr);
      const warmSamples = [];
      for (let sample = 0; sample < 3; sample += 1) {
        const result = await session.evaluate(`_sparse_timed(${functionName})`);
        const [milliseconds] = JSON.parse(result.repr);
        warmSamples.push(milliseconds);
      }
      results.push({
        id,
        cold_ms: coldMilliseconds,
        warm_median_ms: median(warmSamples),
        warm_samples_ms: warmSamples,
        detail,
      });
    }
    const importResult = await session.evaluate("_sparse_import_ms");
    console.log(JSON.stringify({
      schema: "sagejs.linear-algebra/sparse-random-benchmark-v1",
      host: `${process.platform}-${process.arch}`,
      workload: "1000 x 1000 dense targets with explicit density=0.1",
      module_import_ms: Number(importResult.repr),
      policy: "one cold sample followed by median of three warm samples",
      note: "spec cases stop at one mock bulk-constructor call; public cases are the pre-integration scalar-loop baseline",
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
