#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const flint = require("../packages/flint");
const root = join(__dirname, "..");

function create(rows, columns, entries = []) {
  const result = flint.ffiFmpqMatrixCreate(BigInt(rows), BigInt(columns));
  for (let index = 0; index < entries.length; index += 1) {
    const [numerator, denominator] = entries[index];
    assert.equal(flint.ffiFmpqMatrixSetEntry(
      result,
      BigInt(Math.floor(index / columns)),
      BigInt(index % columns),
      numerator,
      denominator,
    ), true);
  }
  return result;
}

function shape(matrix) {
  return [
    Number(flint.ffiFmpqMatrixNrows(matrix)),
    Number(flint.ffiFmpqMatrixNcols(matrix)),
  ];
}

function entries(matrix) {
  const [rows, columns] = shape(matrix);
  return Array.from({ length: rows * columns }, (_, index) => [
    flint.ffiFmpqMatrixEntryNumerator(
      matrix, BigInt(Math.floor(index / columns)), BigInt(index % columns),
    ),
    flint.ffiFmpqMatrixEntryDenominator(
      matrix, BigInt(Math.floor(index / columns)), BigInt(index % columns),
    ),
  ]);
}

function formattedEntries(matrix) {
  return entries(matrix).map(([numerator, denominator]) =>
    denominator === 1n ? `${numerator}` : `${numerator}/${denominator}`
  ).join(",");
}

function verifyKernel(source, expectedShape, expectedEntries = undefined) {
  const original = entries(source);
  const kernel = flint.ffiFmpqMatrixRightKernel(source);
  const transpose = flint.ffiFmpqMatrixTranspose(kernel);
  const product = flint.ffiFmpqMatrixMul(source, transpose);
  const canonical = flint.ffiFmpqMatrixRref(kernel);
  try {
    assert.deepEqual(shape(kernel), expectedShape);
    assert.equal(flint.ffiFmpqMatrixIsZero(product), true);
    assert.equal(flint.ffiFmpqMatrixEqual(kernel, canonical), true);
    assert.deepEqual(entries(source), original);
    if (expectedEntries !== undefined) {
      assert.deepEqual(entries(kernel), expectedEntries);
    }
  } finally {
    flint.ffiFmpqMatrixClose(canonical);
    flint.ffiFmpqMatrixClose(product);
    flint.ffiFmpqMatrixClose(transpose);
    flint.ffiFmpqMatrixClose(kernel);
  }
}

test("generated rational right kernel returns Sage's canonical row basis", () => {
  const source = create(2, 3, [
    [1n, 1n], [2n, 1n], [3n, 1n],
    [2n, 1n], [4n, 1n], [6n, 1n],
  ]);
  try {
    verifyKernel(source, [2, 3], [
      [1n, 1n], [0n, 1n], [-1n, 3n],
      [0n, 1n], [1n, 1n], [-2n, 3n],
    ]);
  } finally {
    flint.ffiFmpqMatrixClose(source);
  }
});

test("generated rational right kernel matches the current public oracle", () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-fmpq-kernel-oracle-"));
  try {
    const script = join(directory, "oracle.py");
    writeFileSync(script, [
      "A = matrix(QQ, 2, 3, [1, 2, 3, 2, 4, 6])",
      "K = A.right_kernel_matrix()",
      "print(K.nrows(), K.ncols())",
      "for row in range(K.nrows()):",
      "    for column in range(K.ncols()):",
      "        print(K[row, column])",
      "",
    ].join("\n"));
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), script],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "2 3\n1\n0\n-1/3\n0\n1\n-2/3");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("generated rational right kernel matches randomized public rank profiles", () => {
  const rounds = 30;
  const directory = mkdtempSync(join(tmpdir(), "sagejs-fmpq-kernel-oracle-"));
  const expected = [];
  let state = 1n;
  try {
    const script = join(directory, "oracle.py");
    writeFileSync(script, [
      "_state = 1",
      `for _round in range(${rounds}):`,
      "    _rows = _round % 6",
      "    _columns = (_round * 5) % 8",
      "    _values = []",
      "    for _index in range(_rows * _columns):",
      "        _state = (1664525*_state + 1013904223) % 4294967296",
      "        _values.append(QQ(_state % 31 - 15)/(_index % 5 + 1))",
      "    if _rows > 1 and _round % 3 == 0:",
      "        for _column in range(_columns):",
      "            _values[(_rows - 1)*_columns + _column] = _values[_column]",
      "    if _columns > 0 and _round % 4 == 0:",
      "        for _row in range(_rows):",
      "            _values[_row*_columns + _columns - 1] = 0",
      "    _source = matrix(QQ, _rows, _columns, _values)",
      "    _kernel = _source.right_kernel_matrix()",
      "    _text = ','.join(str(_kernel[_row, _column]) for _row in range(_kernel.nrows()) for _column in range(_kernel.ncols()))",
      "    print(str(_kernel.nrows()) + '|' + str(_kernel.ncols()) + '|' + _text)",
      "",
    ].join("\n"));
    const result = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), script],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const oracle = result.stdout.trim().split("\n");
    assert.equal(oracle.length, rounds);

    for (let round = 0; round < rounds; round += 1) {
      const rows = round % 6;
      const columns = (round * 5) % 8;
      const values = [];
      for (let index = 0; index < rows * columns; index += 1) {
        state = (1664525n * state + 1013904223n) & 0xffffffffn;
        values.push([state % 31n - 15n, BigInt(index % 5 + 1)]);
      }
      if (rows > 1 && round % 3 === 0) {
        for (let column = 0; column < columns; column += 1) {
          values[(rows - 1) * columns + column] = values[column];
        }
      }
      if (columns > 0 && round % 4 === 0) {
        for (let row = 0; row < rows; row += 1) {
          values[row * columns + columns - 1] = [0n, 1n];
        }
      }
      const source = create(rows, columns, values);
      const kernel = flint.ffiFmpqMatrixRightKernel(source);
      try {
        const [kernelRows, kernelColumns] = shape(kernel);
        expected.push(
          `${kernelRows}|${kernelColumns}|${formattedEntries(kernel)}`,
        );
      } finally {
        flint.ffiFmpqMatrixClose(kernel);
        flint.ffiFmpqMatrixClose(source);
      }
    }
    assert.deepEqual(expected, oracle);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("generated rational right kernel handles every degenerate shape", () => {
  const resources = [
    [create(0, 4), [4, 4]],
    [create(3, 0), [0, 0]],
    [create(3, 3, [
      [1n, 1n], [0n, 1n], [0n, 1n],
      [0n, 1n], [1n, 1n], [0n, 1n],
      [0n, 1n], [0n, 1n], [1n, 1n],
    ]), [0, 3]],
    [create(2, 3), [3, 3]],
  ];
  try {
    for (const [source, expectedShape] of resources) {
      verifyKernel(source, expectedShape);
    }
  } finally {
    for (const [source] of resources) flint.ffiFmpqMatrixClose(source);
  }
});

test("generated rational right kernel owns arbitrary skew exact entries", () => {
  const huge = (1n << 4097n) + 159n;
  const skew = (1n << 257n) + 93n;
  const source = create(2, 5, [
    [huge, 3n], [0n, 1n], [1n, skew], [-7n, 11n], [13n, 17n],
    [0n, 1n], [skew, 5n], [-11n, 19n], [huge, 23n], [-29n, 31n],
  ]);
  try {
    verifyKernel(source, [3, 5]);
  } finally {
    flint.ffiFmpqMatrixClose(source);
  }
});

test("generated rational right kernel rejects a closed resource", () => {
  const source = create(1, 2, [[1n, 1n], [1n, 1n]]);
  flint.ffiFmpqMatrixClose(source);
  flint.ffiFmpqMatrixClose(source);
  assert.throws(
    () => flint.ffiFmpqMatrixRightKernel(source),
    /resource is closed|Invalid argument/,
  );
});
