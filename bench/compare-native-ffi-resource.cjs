#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

const root = join(__dirname, "..");

function median(values) {
  return [...values].sort((left, right) => left - right)[
    Math.floor(values.length / 2)
  ];
}

function time(name, fn, repeat, warmup = 100) {
  let answer;
  for (let index = 0; index < warmup; index += 1) answer = fn();
  const samples = [];
  for (let sample = 0; sample < 9; sample += 1) {
    const start = process.hrtime.bigint();
    for (let index = 0; index < repeat; index += 1) answer = fn();
    samples.push(Number(process.hrtime.bigint() - start) / repeat);
  }
  return {
    name,
    medianNanoseconds: median(samples),
    answer: Array.from(answer, String),
  };
}

(async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-ffi-resource-benchmark-"));
  try {
    const compiled = await compileKernel({
      sourcePath: join(root, "bench", "native-ffi-flint-resource.py"),
      cacheRoot: temporary,
    });
    const kernel = require(compiled.modulePath);
    const flint = require("@sagemath/sagejs-flint");
    const direct = () => {
      const group = flint.ffiDirichletGroupCreate(1009n);
      try {
        return [
          flint.ffiDirichletGroupSize(group),
          flint.ffiDirichletGroupNumPrimitive(group),
        ];
      } finally {
        flint.ffiDirichletGroupClose(group);
      }
    };
    const expected = direct();
    assert.deepEqual(kernel.dirichlet_summary(1009n), expected);
    assert.deepEqual(kernel.dirichlet_summary.javascript(1009n), expected);
    const rows = [
      time("resource/native isolated core", () =>
        kernel.dirichlet_summary(1009n), 10000),
      time("resource/generated JavaScript fallback", () =>
        kernel.dirichlet_summary.javascript(1009n), 10000),
      time("resource/direct addon with explicit close", direct, 10000),
    ];
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.benchmark/native-ffi-resource-v1",
      workload: {
        operation: "construct Dirichlet group mod 1009; query size and primitive count; close",
        warmup: 100,
        samples: 9,
        repeat: 10000,
      },
      declarationIdentities: compiled.ir.foreignLibraries.map(
        (library) => library.declarationIdentity,
      ),
      rows,
    }, null, 2)}\n`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
