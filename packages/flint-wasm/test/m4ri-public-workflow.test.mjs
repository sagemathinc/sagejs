import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { instantiateM4ri } from "../m4ri.mjs";
import { createSage } from "../node-kernel.mjs";
import {
  assertReceiptBackedOperations,
  expectedStdout,
  publicSource,
  requiredRouteIds,
} from "./m4ri-public-workflow-support.mjs";

function keep(resources, value, close) {
  resources.push([value, close]);
  return value;
}

function matrixFromEntries(m4ri, resources, rows, columns, entries) {
  const value = keep(
    resources,
    m4ri.ffiM4riMatrixCreate(BigInt(rows), BigInt(columns)),
    m4ri.ffiM4riMatrixClose,
  );
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      m4ri.ffiM4riMatrixSetEntry(
        value,
        BigInt(row),
        BigInt(column),
        BigInt(entries[row * columns + column]),
      );
    }
  }
  return value;
}

function entries(m4ri, value) {
  const rows = Number(m4ri.ffiM4riMatrixNrows(value));
  const columns = Number(m4ri.ffiM4riMatrixNcols(value));
  return Array.from({ length: rows * columns }, (_, index) =>
    Number(m4ri.ffiM4riMatrixEntryCode(
      value,
      BigInt(Math.floor(index / columns)),
      BigInt(index % columns),
    ))
  );
}

test("public Matrix(GF(2)) routes substantial work through M4RI Wasm", async () => {
  const sage = await createSage();
  try {
    const result = await sage.evaluate(publicSource);
    assert.equal(result.stdout, expectedStdout);
    assertReceiptBackedOperations(result.instrumentation);
  } finally {
    await sage.close();
  }
});

test("public Matrix results agree with the direct generated M4RI Wasm API", async () => {
  const traces = [];
  const m4ri = await instantiateM4ri(
    await fs.readFile(new URL("../dist/m4ri-resource.wasm", import.meta.url)),
    { recordCapability: (...record) => traces.push(record) },
  );
  const resources = [];
  try {
    const A = matrixFromEntries(m4ri, resources, 4, 5, [
      1, 0, 1, 1, 0,
      0, 1, 1, 0, 1,
      1, 1, 0, 1, 1,
      0, 0, 1, 1, 1,
    ]);
    const B = matrixFromEntries(m4ri, resources, 5, 3, [
      1, 0, 1,
      0, 1, 1,
      1, 1, 0,
      1, 0, 0,
      0, 1, 0,
    ]);
    const Q = matrixFromEntries(
      m4ri,
      resources,
      3,
      3,
      [1, 1, 0, 0, 1, 1, 1, 1, 1],
    );
    const rhs = matrixFromEntries(m4ri, resources, 3, 1, [1, 0, 1]);
    const C = keep(resources, m4ri.ffiM4riMatrixMul(A, B), m4ri.ffiM4riMatrixClose);
    const K = keep(
      resources,
      m4ri.ffiM4riMatrixRightKernel(A),
      m4ri.ffiM4riMatrixClose,
    );
    const X = keep(
      resources,
      m4ri.ffiM4riMatrixSolve(Q, rhs),
      m4ri.ffiM4riMatrixClose,
    );

    assert.equal(m4ri.ffiM4riMatrixRank(A), 3n);
    assert.deepEqual(entries(m4ri, C), [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(
      [m4ri.ffiM4riMatrixNrows(K), m4ri.ffiM4riMatrixNcols(K)],
      [2n, 5n],
    );
    assert.deepEqual(entries(m4ri, X), [1, 0, 0]);
    for (const id of requiredRouteIds()) {
      assert.ok(
        traces.some(([observedId, route]) =>
          observedId === id &&
          route === "receipt-backed-wasm-artifact"
        ),
        `direct generated backend did not trace ${id}`,
      );
    }
  } finally {
    for (const [value, close] of resources.toReversed()) close(value);
  }
});
