"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const test = require("node:test");
const { Worker } = require("node:worker_threads");

const addonPath = join(
  __dirname,
  "..",
  "..",
  "build",
  "Release",
  "sagejs_flint.node",
);
const flint = require(addonPath);

const models = [
  {
    curve: "x^5+x+1",
    expected: new Map([
      [5n, [0n, 10n]],
      [11n, [-4n, 14n]],
      [19n, [-4n, 14n]],
      [29n, [5n, 40n]],
    ]),
  },
  {
    curve: "x^6+x+1",
    expected: new Map([
      [5n, [0n, 5n]],
      [11n, [7n, 28n]],
      [19n, [-2n, 10n]],
      [29n, [-1n, -36n]],
    ]),
  },
  {
    curve: "[x^5+x+1,x]",
    expected: new Map([
      [5n, [-1n, 5n]],
      [11n, [0n, -2n]],
      [19n, [6n, 38n]],
      [29n, [-6n, 58n]],
    ]),
  },
  {
    curve: "2*x^5+x+1",
    expected: new Map([
      [5n, [0n, 0n]],
      [11n, [1n, 2n]],
      [19n, [11n, 63n]],
      [29n, [3n, 39n]],
    ]),
  },
  {
    curve: "2*x^6+x+1",
    expected: new Map([
      [5n, [0n, -5n]],
      [11n, [-2n, -3n]],
      [19n, [-7n, 39n]],
      [29n, [-1n, -2n]],
    ]),
  },
  {
    curve: "-x^5+x+1",
    expected: new Map([
      [5n, [5n, 15n]],
      [11n, [7n, 31n]],
      [29n, [8n, 44n]],
    ]),
    bad: new Set([19n]),
  },
  {
    curve: "-x^6+x+1",
    expected: new Map([
      [5n, [5n, 15n]],
      [11n, [4n, 17n]],
      [19n, [-5n, 15n]],
      [29n, [-6n, 50n]],
    ]),
  },
];

function rows(batch) {
  return Array.from({ length: batch.rowCount }, (_, index) => ({
    prime: batch.primes[index],
    good: batch.good[index],
    count: batch.coefficientCounts[index],
    status: batch.rowStatus[index],
    coefficients: Array.from(
      batch.coefficients.slice(2 * index, 2 * index + 2),
    ),
  }));
}

test("genus-2 smalljac capability and status contract is explicit", () => {
  const capability = flint.smalljacCapabilities();
  assert.equal(capability.available, true);
  assert.equal(capability.backendVersion, "smalljac version 4.1.3");
  assert.equal(capability.normalization, "det(1-T*Frob)");
  assert.equal(capability.maxGenus, 2);
  assert.deepEqual(capability.fullLpolynomialGenus, [2]);
  assert.deepEqual(capability.groupStructureGenus, [2]);
  assert.equal(capability.groupRequiresOddDegree, true);
  assert.deepEqual(capability.primeUpperBounds, {
    lpolynomial: 2n ** 32n - 1n,
    groupStructure: 2n ** 30n - 1n,
  });
  assert.deepEqual(capability.statuses, {
    OK: 0,
    TRUNCATED: 1,
    UNAVAILABLE: -1,
    INVALID_ARGUMENT: -2,
    PARSE_ERROR: -3,
    UNSUPPORTED_CURVE: -4,
    SINGULAR_CURVE: -5,
    INVALID_INTERVAL: -6,
    ALLOCATION_FAILED: -7,
    CALLBACK_CANCELLED: -8,
    COEFFICIENT_RANGE: -9,
    INTERNAL_ERROR: -10,
    ROW_GOOD: 0,
    ROW_BAD_REDUCTION: 1,
  });
});

test("integral genus-2 grammars return complete coefficient streams", () => {
  for (const { curve, expected, bad = new Set() } of models) {
    const batch = flint.smalljacLpolyBatch(curve, 2n, 29n);
    assert.equal(batch.status, 0, curve);
    assert.equal(batch.statusName, "ok", curve);
    assert.equal(batch.genus, 2, curve);
    assert.equal(batch.normalization, "det(1-T*Frob)", curve);
    assert.equal(batch.rowCount, 10, curve);
    assert.equal(batch.requiredRows, 10, curve);
    assert.equal(batch.truncated, false, curve);
    for (const row of rows(batch)) {
      assert.equal(row.status, row.good ? 0 : 1, `${curve} at ${row.prime}`);
      assert.equal(row.count, row.good ? 2 : 0, `${curve} at ${row.prime}`);
      if (expected.has(row.prime)) {
        assert.equal(row.good, 1, `${curve} at ${row.prime}`);
        assert.deepEqual(
          row.coefficients,
          expected.get(row.prime),
          `${curve} at ${row.prime}`,
        );
      }
      if (bad.has(row.prime)) {
        assert.equal(row.good, 0, `${curve} at ${row.prime}`);
        assert.equal(row.count, 0, `${curve} at ${row.prime}`);
        assert.deepEqual(row.coefficients, [0n, 0n], `${curve} at ${row.prime}`);
      }
    }
  }
});

test("bad rows remain aligned and maxRows reports exact truncation", () => {
  const batch = flint.smalljacLpolyBatch("x^5+x+1", 2n, 31n, {
    maxRows: 3,
  });
  assert.equal(batch.status, 1);
  assert.equal(batch.statusName, "truncated");
  assert.equal(batch.rowCount, 3);
  assert.equal(batch.requiredRows, 11);
  assert.equal(batch.truncated, true);
  assert.deepEqual(Array.from(batch.primes), [2n, 3n, 5n]);
  assert.deepEqual(Array.from(batch.good), [0, 0, 1]);
  assert.deepEqual(Array.from(batch.coefficientCounts), [0, 0, 2]);
  assert.deepEqual(Array.from(batch.coefficients), [0n, 0n, 0n, 0n, 0n, 10n]);
  assert.deepEqual(Array.from(batch.rowStatus), [1, 1, 0]);
});

test("parse, genus, singularity, and interval failures are distinct", () => {
  assert.equal(
    flint.smalljacLpolyBatch(" ", 2n, 7n).status,
    flint.smalljacCapabilities().statuses.PARSE_ERROR,
  );
  assert.equal(
    flint.smalljacLpolyBatch("x^7+x+1", 2n, 7n).status,
    flint.smalljacCapabilities().statuses.UNSUPPORTED_CURVE,
  );
  assert.equal(
    flint.smalljacLpolyBatch("x^5", 2n, 7n).status,
    flint.smalljacCapabilities().statuses.SINGULAR_CURVE,
  );
  assert.equal(
    flint.smalljacLpolyBatch("x^5+x+1", 1n, 7n).status,
    flint.smalljacCapabilities().statuses.INVALID_ARGUMENT,
  );
  assert.equal(
    flint.smalljacLpolyBatch("x^5+x+1", 2n, 2n ** 32n).status,
    flint.smalljacCapabilities().statuses.INVALID_INTERVAL,
  );
  assert.throws(
    () => flint.smalljacLpolyBatch("x^5+x+1", 2, 7n),
    /expected a BigInt/,
  );
  assert.throws(
    () => flint.smalljacLpolyBatch("x^5+x+1\0", 2n, 7n),
    /embedded NUL/,
  );
});

test("odd-degree group invariants multiply to Lp(1)", () => {
  const curve = "x^5+x+1";
  const lpolys = flint.smalljacLpolyBatch(curve, 5n, 31n);
  const groups = flint.smalljacGroupBatch(curve, 5n, 31n);
  assert.equal(groups.status, 0);
  assert.deepEqual(Array.from(groups.primes), Array.from(lpolys.primes));
  assert.deepEqual(Array.from(groups.good), Array.from(lpolys.good));
  for (let index = 0; index < groups.rowCount; index += 1) {
    const begin = groups.invariantOffsets[index];
    const end = groups.invariantOffsets[index + 1];
    const invariants = Array.from(groups.invariants.slice(begin, end));
    assert.equal(invariants.length, groups.invariantCounts[index]);
    if (!groups.good[index]) {
      assert.deepEqual(invariants, []);
      continue;
    }
    for (let factor = 1; factor < invariants.length; factor += 1) {
      assert.equal(invariants[factor] % invariants[factor - 1], 0n);
    }
    const p = groups.primes[index];
    const c1 = lpolys.coefficients[2 * index];
    const c2 = lpolys.coefficients[2 * index + 1];
    const order = 1n + c1 + c2 + p * c1 + p * p;
    assert.equal(
      invariants.reduce((product, value) => product * value, 1n),
      order,
      `group order at ${p}`,
    );
  }
  assert.equal(
    flint.smalljacGroupBatch("x^6+x+1", 5n, 11n).status,
    flint.smalljacCapabilities().statuses.UNSUPPORTED_CURVE,
  );
});

test("elliptic and genus-2 calls safely share process-global ffpoly state", async () => {
  const workerSource = `
    const { parentPort, workerData } = require("node:worker_threads");
    const f = require(workerData);
    for (let iteration = 0; iteration < 8; iteration += 1) {
      const b = f.smalljacLpolyBatch("x^5+x+1", 5n, 101n);
      if (b.status !== 0 || b.coefficientCounts[0] !== 2) {
        throw new Error("invalid genus-2 batch");
      }
      if (f.ecApIntegral(0n, 0n, 1n, -1n, 0n, 5n) !== -2) {
        throw new Error("invalid elliptic trace");
      }
    }
    parentPort.postMessage("ok");
  `;
  const workers = Array.from({ length: 4 }, () => new Promise((resolve, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: addonPath,
    });
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`worker exited with ${code}`));
    });
  }));
  assert.deepEqual(await Promise.all(workers), ["ok", "ok", "ok", "ok"]);
});
