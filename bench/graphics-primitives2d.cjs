#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");

const { createSage } = require("../dist/tools/kernel.js");

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

async function sample(session, count, marker) {
  const source = [
    `g = line([(i, i % 97) for i in range(${count})],`,
    marker ? "         marker='o', markersize=3)" : "         thickness=1)",
    "figure = g.plotly()",
    "len(figure['data'][0]['x'])",
  ].join("\n");
  const started = performance.now();
  const result = await session.evaluate(source);
  const elapsed = performance.now() - started;
  assert.equal(result.repr, String(count));
  return elapsed;
}

async function main() {
  const session = await createSage();
  try {
    await sample(session, 1_000, false);
    const rows = [];
    for (const count of [10_000, 100_000]) {
      for (const marker of [false, true]) {
        const samples = [];
        for (let index = 0; index < 3; index += 1) {
          samples.push(await sample(session, count, marker));
        }
        rows.push({
          count,
          marker,
          median_ms: Number(median(samples).toFixed(3)),
          samples_ms: samples.map((value) => Number(value.toFixed(3))),
        });
      }
    }
    process.stdout.write(JSON.stringify({ benchmark: "graphics-primitives2d", rows }, null, 2) + "\n");
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
