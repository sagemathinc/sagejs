"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const fflas = require("..");
const flint = require("../../flint");

function residues(rows, columns, modulus, initialSeed) {
  let seed = BigInt(initialSeed) & ((1n << 64n) - 1n);
  const output = new BigUint64Array(rows * columns);
  for (let index = 0; index < output.length; index += 1) {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) &
      ((1n << 64n) - 1n);
    output[index] = seed % BigInt(modulus);
  }
  return output;
}

function fflasRref(source, rows, columns, modulus) {
  const output = new BigUint64Array(source.length);
  const rank = new BigUint64Array(1);
  assert.equal(fflas.ffiFflasModularFloatRref(
    output,
    rank,
    source,
    BigInt(output.length),
    1n,
    BigInt(source.length),
    BigInt(rows),
    BigInt(columns),
    BigInt(modulus),
  ), true);
  return { output, rank: rank[0] };
}

function flintRref(source, rows, columns, modulus) {
  const output = new BigUint64Array(source.length);
  const rank = flint.ffiNmodMatRref(
    output,
    source,
    BigInt(rows),
    BigInt(columns),
    BigInt(modulus),
  );
  return { output, rank };
}

function fflasRank(source, rows, columns, modulus) {
  const rank = new BigUint64Array(1);
  assert.equal(fflas.ffiFflasModularFloatRank(
    rank,
    source,
    1n,
    BigInt(source.length),
    BigInt(rows),
    BigInt(columns),
    BigInt(modulus),
  ), true);
  return rank[0];
}

function fflasRightNullspace(source, rows, columns, modulus) {
  const output = new BigUint64Array(columns * columns);
  const nullity = new BigUint64Array(1);
  assert.equal(fflas.ffiFflasModularFloatRightNullspace(
    output,
    nullity,
    source,
    BigInt(output.length),
    1n,
    BigInt(source.length),
    BigInt(rows),
    BigInt(columns),
    BigInt(modulus),
  ), true);
  return { output, nullity: nullity[0] };
}

function flintRightNullspace(source, rows, columns, modulus) {
  const output = new BigUint64Array(columns * columns);
  const nullity = flint.ffiNmodMatRightKernel(
    output,
    source,
    BigInt(rows),
    BigInt(columns),
    BigInt(modulus),
  );
  return { output, nullity };
}

test("FFLAS capability is explicit", () => {
  assert.equal(fflas.ffiFflasModularFloatAvailable(), process.platform !== "win32");
});

test("native BLAS selection is explicit and Darwin links Accelerate", {
  skip: process.platform === "win32",
}, () => {
  const prefix = join(__dirname, "..", ".native", "prefix");
  const stamp = JSON.parse(
    readFileSync(
      join(prefix, ".sagejs-fflas-dependencies.json"),
      "utf8",
    ),
  );
  assert.equal(
    stamp.blas.provider,
    process.platform === "darwin"
      ? "apple-accelerate"
      : "openblas-from-sagejs-flint",
  );
  if (process.platform !== "darwin") return;
  assert.doesNotMatch(JSON.stringify(stamp), /openblas/i);
  assert.equal(
    readFileSync(join(prefix, "lib", "Accelerate.tbd"), "utf8")
      .includes("install-name"),
    true,
  );
  assert.equal(
    readFileSync(join(prefix, "include", "cblas.h"), "utf8")
      .includes("cblas_sgemm"),
    true,
  );
  assert.equal(existsSync(join(prefix, "lib", "libopenblas.a")), false);
  assert.equal(existsSync(join(prefix, "include", "openblas_config.h")), false);

  const addon = join(
    __dirname,
    "..",
    "build",
    "generated-ffi",
    "sagejs_fflas_ffi.node",
  );
  const linked = spawnSync("otool", ["-L", addon], { encoding: "utf8" });
  assert.equal(linked.status, 0, linked.stderr);
  assert.match(linked.stdout, /Accelerate\.framework\/Versions\/A\/Accelerate/);
  assert.doesNotMatch(linked.stdout, /openblas/i);
});

test("FFPACK produces FLINT's complete canonical RREF exhaustively", {
  skip: process.platform === "win32",
}, () => {
  const shapes = [
    [0, 0], [0, 3], [3, 0], [1, 1], [1, 3], [2, 2], [2, 3], [3, 2],
  ];
  for (const [rows, columns] of shapes) {
    const count = rows * columns;
    for (let mask = 0n; mask < (1n << BigInt(count)); mask += 1n) {
      const source = new BigUint64Array(count);
      for (let index = 0; index < count; index += 1) {
        source[index] = (mask >> BigInt(index)) & 1n;
      }
      const actual = fflasRref(source, rows, columns, 2);
      const expected = flintRref(source, rows, columns, 2);
      assert.equal(actual.rank, expected.rank, `${rows}x${columns}, mask=${mask}`);
      assert.equal(fflasRank(source, rows, columns, 2), expected.rank);
      assert.deepEqual(
        [...actual.output],
        [...expected.output],
        `${rows}x${columns}, mask=${mask}`,
      );
    }
  }
});

test("FFPACK canonical RREF agrees with FLINT across primes and shapes", {
  skip: process.platform === "win32",
}, () => {
  const primes = [2, 3, 5, 7, 97, 251];
  const shapes = [[1, 9], [9, 1], [4, 7], [7, 4], [8, 8], [17, 23], [23, 17]];
  let seed = 1729;
  for (const modulus of primes) {
    for (const [rows, columns] of shapes) {
      const source = residues(rows, columns, modulus, seed++);
      if (rows >= 2) {
        source.copyWithin(columns, 0, columns);
      }
      const actual = fflasRref(source, rows, columns, modulus);
      const expected = flintRref(source, rows, columns, modulus);
      assert.equal(actual.rank, expected.rank, `${modulus}: ${rows}x${columns}`);
      assert.equal(
        fflasRank(source, rows, columns, modulus),
        expected.rank,
        `${modulus}: direct rank ${rows}x${columns}`,
      );
      assert.deepEqual(
        [...actual.output],
        [...expected.output],
        `${modulus}: ${rows}x${columns}`,
      );
    }
  }
});

test("FFPACK right nullspace is FLINT's canonical row basis", {
  skip: process.platform === "win32",
}, () => {
  const primes = [2, 3, 5, 7, 97, 251];
  const shapes = [
    [0, 0], [0, 7], [7, 0], [1, 1], [1, 7], [7, 1],
    [4, 9], [9, 4], [8, 8], [17, 23], [23, 17],
  ];
  let seed = 32452843;
  for (const modulus of primes) {
    for (const [rows, columns] of shapes) {
      const source = residues(rows, columns, modulus, seed++);
      if (rows >= 2) source.copyWithin(columns, 0, columns);
      if (rows >= 3) source.fill(0n, 2 * columns, 3 * columns);
      const actual = fflasRightNullspace(source, rows, columns, modulus);
      const expected = flintRightNullspace(source, rows, columns, modulus);
      assert.equal(
        actual.nullity,
        expected.nullity,
        `${modulus}: nullity ${rows}x${columns}`,
      );
      assert.deepEqual(
        [...actual.output],
        [...expected.output],
        `${modulus}: canonical basis ${rows}x${columns}`,
      );
      const nullity = Number(actual.nullity);
      const basis = actual.output.slice(0, nullity * columns);
      const reduced = fflasRref(basis, nullity, columns, modulus);
      assert.equal(reduced.rank, actual.nullity);
      assert.deepEqual([...reduced.output], [...basis]);
      if (rows !== 0 && nullity !== 0) {
        const basisTranspose = new BigUint64Array(columns * nullity);
        for (let row = 0; row < nullity; row += 1) {
          for (let column = 0; column < columns; column += 1) {
            basisTranspose[column * nullity + row] = basis[row * columns + column];
          }
        }
        const product = new BigUint64Array(rows * nullity);
        assert.equal(flint.ffiNmodMatMul(
          product,
          source,
          basisTranspose,
          BigInt(rows),
          BigInt(columns),
          BigInt(nullity),
          BigInt(modulus),
        ), true);
        assert.ok(product.every((value) => value === 0n));
      }
    }
  }
});

test("FFPACK right nullspace agrees exhaustively on small binary matrices", {
  skip: process.platform === "win32",
}, () => {
  const rows = 2;
  const columns = 3;
  for (let mask = 0n; mask < (1n << BigInt(rows * columns)); mask += 1n) {
    const source = new BigUint64Array(rows * columns);
    for (let index = 0; index < source.length; index += 1) {
      source[index] = (mask >> BigInt(index)) & 1n;
    }
    const actual = fflasRightNullspace(source, rows, columns, 2);
    const expected = flintRightNullspace(source, rows, columns, 2);
    assert.equal(actual.nullity, expected.nullity, `mask=${mask}`);
    assert.deepEqual([...actual.output], [...expected.output], `mask=${mask}`);
  }
});

test("FFPACK canonical bases match SageMath 10.9 fixtures", {
  skip: process.platform === "win32",
}, () => {
  const fixtures = [
    [7, 3, 5, 2, [1, 0, 1, 1, 4, 0, 1, 4, 3, 6]],
    [
      97,
      4,
      7,
      4,
      [
        1, 0, 0, 0, 82, 24, 87,
        0, 1, 0, 0, 87, 15, 91,
        0, 0, 1, 0, 91, 8, 94,
        0, 0, 0, 1, 94, 3, 96,
      ],
    ],
    [
      5,
      2,
      6,
      4,
      [
        1, 0, 0, 0, 0, 4,
        0, 1, 0, 0, 3, 2,
        0, 0, 1, 0, 3, 4,
        0, 0, 0, 1, 0, 0,
      ],
    ],
  ];
  for (const [modulus, rows, columns, nullity, expected] of fixtures) {
    const source = new BigUint64Array(rows * columns);
    for (let index = 0; index < source.length; index += 1) {
      source[index] = BigInt((29 * index * index + 17 * index + 3) % modulus);
    }
    const actual = fflasRightNullspace(source, rows, columns, modulus);
    assert.equal(actual.nullity, BigInt(nullity));
    assert.deepEqual(
      [...actual.output.slice(0, nullity * columns)],
      expected.map(BigInt),
    );
  }
});

test("FFLAS multiplication agrees with FLINT and permits output aliasing", {
  skip: process.platform === "win32",
}, () => {
  for (const modulus of [2, 7, 97, 251]) {
    const rows = 11;
    const inner = 13;
    const columns = 11;
    const left = residues(rows, inner, modulus, 104729 + modulus);
    const right = residues(inner, columns, modulus, 130363 + modulus);
    const expected = new BigUint64Array(rows * columns);
    assert.equal(flint.ffiNmodMatMul(
      expected,
      left,
      right,
      BigInt(rows),
      BigInt(inner),
      BigInt(columns),
      BigInt(modulus),
    ), true);
    const output = new BigUint64Array(rows * columns);
    assert.equal(fflas.ffiFflasModularFloatMul(
      output,
      left,
      right,
      BigInt(output.length),
      BigInt(left.length),
      BigInt(right.length),
      BigInt(rows),
      BigInt(inner),
      BigInt(columns),
      BigInt(modulus),
    ), true);
    assert.deepEqual([...output], [...expected]);

    const squareLeft = residues(rows, rows, modulus, 15485863 + modulus);
    const squareRight = residues(rows, rows, modulus, 32452843 + modulus);
    const squareExpected = new BigUint64Array(rows * rows);
    flint.ffiNmodMatMul(
      squareExpected,
      squareLeft,
      squareRight,
      BigInt(rows),
      BigInt(rows),
      BigInt(rows),
      BigInt(modulus),
    );
    assert.equal(fflas.ffiFflasModularFloatMul(
      squareLeft,
      squareLeft,
      squareRight,
      BigInt(squareLeft.length),
      BigInt(squareLeft.length),
      BigInt(squareRight.length),
      BigInt(rows),
      BigInt(rows),
      BigInt(rows),
      BigInt(modulus),
    ), true);
    assert.deepEqual([...squareLeft], [...squareExpected]);

    const rightAliasLeft = residues(rows, rows, modulus, 49979687 + modulus);
    const rightAlias = residues(rows, rows, modulus, 67867967 + modulus);
    const rightAliasExpected = new BigUint64Array(rows * rows);
    flint.ffiNmodMatMul(
      rightAliasExpected,
      rightAliasLeft,
      rightAlias,
      BigInt(rows),
      BigInt(rows),
      BigInt(rows),
      BigInt(modulus),
    );
    assert.equal(fflas.ffiFflasModularFloatMul(
      rightAlias,
      rightAliasLeft,
      rightAlias,
      BigInt(rightAlias.length),
      BigInt(rightAliasLeft.length),
      BigInt(rightAlias.length),
      BigInt(rows),
      BigInt(rows),
      BigInt(rows),
      BigInt(modulus),
    ), true);
    assert.deepEqual([...rightAlias], [...rightAliasExpected]);
  }
});

test("failed calls leave every transactional output unchanged", {
  skip: process.platform === "win32",
}, () => {
  const source = new BigUint64Array([1n, 2n, 3n, 4n]);
  for (const invoke of [
    (output, rank) => fflas.ffiFflasModularFloatRref(
      output, rank, source, 4n, 1n, 4n, 2n, 2n, 8n,
    ),
    (output, rank) => fflas.ffiFflasModularFloatRref(
      output, rank, source, 4n, 1n, 4n, 3n, 2n, 7n,
    ),
    (output, rank) => fflas.ffiFflasModularFloatRref(
      output, rank, source, 4n, 1n, 4n, 2n, 2n, 3n,
    ),
  ]) {
    const output = new BigUint64Array(4).fill(91n);
    const rank = new BigUint64Array([92n]);
    assert.throws(() => invoke(output, rank), /failed|unavailable/i);
    assert.deepEqual([...output], [91n, 91n, 91n, 91n]);
    assert.deepEqual([...rank], [92n]);
  }


  for (const invoke of [
    (output, nullity) => fflas.ffiFflasModularFloatRightNullspace(
      output, nullity, source, 4n, 1n, 4n, 2n, 2n, 8n,
    ),
    (output, nullity) => fflas.ffiFflasModularFloatRightNullspace(
      output, nullity, source, 4n, 1n, 4n, 3n, 2n, 7n,
    ),
    (output, nullity) => fflas.ffiFflasModularFloatRightNullspace(
      output, nullity, source, 4n, 1n, 4n, 2n, 2n, 3n,
    ),
  ]) {
    const output = new BigUint64Array(4).fill(81n);
    const nullity = new BigUint64Array([82n]);
    assert.throws(() => invoke(output, nullity), /failed|unavailable/i);
    assert.deepEqual([...output], [81n, 81n, 81n, 81n]);
    assert.deepEqual([...nullity], [82n]);
  }

  const multiplicationOutput = new BigUint64Array(4).fill(73n);
  assert.throws(() => fflas.ffiFflasModularFloatMul(
    multiplicationOutput,
    source,
    new BigUint64Array([1n, 0n, 0n, 7n]),
    4n,
    4n,
    4n,
    2n,
    2n,
    2n,
    7n,
  ), /failed|unavailable/i);
  assert.deepEqual([...multiplicationOutput], [73n, 73n, 73n, 73n]);

  for (const invoke of [
    (rank) => fflas.ffiFflasModularFloatRank(
      rank, source, 1n, 4n, 2n, 2n, 8n,
    ),
    (rank) => fflas.ffiFflasModularFloatRank(
      rank, source, 1n, 4n, 3n, 2n, 7n,
    ),
    (rank) => fflas.ffiFflasModularFloatRank(
      rank, source, 1n, 4n, 2n, 2n, 3n,
    ),
  ]) {
    const rank = new BigUint64Array([61n]);
    assert.throws(() => invoke(rank), /failed|unavailable/i);
    assert.deepEqual([...rank], [61n]);
  }
});
