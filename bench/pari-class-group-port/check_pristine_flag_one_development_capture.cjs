#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const capture = require("./capture_pristine_flag_one_development.cjs");

const ROW = 21;
const COMMITTED = path.join(__dirname,
  "pristine-row21-flag-one-development-authority.json");
const DEFAULT_PREPARED = "/scratch/sagejs-pari-fresh-prepared-corpus-v1/" +
  "prepared-row-21-f33a1c37bb9f7bcafbe20a0e22b0c0434a29070843fa98e90ea3368db2302397.json";

function clone(value) { return structuredClone(value); }

function checkMutation(authority, preparedPath, mutate, pattern) {
  const changed = clone(authority);
  mutate(changed);
  assert.throws(() => capture.validateAuthority(changed,
    { panelIndex: ROW, preparedPath }), pattern);
}

function main(preparedPath = DEFAULT_PREPARED) {
  assert(fs.existsSync(preparedPath),
    "row-21 prepared authority is unavailable; pass its exact path as argv[2]");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-check-pristine-development-flag-one-"));
  try {
    const committed = capture.validateAuthorityFile(COMMITTED,
      { panelIndex: ROW, preparedPath });
    assert.equal(committed.authoritySha256,
      "7b0dcc3a6c86cc520f365b3b697559ae6227115fc59f17a29634cc897ac414ff");
    const first = path.join(temporary, "first.json");
    const second = path.join(temporary, "second.json");
    const firstCapture = capture.capture({ panelIndex: ROW, preparedPath, output: first });
    const secondCapture = capture.capture({ panelIndex: ROW, preparedPath, output: second });
    assert.deepEqual(firstCapture, { ...secondCapture, output: firstCapture.output });
    assert(fs.readFileSync(first).equals(fs.readFileSync(second)),
      "two cold captures were not byte-identical");
    assert(fs.readFileSync(first).equals(fs.readFileSync(COMMITTED)),
      "fresh capture differs from the committed immutable authority");
    const checked = capture.validateAuthorityFile(first,
      { panelIndex: ROW, preparedPath });
    assert.equal(checked.authoritySha256, firstCapture.sha256);
    assert.equal(checked.outputDigest, firstCapture.outputDigest);
    assert.equal(checked.authority.execution.measurements.length, 0);
    assert.equal(checked.authority.run.call.timed, false);
    assert.equal(checked.authority.input.fieldId, "5.3.1009349859375.3");
    assert.deepEqual(checked.authority.output.classGroup,
      { classNumber: "1", invariantFactors: [] });
    assert.deepEqual(checked.authority.output.unitGroup,
      { materialization: "exact_units", rank: "3", torsionOrder: "2" });

    checkMutation(checked.authority, preparedPath,
      value => { value.input.preparedAuthoritySha256 = "0".repeat(64); },
      /preparedAuthoritySha256/);
    checkMutation(checked.authority, preparedPath,
      value => { value.run.call.timed = true; }, /timed/);
    checkMutation(checked.authority, preparedPath,
      value => { value.execution.measurements.push("forbidden"); }, /measurements/);
    checkMutation(checked.authority, preparedPath,
      value => { value.output.classGroup.classNumber = "2"; }, /deep-equal/);
    checkMutation(checked.authority, preparedPath,
      value => { value.provenance.producerSourceSha256 = "0".repeat(64); },
      /strictly equal/);

    assert.throws(() => capture.selectDevelopment(2, preparedPath),
      /not in the compact development population/);
    const mutablePrepared = path.join(temporary, "mutable-prepared.json");
    fs.copyFileSync(preparedPath, mutablePrepared);
    fs.chmodSync(mutablePrepared, 0o644);
    assert.throws(() => capture.selectDevelopment(ROW, mutablePrepared),
      /immutable mode-0444/);

    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.pari-class-group/pristine-development-flag-one-capture-check-v1",
      panelIndex: ROW,
      fieldId: checked.authority.input.fieldId,
      authoritySha256: checked.authoritySha256,
      outputDigest: checked.outputDigest,
      coldCaptures: 2,
      byteIdentical: true,
      timed: false,
      measurements: 0,
      reserveOpened: false,
      mutationRejections: 7,
    })}\n`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try { main(process.argv[2] || DEFAULT_PREPARED); }
  catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { COMMITTED, DEFAULT_PREPARED, ROW, main };
