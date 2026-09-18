"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { runAggregate } = require("./row23_phase6_aggregate_root_host.cjs");

const EXPECTED_UNITS_SHA256 =
  "2f8c5f4ce98e4ccdcfcdc9cd2fc8bbaac38949093eb4aa5484af2584be9850bc";

(async () => {
  const result = await runAggregate();
  assert.equal(result.status, 0);
  assert.deepEqual(result.aggregateState, [0, 0, 0, 1]);
  assert.deepEqual(result.relationState, ["40", "450", "0", "1", "0", "40"]);
  assert.deepEqual(result.chainState, [3, 0, 0, 40]);
  assert.deepEqual(result.hnfState, [1, 10, 30, 0, 9, 3, 0, 40, 0]);
  assert.deepEqual(result.classNumber, ["6"]);
  assert.deepEqual(result.invariants, ["6"]);
  assert.deepEqual(result.norms, ["-1", "1", "1", "1"]);
  assert.equal(crypto.createHash("sha256")
    .update(JSON.stringify(result.units)).digest("hex"), EXPECTED_UNITS_SHA256);
  process.stdout.write(`${JSON.stringify(result)}\n`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
