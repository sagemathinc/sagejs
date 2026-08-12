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
import sagejs.runtime as _vector_bench_runtime
from sagejs.linear_algebra.vector_contract import (
    vector_nonzero_positions,
    vector_norm,
    vector_outer_product_entries,
    vector_pairwise_product,
)


def _vector_bench_root(total, p):
    if p == 1:
        return QQ(total)
    if p == 2:
        return sqrt(QQ(total))
    return total ** (QQ(1) / p)


_vector_bench_zz_left = [ZZ((index % 17) - 8) for index in range(10000)]
_vector_bench_zz_right = [ZZ((index * 3 % 19) - 9) for index in range(10000)]
_vector_bench_qq_left = [QQ((index % 17) - 8) / (index % 7 + 1) for index in range(10000)]
_vector_bench_qq_right = [QQ((index * 3 % 19) - 9) / (index % 5 + 1) for index in range(10000)]
_vector_bench_gf_left = [GF(7)(index) for index in range(10000)]
_vector_bench_gf_right = [GF(7)(3 * index + 1) for index in range(10000)]
_vector_bench_zz_norm = [ZZ(0) for _ in range(9998)] + [ZZ(3), ZZ(4)]
_vector_bench_qq_norm = [QQ(0) for _ in range(9998)] + [QQ(3), QQ(4)]
_vector_bench_outer_left = [ZZ(index % 13 - 6) for index in range(100)]
_vector_bench_outer_right = [ZZ(index % 11 - 5) for index in range(120)]


def _vector_bench(expression):
    started = _vector_bench_runtime.wall_time()
    result = expression()
    return [(_vector_bench_runtime.wall_time() - started) * 1000, len(result)]


def _vector_bench_support_zz():
    return vector_nonzero_positions(_vector_bench_zz_left)


def _vector_bench_support_qq():
    return vector_nonzero_positions(_vector_bench_qq_left)


def _vector_bench_support_gf():
    return vector_nonzero_positions(_vector_bench_gf_left)


def _vector_bench_pairwise_zz():
    return vector_pairwise_product(_vector_bench_zz_left, _vector_bench_zz_right)


def _vector_bench_pairwise_qq():
    return vector_pairwise_product(_vector_bench_qq_left, _vector_bench_qq_right)


def _vector_bench_pairwise_gf():
    return vector_pairwise_product(_vector_bench_gf_left, _vector_bench_gf_right)


def _vector_bench_norm_zz():
    return [vector_norm(
        _vector_bench_zz_norm, 2, Infinity, abs, _vector_bench_root)]


def _vector_bench_norm_qq():
    return [vector_norm(
        _vector_bench_qq_norm, 2, Infinity, abs, _vector_bench_root)]


def _vector_bench_outer():
    return vector_outer_product_entries(
        _vector_bench_outer_left, _vector_bench_outer_right)
`);

    const cases = [
      ["support-zz-10000", "_vector_bench_support_zz", 9_412],
      ["support-qq-10000", "_vector_bench_support_qq", 9_412],
      ["support-gf7-10000", "_vector_bench_support_gf", 8_571],
      ["pairwise-zz-10000", "_vector_bench_pairwise_zz", 10_000],
      ["pairwise-qq-10000", "_vector_bench_pairwise_qq", 10_000],
      ["pairwise-gf7-10000", "_vector_bench_pairwise_gf", 10_000],
      ["norm-zz-10000", "_vector_bench_norm_zz", 1],
      ["norm-qq-10000", "_vector_bench_norm_qq", 1],
      ["outer-zz-100x120", "_vector_bench_outer", 12_000],
    ];
    const results = [];
    for (const [id, functionName, expectedLength] of cases) {
      await session.evaluate(`_vector_bench(${functionName})`);
      const samples = [];
      for (let index = 0; index < 5; index += 1) {
        const result = await session.evaluate(`_vector_bench(${functionName})`);
        const [milliseconds, length] = JSON.parse(result.repr);
        if (length !== expectedLength) {
          throw new Error(`${id} produced ${length} entries, expected ${expectedLength}`);
        }
        samples.push(milliseconds);
      }
      results.push({ id, median_ms: median(samples), samples_ms: samples });
    }
    console.log(JSON.stringify({
      schema_version: 1,
      workload: "storage-neutral vector contract",
      host: `${process.platform}-${process.arch}`,
      warm_samples: 5,
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
