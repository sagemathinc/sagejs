"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isMainThread,
  parentPort,
  Worker,
} = require("node:worker_threads");

const rankCases = [
  [[0n, 1n, 1n, -2n, 0n], 2],
  [[1n, 0n, 0n, 0n, 1n], 2],
  [[1n, -1n, 0n, -4n, 4n], 2],
  [[0n, 0n, 1n, -7n, 6n], 3],
  [[0n, 0n, 1n, -1n, 6n], 3],
  [[0n, 0n, 1n, -49n, 132n], 3],
  [[0n, 1n, 1n, -72n, 210n], 4],
  [[0n, 0n, 1n, -7n, 36n], 4],
  [[1n, 0n, 0n, -202n, 1089n], 4],
  [[0n, 0n, 1n, -79n, 342n], 5],
  [[0n, 0n, 1n, -169n, 930n], 5],
  [[0n, 1n, 1n, -30n, 390n], 5],
  [[0n, 0n, 1n, -547n, -2934n], 6],
  [[0n, 0n, 0n, -9907n, 306370n], 6],
  [[0n, 0n, 1n, -277n, 4566n], 6],
  [[0n, 0n, 0n, -9217n, 300985n], 7],
  [[0n, 1n, 0n, -5945n, 583879n], 7],
  [[0n, 0n, 0n, -6544n, 7375129n], 8],
  [[0n, 1n, 0n, 9910n, 9815689n], 8],
  [[0n, 0n, 0n, -6112n, 12325825n], 8],
  [[
    1n,
    0n,
    1n,
    34318214642441646362435632562579908747n,
    3184376895814127197244886284686214848599453811643486936756n,
  ], 15],
];

function loadFlint() {
  return process.env.SAGEJS_FLINT_TEST_DIRECT_ADDON === "1"
    ? require("../build/Release/sagejs_flint.node")
    : require("..");
}

function rankData(flint, coefficients, saturate = false) {
  return flint.ecRankData(
    ...coefficients.flatMap((value) => [value, 1n]),
    saturate,
  );
}

function pointIsOnCurve(coefficients, [x, y, z]) {
  const [a1, a2, a3, a4, a6] = coefficients;
  return y * y * z + a1 * x * y * z + a3 * y * z * z ===
    x * x * x + a2 * x * x * z + a4 * x * z * z + a6 * z * z * z;
}

if (!isMainThread) {
  const flint = loadFlint();
  const results = [];
  for (let repeat = 0; repeat < 3; repeat += 1) {
    for (const index of [0, 3, 0]) {
      const [coefficients, expectedRank] = rankCases[index];
      const data = rankData(flint, coefficients);
      results.push([
        data.rankLowerBound,
        data.rankUpperBound,
        data.twoSelmerRank,
        data.foundPoints.length,
        expectedRank,
      ]);
    }
  }
  parentPort.postMessage(results);
} else {
  const flint = loadFlint();

  test("FLINT eclib port passes upstream tmrank-short", () => {
    for (const [coefficients, expectedRank] of rankCases) {
      const data = rankData(flint, coefficients);
      assert.equal(data.success, true);
      assert.equal(data.certain, true);
      assert.equal(data.rankLowerBound, expectedRank);
      assert.equal(data.rankUpperBound, expectedRank);
      assert.equal(data.foundPoints.length, expectedRank);
      for (const point of data.foundPoints) {
        assert.equal(pointIsOnCurve(coefficients, point), true);
      }
    }
  });

  test("rank, 2-Selmer rank, and generators match upstream eclib", () => {
    assert.deepEqual(rankData(flint, [0n, 1n, 1n, -2n, 0n]), {
      success: true,
      certain: true,
      rankLowerBound: 2,
      rankUpperBound: 2,
      twoSelmerRank: 2,
      foundPoints: [[0n, -1n, 1n], [-1n, 1n, 1n]],
      saturationAttempted: false,
      saturationProven: false,
      saturationIndex: 0,
      unsaturatedPrimes: [],
      generators: [[0n, -1n, 1n], [-1n, 1n, 1n]],
    });
    assert.deepEqual(rankData(flint, [0n, 0n, 1n, -7n, 6n]), {
      success: true,
      certain: true,
      rankLowerBound: 3,
      rankUpperBound: 3,
      twoSelmerRank: 3,
      foundPoints: [[1n, -1n, 1n], [-2n, 3n, 1n], [-14n, 25n, 8n]],
      saturationAttempted: false,
      saturationProven: false,
      saturationIndex: 0,
      unsaturatedPrimes: [],
      generators: [[1n, -1n, 1n], [-2n, 3n, 1n], [-14n, 25n, 8n]],
    });
    assert.deepEqual(rankData(flint, [0n, 0n, 0n, -1n, 0n]), {
      success: true,
      certain: true,
      rankLowerBound: 0,
      rankUpperBound: 0,
      twoSelmerRank: 2,
      foundPoints: [],
      saturationAttempted: false,
      saturationProven: true,
      saturationIndex: 1,
      unsaturatedPrimes: [],
      generators: [],
    });
    const highRank = rankData(flint, rankCases.at(-1)[0]);
    assert.equal(highRank.twoSelmerRank, 16);
    assert.equal(highRank.foundPoints.length, 15);
  });

  test("automatic saturation reports a proven Mordell-Weil basis", () => {
    const data = rankData(flint, [1n, -1n, 0n, -18n, 4n], true);
    assert.equal(data.saturationAttempted, true);
    assert.equal(data.saturationProven, true);
    assert.equal(data.saturationIndex, 1);
    assert.deepEqual(data.unsaturatedPrimes, []);
    assert.deepEqual(data.foundPoints, [[-26n, 49n, 8n]]);
    assert.deepEqual(data.generators, [[-1n, 5n, 1n]]);
  });

  test("modulus state is isolated across repeated and concurrent descents", async () => {
    const workers = Array.from({ length: 4 }, () => new Worker(__filename));
    const allResults = await Promise.all(workers.map((worker) =>
      new Promise((resolve, reject) => {
        worker.once("message", resolve);
        worker.once("error", reject);
        worker.once("exit", (code) => {
          if (code !== 0) reject(new Error(`rank worker exited with ${code}`));
        });
      })));
    for (const results of allResults) {
      for (const [lower, upper, selmer, points, expected] of results) {
        assert.deepEqual([lower, upper, selmer, points], [
          expected,
          expected,
          expected,
          expected,
        ]);
      }
    }
  });

  test("rank adapter validates its exact boundary", () => {
    assert.throws(() => flint.ecRankData(), /ten BigInts and one boolean/);
    assert.throws(
      () => flint.ecRankData(...Array.from({ length: 10 }, () => 0), false),
      /BigInts/,
    );
    assert.throws(
      () => flint.ecRankData(...Array.from({ length: 10 }, () => 0n), false),
      /denominator is zero/,
    );
    assert.throws(
      () => flint.ecRankData(...Array.from({ length: 10 }, () => 1n), 0),
      /saturation flag/,
    );
  });
}
