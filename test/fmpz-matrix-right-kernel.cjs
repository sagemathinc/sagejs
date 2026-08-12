#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const generatedDirectory = join(
  root, "packages", "flint", "build", "generated-ffi",
);
const manifest = require(join(generatedDirectory, "manifest.json"));
const flint = require(join(generatedDirectory, manifest.addon));

function matrix(rows, columns, values) {
  const value = flint.ffiFmpzMatrixCreate(BigInt(rows), BigInt(columns));
  for (let index = 0; index < values.length; index += 1) {
    assert.equal(flint.ffiFmpzMatrixSetEntry(
      value,
      BigInt(Math.floor(index / columns)),
      BigInt(index % columns),
      BigInt(values[index]),
    ), true);
  }
  return value;
}

function entries(value) {
  const rows = Number(flint.ffiFmpzMatrixNrows(value));
  const columns = Number(flint.ffiFmpzMatrixNcols(value));
  const answer = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      answer.push(flint.ffiFmpzMatrixEntry(
        value, BigInt(row), BigInt(column),
      ));
    }
  }
  return answer;
}

function kernel(rows, columns, values) {
  const source = matrix(rows, columns, values);
  try {
    const basis = flint.ffiFmpzMatrixRightKernel(source);
    try {
      return {
        rows: Number(flint.ffiFmpzMatrixNrows(basis)),
        columns: Number(flint.ffiFmpzMatrixNcols(basis)),
        entries: entries(basis),
      };
    } finally {
      flint.ffiFmpzMatrixClose(basis);
    }
  } finally {
    flint.ffiFmpzMatrixClose(source);
  }
}

function deterministicCorpus() {
  const cases = [
    [0, 0, []],
    [0, 4, []],
    [4, 0, []],
    [1, 3, [2, 4, 6]],
    [2, 3, [1, 2, 3, 4, 5, 6]],
    [2, 4, [1, 2, 3, 4, 2, 4, 6, 8]],
    [3, 5, [
      6, 0, 0, 12, 18,
      0, 10, 0, 20, -30,
      0, 0, 15, 45, 60,
    ]],
  ];
  let state = 0x12345678;
  for (let round = 0; round < 80; round += 1) {
    state = (1664525 * state + 1013904223) >>> 0;
    const rows = state % 8;
    state = (1664525 * state + 1013904223) >>> 0;
    const columns = state % 10;
    const values = [];
    for (let index = 0; index < rows * columns; index += 1) {
      state = (1664525 * state + 1013904223) >>> 0;
      const value = state % 7 === 0 ? 0 : (state % 21) - 10;
      if (round % 11 === 0 && index % 5 === 0) {
        values.push(BigInt(value) * (1n << BigInt(80 + index % 71)));
      } else {
        values.push(value);
      }
    }
    cases.push([rows, columns, values]);
  }
  return cases;
}

const cases = deterministicCorpus();
const actual = cases.map(([rows, columns, values]) => (
  kernel(rows, columns, values)
));

const sage = process.env.SAGE_BIN || "/home/user/sagelite/sage";
if (existsSync(sage)) {
  const input = cases.map(([rows, columns, values]) => ({
    rows, columns, values: values.map(String),
  }));
  const source = [
    "import json",
    `cases = json.loads(${JSON.stringify(JSON.stringify(input))})`,
    "answer = []",
    "for case in cases:",
    "    A = matrix(ZZ, case['rows'], case['columns'], [ZZ(x) for x in case['values']])",
    "    K = A.right_kernel_matrix(basis='echelon')",
    "    answer.append({'rows': K.nrows(), 'columns': K.ncols(), 'entries': [str(x) for x in K.list()]})",
    "print(json.dumps(answer))",
  ].join("\n");
  const oracle = spawnSync(sage, ["-c", source], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(oracle.status, 0, oracle.stderr || oracle.stdout);
  const expected = JSON.parse(oracle.stdout.trim().split("\n").at(-1));
  assert.deepEqual(actual.map(({ rows, columns, entries: values }) => ({
    rows,
    columns,
    entries: values.map(String),
  })), expected.map(({ rows, columns, entries: values }) => ({
    rows,
    columns,
    entries: values.map(String),
  })));
}

assert.deepEqual(
  kernel(1, 3, [2, 4, 6]).entries,
  [1n, 1n, -1n, 0n, 3n, -2n],
);
assert.deepEqual(kernel(0, 3, []).entries, [
  1n, 0n, 0n,
  0n, 1n, 0n,
  0n, 0n, 1n,
]);

process.stdout.write(JSON.stringify({
  schema: "sagejs.test/fmpz-matrix-right-kernel-v1",
  cases: cases.length,
  sageOracle: existsSync(sage),
}) + "\n");
