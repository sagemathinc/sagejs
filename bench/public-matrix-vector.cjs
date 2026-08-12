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


def _public_matvec_measure(function):
    started = runtime.wall_time()
    result = function()
    return [(runtime.wall_time() - started) * 1000, len(result)]


_public_matvec_cases = []
for _base, _size in [(ZZ, 500), (QQ, 500), (GF(2), 700), (GF(7), 500)]:
    _A = matrix(_base, _size, _size,
                [((i * 17 + 3) % 19) - 9 for i in range(_size * _size)])
    _v = vector(_base, [((i * 7 + 5) % 13) - 6 for i in range(_size)])
    _public_matvec_cases.append([str(_base), _A, _v])
`);

    const results = [];
    for (let caseIndex = 0; caseIndex < 4; caseIndex += 1) {
      const base = (await session.evaluate(
        `_public_matvec_cases[${caseIndex}][0]`,
      )).repr.replace(/^'|'$/g, "");
      for (const [orientation, expression] of [
        ["right", `_public_matvec_cases[${caseIndex}][1] * _public_matvec_cases[${caseIndex}][2]`],
        ["left", `_public_matvec_cases[${caseIndex}][2] * _public_matvec_cases[${caseIndex}][1]`],
      ]) {
        const timed = `_public_matvec_measure(lambda: ${expression})`;
        await session.evaluate(timed);
        const samples = [];
        for (let repetition = 0; repetition < 7; repetition += 1) {
          const [milliseconds, length] = JSON.parse(
            (await session.evaluate(timed)).repr,
          );
          assert.ok(length === 500 || length === 700);
          samples.push(milliseconds);
        }
        const elapsed = median(samples);
        assert.ok(elapsed < 100, `${base} ${orientation}: ${elapsed}ms`);
        results.push({ base, orientation, median_ms: elapsed, samples_ms: samples });

        const legacyExpression = orientation === "right"
          ? `(_public_matvec_cases[${caseIndex}][1] * _public_matvec_cases[${caseIndex}][2].column()).column(0)`
          : `(_public_matvec_cases[${caseIndex}][2].row() * _public_matvec_cases[${caseIndex}][1]).row(0)`;
        const legacyTimed = `_public_matvec_measure(lambda: ${legacyExpression})`;
        await session.evaluate(legacyTimed);
        const legacySamples = [];
        for (let repetition = 0; repetition < 3; repetition += 1) {
          const [milliseconds] = JSON.parse(
            (await session.evaluate(legacyTimed)).repr,
          );
          legacySamples.push(milliseconds);
        }
        results[results.length - 1].legacy_temporary_matrix_median_ms =
          median(legacySamples);
      }
    }

    console.log(JSON.stringify({
      schema_version: 1,
      workload: "warmed public dense matrix-vector products",
      host: `${process.platform}-${process.arch}`,
      notes: [
        "ZZ, QQ, and GF(7) use 500 by 500 inputs; GF(2) uses 700 by 700.",
        "Each product performs one storage-level bulk operation after parent coercion.",
        "The 100 ms gate rejects temporary square matrix products and scalar host crossings.",
        "legacy_temporary_matrix_median_ms reconstructs the superseded public row/column-matrix path.",
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
