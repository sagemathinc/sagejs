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
const oracle = require("../../../../test/data/hyperelliptic-rforest/genus3-oracle.json");

function integralCoefficients(values) {
  return new BigUint64Array(
    values.map((value) => BigInt.asUintN(64, BigInt(value))),
  );
}

function rows(batch) {
  return Array.from({ length: batch.rowCount }, (_, index) => ({
    prime: batch.primes[index],
    good: batch.good[index],
    count: batch.coefficientCounts[index],
    status: batch.rowStatus[index],
    coefficients: Array.from(
      batch.coefficients.slice(3 * index, 3 * index + 3),
    ),
  }));
}

test("rforest capability and packed residue contract is explicit", () => {
  const capability = flint.rforestCapabilities();
  assert.equal(capability.available, true);
  assert.equal(
    capability.backendVersion,
    "rforest 3103d396c67cb1685131b1f11e84975cca335bdf",
  );
  assert.equal(capability.normalization, "det(I-T*W) mod p");
  assert.deepEqual(capability.genera, [2, 3]);
  assert.equal(capability.primeUpperBound, 2n ** 31n - 1n);
  assert.equal(capability.directFallbackUpperBound, 100000n);
  assert.deepEqual(capability.statuses, {
    OK: 0,
    TRUNCATED: 1,
    UNAVAILABLE: -1,
    INVALID_ARGUMENT: -2,
    UNSUPPORTED_MODEL: -3,
    INVALID_INTERVAL: -4,
    ALLOCATION_FAILED: -5,
    INTERNAL_ERROR: -6,
    ROW_FOREST: 0,
    ROW_DIRECT: 1,
    ROW_BAD_REDUCTION: 2,
    ROW_UNSUPPORTED_CHARACTERISTIC: 3,
    ROW_RESOURCE_LIMIT: 4,
  });
});

test("genus-3 forest rows match the dense Sage oracle", () => {
  for (const [curve, data] of Object.entries(oracle.curves)) {
    const expected = oracle.records.filter((record) => record.curve === curve);
    const batch = flint.rforestHasseWittBatch(
      integralCoefficients(data.f),
      3,
      5n,
      1601n,
    );
    assert.equal(batch.status, 0, curve);
    assert.equal(batch.statusName, "ok", curve);
    assert.equal(batch.genus, 3, curve);
    assert.equal(batch.normalization, "det(I-T*W) mod p", curve);
    const byPrime = new Map(rows(batch).map((row) => [row.prime, row]));
    for (const record of expected) {
      const row = byPrime.get(BigInt(record.p));
      assert.equal(row.good, 1, `${curve} at ${record.p}`);
      assert.equal(row.count, 3, `${curve} at ${record.p}`);
      assert.deepEqual(
        row.coefficients,
        record.residues_mod_p.map(BigInt),
        `${curve} at ${record.p}`,
      );
    }
  }
});

test("genus-2 residues and exact-root factorial forests are normalized", () => {
  const ordinary = flint.rforestHasseWittBatch(
    integralCoefficients([1, 1, 0, 0, 0, 1]),
    2,
    5n,
    29n,
  );
  const expected = new Map([
    [5n, [0n, 0n, 0n]],
    [11n, [7n, 3n, 0n]],
    [19n, [15n, 14n, 0n]],
    [29n, [5n, 11n, 0n]],
  ]);
  for (const row of rows(ordinary)) {
    if (expected.has(row.prime)) {
      assert.equal(row.status, 0);
      assert.deepEqual(row.coefficients, expected.get(row.prime));
    }
  }
  const exactRoot = flint.rforestHasseWittBatch(
    integralCoefficients([0, -1, 0, 0, 0, 1]),
    2,
    17n,
    17n,
  );
  assert.deepEqual(rows(exactRoot), [{
    prime: 17n,
    good: 1,
    count: 2,
    status: 0,
    coefficients: [12n, 2n, 0n],
  }]);
});

test("exceptional, bad, characteristic-two, and truncation rows stay aligned", () => {
  const coefficients = integralCoefficients([1, 1, 0, 0, 0, 0, 0, 1]);
  const batch = flint.rforestHasseWittBatch(coefficients, 3, 2n, 7n);
  assert.deepEqual(Array.from(batch.primes), [2n, 3n, 5n, 7n]);
  assert.deepEqual(Array.from(batch.good), [0, 1, 1, 1]);
  assert.deepEqual(Array.from(batch.rowStatus), [3, 1, 0, 0]);
  assert.deepEqual(Array.from(batch.coefficientCounts), [0, 3, 3, 3]);

  const singular = flint.rforestHasseWittBatch(
    integralCoefficients([0, 0, 0, 0, 0, 0, 0, 1]),
    3,
    5n,
    5n,
  );
  assert.deepEqual(Array.from(singular.good), [0]);
  assert.deepEqual(Array.from(singular.rowStatus), [2]);

  const truncated = flint.rforestHasseWittBatch(
    coefficients,
    3,
    2n,
    101n,
    { maxRows: 3 },
  );
  assert.equal(truncated.status, 1);
  assert.equal(truncated.rowCount, 3);
  assert.equal(truncated.requiredRows, 26);
  assert.equal(truncated.truncated, true);
  assert.deepEqual(Array.from(truncated.primes), [2n, 3n, 5n]);
});

test("model, interval, and typed ingress failures are distinct", () => {
  const capability = flint.rforestCapabilities();
  assert.equal(
    flint.rforestHasseWittBatch(
      integralCoefficients([1, 1, 0, 0, 1]), 2, 5n, 7n,
    ).status,
    capability.statuses.UNSUPPORTED_MODEL,
  );
  assert.equal(
    flint.rforestHasseWittBatch(
      integralCoefficients([1, 1, 0, 0, 0, 1]), 2, 7n, 5n,
    ).status,
    capability.statuses.INVALID_INTERVAL,
  );
  assert.throws(
    () => flint.rforestHasseWittBatch([1n, 1n], 2, 5n, 7n),
    /BigUint64Array|typedarray/i,
  );
  assert.throws(
    () => flint.rforestHasseWittBatch(
      integralCoefficients([1, 1, 0, 0, 0, 1]), 2, 5, 7n,
    ),
    /expected a BigInt/,
  );
});

test("rforest and smalljac share their process-global native lock", async () => {
  const workerSource = `
    const { parentPort, workerData } = require("node:worker_threads");
    const f = require(workerData);
    const c = new BigUint64Array([1n,1n,0n,0n,0n,0n,0n,1n]);
    for (let iteration = 0; iteration < 6; iteration += 1) {
      const r = f.rforestHasseWittBatch(c, 3, 5n, 101n);
      const s = f.smalljacLpolyBatch("x^5+x+1", 5n, 101n);
      if (r.status !== 0 || s.status !== 0 || r.coefficientCounts[0] !== 3)
        throw new Error("invalid concurrent native batch");
    }
    parentPort.postMessage("ok");
  `;
  const workers = Array.from({ length: 3 }, () => new Promise((resolve, reject) => {
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
  assert.deepEqual(await Promise.all(workers), ["ok", "ok", "ok"]);
});
