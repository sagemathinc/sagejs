#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const generatedDirectory = join(
  root, "packages", "flint", "build", "generated-ffi",
);
const manifest = require(join(generatedDirectory, "manifest.json"));
const flint = require(join(generatedDirectory, manifest.addon));

function close(resource) {
  flint.ffiFmpzMatrixClose(resource);
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function measure(operation, { warmups = 5, samples = 15 } = {}) {
  for (let sample = 0; sample < warmups; sample += 1) {
    close(operation());
  }
  const milliseconds = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    const result = operation();
    const elapsed = performance.now() - started;
    close(result);
    milliseconds.push(elapsed);
  }
  return {
    median_ms: median(milliseconds),
    minimum_ms: Math.min(...milliseconds),
    maximum_ms: Math.max(...milliseconds),
    samples,
  };
}

const size = 500;
const selectedCount = 250;
const source = flint.ffiFmpzMatrixCreate(BigInt(size), BigInt(size));
const indices = new BigUint64Array(selectedCount);
for (let index = 0; index < selectedCount; index += 1) {
  indices[index] = BigInt(2 * index);
}

/*
 * Fill every entry before measuring. Small signed fmpz values stay immediate,
 * matching the common small-entry exact-matrix workload while still copying
 * the full 125,000 selected entries.
 */
for (let row = 0; row < size; row += 1) {
  for (let column = 0; column < size; column += 1) {
    assert.equal(flint.ffiFmpzMatrixSetEntry(
      source,
      BigInt(row),
      BigInt(column),
      BigInt(((17 * row + 31 * column) % 2001) - 1000),
    ), true);
  }
}

function selectRowsBulk() {
  return flint.ffiFmpzMatrixSelectRows(
    source, indices, BigInt(selectedCount),
  );
}

function selectColumnsBulk() {
  return flint.ffiFmpzMatrixSelectColumns(
    source, indices, BigInt(selectedCount),
  );
}

function selectRowsIncremental() {
  const result = flint.ffiFmpzMatrixCreate(
    BigInt(selectedCount), BigInt(size),
  );
  try {
    for (let targetRow = 0; targetRow < selectedCount; targetRow += 1) {
      const sourceRow = flint.ffiFmpzMatrixSubmatrix(
        source, indices[targetRow], indices[targetRow] + 1n, 0n, BigInt(size),
      );
      try {
        assert.equal(flint.ffiFmpzMatrixSetBlock(
          result, BigInt(targetRow), 0n, sourceRow,
        ), true);
      } finally {
        close(sourceRow);
      }
    }
    return result;
  } catch (error) {
    close(result);
    throw error;
  }
}

function selectColumnsIncremental() {
  const result = flint.ffiFmpzMatrixCreate(
    BigInt(size), BigInt(selectedCount),
  );
  try {
    for (let targetColumn = 0;
      targetColumn < selectedCount;
      targetColumn += 1) {
      const sourceColumn = flint.ffiFmpzMatrixSubmatrix(
        source,
        0n,
        BigInt(size),
        indices[targetColumn],
        indices[targetColumn] + 1n,
      );
      try {
        assert.equal(flint.ffiFmpzMatrixSetBlock(
          result, 0n, BigInt(targetColumn), sourceColumn,
        ), true);
      } finally {
        close(sourceColumn);
      }
    }
    return result;
  } catch (error) {
    close(result);
    throw error;
  }
}

try {
  const rows = measure(selectRowsBulk);
  const columns = measure(selectColumnsBulk);
  const incrementalRows = measure(selectRowsIncremental, {
    warmups: 1,
    samples: 5,
  });
  const incrementalColumns = measure(selectColumnsIncremental, {
    warmups: 1,
    samples: 5,
  });
  assert.ok(rows.median_ms < incrementalRows.median_ms);
  assert.ok(columns.median_ms < incrementalColumns.median_ms);
  process.stdout.write(JSON.stringify({
    schema: "sagejs.benchmark/fmpz-matrix-resource-selectors-v1",
    workload: {
      source: [size, size],
      selected: selectedCount,
      order: "even indices in ascending order",
      values: "small signed exact integers",
    },
    generated_bulk: {
      rows,
      columns,
    },
    former_incremental_resource_route: {
      rows: incrementalRows,
      columns: incrementalColumns,
    },
    speedup: {
      rows: incrementalRows.median_ms / rows.median_ms,
      columns: incrementalColumns.median_ms / columns.median_ms,
    },
  }, null, 2) + "\n");
} finally {
  close(source);
}

