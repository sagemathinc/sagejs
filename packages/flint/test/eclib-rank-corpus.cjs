"use strict";

const assert = require("node:assert/strict");
const { availableParallelism } = require("node:os");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} = require("node:worker_threads");

const oracle = JSON.parse(
  readFileSync(join(__dirname, "eclib-rank-oracle.json"), "utf8")
);

function pointIsOnCurve(coefficients, [x, y, z]) {
  const [a1, a2, a3, a4, a6] = coefficients;
  return y * y * z + a1 * x * y * z + a3 * y * z * z ===
    x * x * x + a2 * x * x * z + a4 * x * z * z + a6 * z * z * z;
}

function checkCases(workerIndex, workerCount) {
  const flint = require("..");
  let checked = 0;
  for (let index = workerIndex; index < oracle.cases.length; index += workerCount) {
    const expected = oracle.cases[index];
    const coefficients = expected.ainvs.map(BigInt);
    const actual = flint.ecRankData(
      ...coefficients.flatMap((value) => [value, 1n]),
      false,
    );
    assert.equal(actual.success, true, expected.label);
    assert.equal(actual.rankLowerBound, expected.rankLowerBound, expected.label);
    assert.equal(actual.rankUpperBound, expected.rankUpperBound, expected.label);
    assert.equal(actual.twoSelmerRank, expected.twoSelmerRank, expected.label);
    assert.equal(actual.certain, true, expected.label);
    assert.equal(
      actual.foundPoints.length,
      expected.foundPoints.length,
      expected.label,
    );
    for (const point of expected.foundPoints) {
      assert.equal(
        pointIsOnCurve(coefficients, point.map(BigInt)),
        true,
        expected.label + " upstream point",
      );
    }
    for (const point of actual.foundPoints) {
      assert.equal(pointIsOnCurve(coefficients, point), true, expected.label);
    }
    checked += 1;
  }
  return checked;
}

if (!isMainThread) {
  parentPort.postMessage(checkCases(workerData.index, workerData.count));
} else {
  test("FLINT port matches 1024 upstream eclib/ecdata rank cases", async () => {
    assert.equal(oracle.schema, 1);
    assert.equal(oracle.cases.length, 1024);
    const count = Math.min(4, availableParallelism?.() || 2);
    const workers = Array.from(
      { length: count },
      (_, index) => new Worker(__filename, { workerData: { index, count } }),
    );
    const checked = await Promise.all(workers.map((worker) =>
      new Promise((resolve, reject) => {
        worker.once("message", resolve);
        worker.once("error", reject);
        worker.once("exit", (code) => {
          if (code !== 0) reject(new Error("corpus worker exited with " + code));
        });
      })));
    assert.equal(checked.reduce((sum, value) => sum + value, 0), 1024);
  });
}
