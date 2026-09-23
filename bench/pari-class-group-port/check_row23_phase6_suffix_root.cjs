"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { runSuffix } = require("./row23_phase6_suffix_root_host.cjs");

const EXPECTED_UNITS_SHA256 =
  "2f8c5f4ce98e4ccdcfcdc9cd2fc8bbaac38949093eb4aa5484af2584be9850bc";

(async () => {
  const result = await runSuffix();
  assert.equal(result.status, 0);
  assert.deepEqual(result.classNumber, ["6"]);
  assert.deepEqual(result.invariants, ["6"]);
  assert.deepEqual(result.norms, ["-1", "1", "1", "1"]);
  assert.equal(crypto.createHash("sha256")
    .update(JSON.stringify(result.units)).digest("hex"), EXPECTED_UNITS_SHA256);
  assert.equal(result.state[0], 0);
  const { owners: _owners, ...published } = result;
  process.stdout.write(`${JSON.stringify(published)}\n`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
