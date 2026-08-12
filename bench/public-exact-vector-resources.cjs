#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const session = await createSage();
  try {
    await session.evaluate(String.raw`
import sagejs.runtime as runtime

_exact_vector_n = 100000
_exact_vector_z = vector(ZZ, [2^130 + index for index in range(_exact_vector_n)])
_exact_vector_q = vector(QQ, [
    QQ(2^90 + index, 97) for index in range(_exact_vector_n)])

def _exact_vector_measure(function):
    started = runtime.wall_time()
    result = function()
    return [(runtime.wall_time() - started) * 1000, result]
`);

    const cases = [
      ["ZZ add", "_exact_vector_z + _exact_vector_z", "len(result)"],
      ["QQ add", "_exact_vector_q + _exact_vector_q", "len(result)"],
      ["ZZ scalar", "_exact_vector_z * (2^127 + 1)", "len(result)"],
      ["QQ scalar", "_exact_vector_q * (17/19)", "len(result)"],
      ["ZZ dot", "_exact_vector_z * _exact_vector_z", "result != 0"],
      ["QQ dot", "_exact_vector_q * _exact_vector_q", "result != 0"],
    ];
    const results = [];
    for (const [name, expression, check] of cases) {
      await session.evaluate(`result = ${expression}`);
      const samples = [];
      for (let repetition = 0; repetition < 7; repetition += 1) {
        const evaluated = await session.evaluate(
          `_exact_vector_measure(lambda: ${expression})[0]`,
        );
        samples.push(Number(evaluated.repr));
      }
      await session.evaluate(`result = ${expression}; assert ${check}`);
      const elapsed = median(samples);
      assert.ok(elapsed < 250, `${name}: ${elapsed}ms`);
      results.push({ name, median_ms: elapsed, samples_ms: samples });
    }

    console.log(JSON.stringify({
      schema_version: 1,
      workload: "warmed public exact-vector resource arithmetic",
      host: `${process.platform}-${process.arch}`,
      vector_length: 100000,
      notes: [
        "Same-base arithmetic and dot products remain inside generated FmpzVector/FmpqVector resources.",
        "Explicit list(), iteration, formatting, slicing, and current ZZ-to-QQ conversion are host-materialization boundaries.",
        "Exact matrix-vector input serializes and reparses through a canonical ByteRegion; output serializes the temporary FLINT result and parses/copies it into the public vector resource. This is list-free but not zero-copy.",
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
