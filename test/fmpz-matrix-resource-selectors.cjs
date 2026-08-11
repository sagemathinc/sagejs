#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const generatedDirectory = join(
  root, "packages", "flint", "build", "generated-ffi",
);
const manifest = require(join(generatedDirectory, "manifest.json"));
const flint = require(join(generatedDirectory, manifest.addon));
const accounted = flint.__sagejsFfiResourceExternalMemory;

function close(resource) {
  flint.ffiFmpzMatrixClose(resource);
  assert.equal(accounted(resource), 0n);
  flint.ffiFmpzMatrixClose(resource);
  assert.equal(accounted(resource), 0n);
}

function matrix(rows, columns, values) {
  const resource = flint.ffiFmpzMatrixCreate(BigInt(rows), BigInt(columns));
  try {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        assert.equal(flint.ffiFmpzMatrixSetEntry(
          resource,
          BigInt(row),
          BigInt(column),
          BigInt(values[row * columns + column]),
        ), true);
      }
    }
    return resource;
  } catch (error) {
    close(resource);
    throw error;
  }
}

function shape(resource) {
  return [
    Number(flint.ffiFmpzMatrixNrows(resource)),
    Number(flint.ffiFmpzMatrixNcols(resource)),
  ];
}

function entries(resource) {
  const [rows, columns] = shape(resource);
  return Array.from({ length: rows * columns }, (_, index) =>
    flint.ffiFmpzMatrixEntry(
      resource,
      BigInt(Math.floor(index / columns)),
      BigInt(index % columns),
    ));
}

test("generated FmpzMatrix selectors preserve order and duplicates", () => {
  const huge = (1n << 521n) + 37n;
  const values = Array.from({ length: 20 }, (_, index) => BigInt(index - 7));
  values[17] = huge;
  const source = matrix(4, 5, values);
  const selectedRows = flint.ffiFmpzMatrixSelectRows(
    source,
    new BigUint64Array([3n, 1n, 3n, 0n]),
    4n,
  );
  const selectedColumns = flint.ffiFmpzMatrixSelectColumns(
    source,
    new BigUint64Array([4n, 0n, 4n, 2n]),
    4n,
  );
  try {
    assert.deepEqual(shape(selectedRows), [4, 5]);
    assert.deepEqual(
      entries(selectedRows),
      [3, 1, 3, 0].flatMap((row) =>
        values.slice(row * 5, row * 5 + 5)),
    );
    assert.deepEqual(shape(selectedColumns), [4, 4]);
    assert.deepEqual(
      entries(selectedColumns),
      Array.from({ length: 4 }, (_, row) => [4, 0, 4, 2].map(
        (column) => values[row * 5 + column],
      )).flat(),
    );
    assert.equal(flint.ffiFmpzMatrixSetEntry(source, 3n, 2n, -99n), true);
    assert.equal(flint.ffiFmpzMatrixEntry(selectedRows, 0n, 2n), huge);
    assert.equal(flint.ffiFmpzMatrixEntry(selectedRows, 2n, 2n), huge);
    assert.equal(flint.ffiFmpzMatrixEntry(selectedColumns, 3n, 3n), huge);
    assert.ok(accounted(selectedRows) > 0n);
    assert.ok(accounted(selectedColumns) > 0n);
  } finally {
    close(selectedColumns);
    close(selectedRows);
    close(source);
  }
});

test("selectors reject a closed resource before native entry", () => {
  const source = matrix(1, 1, [17n]);
  close(source);
  assert.throws(
    () => flint.ffiFmpzMatrixSelectRows(
      source, new BigUint64Array([0n]), 1n,
    ),
    /resource is closed/,
  );
  assert.throws(
    () => flint.ffiFmpzMatrixSelectColumns(
      source, new BigUint64Array([0n]), 1n,
    ),
    /resource is closed/,
  );
});

test("generated FmpzMatrix selectors preserve every empty shape", () => {
  const noRows = matrix(0, 4, []);
  const noColumns = matrix(3, 0, []);
  const emptyRows = flint.ffiFmpzMatrixSelectRows(
    noRows, new BigUint64Array(0), 0n,
  );
  const columnsOfNoRows = flint.ffiFmpzMatrixSelectColumns(
    noRows, new BigUint64Array([3n, 1n]), 2n,
  );
  const rowsOfNoColumns = flint.ffiFmpzMatrixSelectRows(
    noColumns, new BigUint64Array([2n, 0n]), 2n,
  );
  const emptyColumns = flint.ffiFmpzMatrixSelectColumns(
    noColumns, new BigUint64Array(0), 0n,
  );
  try {
    assert.deepEqual(shape(emptyRows), [0, 4]);
    assert.deepEqual(shape(columnsOfNoRows), [0, 2]);
    assert.deepEqual(shape(rowsOfNoColumns), [2, 0]);
    assert.deepEqual(shape(emptyColumns), [3, 0]);
  } finally {
    close(emptyColumns);
    close(rowsOfNoColumns);
    close(columnsOfNoRows);
    close(emptyRows);
    close(noColumns);
    close(noRows);
  }
});

test("invalid selection fails atomically before allocating a result", () => {
  const values = Array.from({ length: 12 }, (_, index) => BigInt(index + 1));
  const source = matrix(3, 4, values);
  const beforeEntries = entries(source);
  const beforeAccounting = accounted(source);
  try {
    for (let round = 0; round < 100; round += 1) {
      assert.throws(
        () => flint.ffiFmpzMatrixSelectRows(
          source, new BigUint64Array([2n, 3n]), 2n,
        ),
        /row selection contains an invalid index/,
      );
      assert.throws(
        () => flint.ffiFmpzMatrixSelectColumns(
          source, new BigUint64Array([4n]), 1n,
        ),
        /column selection contains an invalid index/,
      );
      assert.throws(
        () => flint.ffiFmpzMatrixSelectRows(
          source, new BigUint64Array([0n]), 2n,
        ),
        /length|count|range|bounds/i,
      );
    }
    assert.deepEqual(entries(source), beforeEntries);
    assert.equal(accounted(source), beforeAccounting);

    const valid = flint.ffiFmpzMatrixSelectRows(
      source, new BigUint64Array([2n, 0n]), 2n,
    );
    assert.deepEqual(entries(valid), values.slice(8).concat(values.slice(0, 4)));
    close(valid);
  } finally {
    close(source);
  }
});
