#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { performance } = require("node:perf_hooks");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const { createSage } = require("../dist/tools/kernel.js");

const root = resolve(__dirname, "..");
const generatedDirectory = join(
  root, "packages", "flint", "build", "generated-ffi",
);
const manifest = require(join(generatedDirectory, "manifest.json"));
const flint = require(join(generatedDirectory, manifest.addon));
const shapes = [[60, 90], [80, 120], [120, 180]];
const samples = 3;
const referenceSamples = 1;

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function measure(operation, close) {
  close(operation());
  const values = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    const result = operation();
    values.push(performance.now() - started);
    close(result);
  }
  return median(values);
}

function nextState(state) {
  return (1664525n * state + 1013904223n) & 0xffffffffn;
}

function directSource(rows, columns, seed) {
  const source = flint.ffiFmpqMatrixCreate(BigInt(rows), BigInt(columns));
  let state = BigInt(seed);
  for (let index = 0; index < rows * columns; index += 1) {
    state = nextState(state);
    assert.equal(flint.ffiFmpqMatrixSetEntry(
      source,
      BigInt(Math.floor(index / columns)),
      BigInt(index % columns),
      state % 201n - 100n,
      1n,
    ), true);
  }
  return source;
}

function sourceLines(rows, columns, seed, name) {
  return [
    `_state = ${seed}`,
    "_values = []",
    `for _index in range(${rows * columns}):`,
    "    _state = (1664525*_state + 1013904223) % 4294967296",
    "    _values.append(QQ(_state % 201 - 100))",
    `${name} = matrix(QQ, ${rows}, ${columns}, _values)`,
  ];
}

async function publicMeasurements() {
  const session = await createSage();
  try {
    const lines = ["import sagejs.runtime as _runtime"];
    for (let index = 0; index < shapes.length; index += 1) {
      const [rows, columns] = shapes[index];
      lines.push(...sourceLines(rows, columns, index + 1, `_source_${index}`));
      lines.push(`_source_${index}.__copy__().right_kernel_matrix()`);
    }
    await session.evaluate(lines.join("\n"));
    const timings = [];
    for (let index = 0; index < shapes.length; index += 1) {
      const measured = await session.evaluate([
        "import sagejs.runtime as _runtime",
        "_samples = []",
        `for _sample in range(${referenceSamples}):`,
        `    _working = _source_${index}.__copy__()`,
        "    _started = _runtime.wall_time()",
        "    _result = _working.right_kernel_matrix()",
        "    _samples.append((_runtime.wall_time() - _started)*1000)",
        "print(sorted(_samples)[len(_samples)//2])",
      ].join("\n"));
      timings.push(Number(measured.stdout.trim()));
    }
    return timings;
  } finally {
    await session.close();
  }
}

function sageMeasurements() {
  const sage = process.env.SAGE_BIN || "/home/user/sagelite/sage";
  if (!existsSync(sage)) return null;
  const lines = ["import json", "import time", "_answer = []"];
  for (let index = 0; index < shapes.length; index += 1) {
    const [rows, columns] = shapes[index];
    lines.push(...sourceLines(rows, columns, index + 1, `_source_${index}`));
    lines.push(`_source_${index}.__copy__().right_kernel_matrix()`);
    lines.push("_samples = []");
    lines.push(`for _sample in range(${referenceSamples}):`);
    lines.push(`    _working = _source_${index}.__copy__()`);
    lines.push("    _started = time.perf_counter()");
    lines.push("    _result = _working.right_kernel_matrix()");
    lines.push("    _samples.append((time.perf_counter() - _started)*1000)");
    lines.push("_answer.append(sorted(_samples)[len(_samples)//2])");
  }
  lines.push("print(json.dumps(_answer))");
  const result = spawnSync(sage, ["-c", lines.join("\n")], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Sage benchmark failed:\n${result.stdout}${result.stderr}`);
  }
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}

async function main() {
  const direct = [];
  for (let index = 0; index < shapes.length; index += 1) {
    const [rows, columns] = shapes[index];
    const source = directSource(rows, columns, index + 1);
    try {
      direct.push(measure(
        () => flint.ffiFmpqMatrixRightKernel(source),
        (result) => flint.ffiFmpqMatrixClose(result),
      ));
    } finally {
      flint.ffiFmpqMatrixClose(source);
    }
  }
  const currentPublic = await publicMeasurements();
  const sage = sageMeasurements();
  process.stdout.write(JSON.stringify({
    schema: "sagejs.benchmark/fmpq-matrix-right-kernel-resource-v1",
    workload: {
      shapes,
      entries: "deterministic small integers represented over QQ",
      generated_resource_samples: samples,
      reference_samples: referenceSamples,
    },
    generated_resource_ms: direct,
    current_public_ms: currentPublic,
    sagemath_ms: sage,
  }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
