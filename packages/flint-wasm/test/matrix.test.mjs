import assert from "node:assert/strict";
import test from "node:test";

import { createPortableMatrixBackend } from "../portable-matrix.mjs";

const matrix = createPortableMatrixBackend();

test("generates deterministic modular matrices in bulk", () => {
  const finite = matrix.nmodMatrixRandom(3, 4, 7n, 2026n, 31415n);
  assert.deepEqual(
    finite.entries,
    matrix.nmodMatrixRandom(3, 4, 7n, 2026n, 31415n).entries,
  );
  assert.equal(
    finite.entries.every((entry) => 0n <= entry && entry < 7n),
    true,
  );
  const residue = matrix.zmodMatrixRandom(2, 3, 36n, 9n, 10n);
  assert.equal(residue.kind, "ZMOD");
  assert.equal(residue.entries.length, 6);
});

test("provides the exact matrix backend contract without native code", () => {
  const value = matrix.zzMatrix(2, 2, [1n, 2n, 3n, 4n]);
  assert.equal(matrix.matrixEntry(value, 0, 1), 2n);
  assert.equal(matrix.matrixDet(value), -2n);
  assert.equal(matrix.matrixRank(value), 2);
  assert.deepEqual(matrix.matrixEntry(matrix.matrixRref(value), 0, 0), {
    numerator: 1n,
    denominator: 1n,
  });
  const hermite = matrix.matrixHermite(value);
  assert.deepEqual(
    [0, 1, 2, 3].map((index) =>
      matrix.matrixEntry(
        hermite,
        Math.floor(index / 2),
        index % 2,
      ),
    ),
    [1n, 0n, 0n, 2n],
  );
  const [transformedHermite, hermiteTransform] =
    matrix.matrixHermiteTransform(value);
  assert.equal(
    matrix.matrixEqual(
      matrix.matrixMul(hermiteTransform, value),
      transformedHermite,
    ),
    true,
  );
  const [smith, smithLeft, smithRight] = matrix.matrixSmith(value);
  assert.deepEqual(
    [0, 1, 2, 3].map((index) =>
      matrix.matrixEntry(
        smith,
        Math.floor(index / 2),
        index % 2,
      ),
    ),
    [1n, 0n, 0n, 2n],
  );
  assert.equal(
    matrix.matrixEqual(
      matrix.matrixMul(
        matrix.matrixMul(smithLeft, value),
        smithRight,
      ),
      smith,
    ),
    true,
  );
  assert.deepEqual(
    matrix.matrixCharpoly(value),
    [-2n, -5n, 1n],
  );
  const dependent = matrix.zzMatrix(
    2,
    3,
    [1n, 2n, 3n, 2n, 4n, 6n],
  );
  const rectangular = matrix.zzMatrix(
    3,
    2,
    [0n, 1n, 2n, 3n, 4n, 5n],
  );
  const [rectangularSmith, rectangularLeft, rectangularRight] =
    matrix.matrixSmith(rectangular);
  assert.equal(
    matrix.matrixEqual(
      matrix.matrixMul(
        matrix.matrixMul(rectangularLeft, rectangular),
        rectangularRight,
      ),
      rectangularSmith,
    ),
    true,
  );
  const kernel = matrix.matrixRightKernel(dependent);
  assert.deepEqual(
    Array.from({ length: 6 }, (_, index) =>
      matrix.matrixEntry(
        kernel,
        Math.floor(index / 3),
        index % 3,
      ),
    ),
    [1n, 1n, -1n, 0n, 3n, -2n],
  );

  const square = matrix.matrixMul(value, value);
  assert.deepEqual(
    [0, 1, 2, 3].map((index) =>
      matrix.matrixEntry(
        square,
        Math.floor(index / 2),
        index % 2,
      ),
    ),
    [7n, 10n, 15n, 22n],
  );
  assert.deepEqual(
    matrix.matrixEntry(matrix.matrixInverse(value), 1, 0),
    { numerator: 3n, denominator: 2n },
  );
});

test("uses fraction-free integer determinants at arbitrary precision", () => {
  const huge = 2n ** 500n + 123n;
  const value = matrix.zzMatrix(2, 2, [huge, 1n, 1n, huge]);
  assert.equal(matrix.matrixDet(value), huge ** 2n - 1n);
});

test("solves rational systems exactly and rejects singular matrices", () => {
  const left = matrix.qqMatrix(2, 2, [
    [1n, 2n],
    [1n, 3n],
    [2n, 5n],
    [3n, 7n],
  ]);
  const right = matrix.zzMatrix(2, 1, [1n, 0n]);
  const solution = matrix.matrixSolve(left, right);
  const kernel = matrix.matrixRightKernel(
    matrix.qqMatrix(1, 3, [
      [1n, 1n],
      [2n, 1n],
      [3n, 1n],
    ]),
  );
  assert.deepEqual(matrix.matrixEntry(kernel, 0, 2), {
    numerator: -1n,
    denominator: 3n,
  });
  assert.deepEqual(matrix.matrixCharpoly(left), [
    { numerator: 17n, denominator: 210n },
    { numerator: -13n, denominator: 14n },
    { numerator: 1n, denominator: 1n },
  ]);
  assert.deepEqual(matrix.matrixEntry(solution, 0, 0), {
    numerator: 90n,
    denominator: 17n,
  });
  assert.deepEqual(matrix.matrixEntry(solution, 1, 0), {
    numerator: -84n,
    denominator: 17n,
  });
  assert.throws(
    () =>
      matrix.matrixInverse(
        matrix.zzMatrix(2, 2, [1n, 2n, 2n, 4n]),
      ),
    /singular/,
  );
});

test("selects matrix coordinates used by modular-symbol subspaces", () => {
  const source = matrix.zzMatrix(
    3, 4,
    [1n, 0n, 2n, 0n, 0n, 1n, 3n, 4n, 0n, 0n, 0n, 0n],
  );
  assert.deepEqual(matrix.matrixPivots(matrix.matrixRref(source)), [0, 1]);
  assert.deepEqual(
    matrix.matrixSelectRows(source, [1, 0]).entries,
    [0n, 1n, 3n, 4n, 1n, 0n, 2n, 0n],
  );
  assert.deepEqual(
    matrix.matrixSelectColumns(source, [3, 1]).entries,
    [0n, 0n, 4n, 1n, 0n, 0n],
  );
  const left = matrix.zzMatrix(1, 3, [1n, 0n, -1n]);
  assert.deepEqual(
    matrix.matrixSparseLeftMul(left, source).entries,
    [1n, 0n, 2n, 0n],
  );
});
