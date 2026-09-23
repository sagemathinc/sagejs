#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");

const host = require("./row13_phase6_resident_kernel_host.cjs");
const authentication = require("./prepared_nf_authentication.cjs");

const DEFAULT_INPUT =
  "/scratch/sagejs-pari-fresh-prepared-corpus-v1/prepared-row-13-762c9bf8c75e6bba7727c41f457b992e05fecf256c3ed40aaa6c45814ff0a95c.json";
const EXPECTED_CLASS_GENERATOR = ["5351", "2124", "2744", "1786", "0",
  "1", "0", "0", "0", "0", "1", "0", "0", "0", "0", "1"];

function validateProjection(projection) {
  assert.equal(projection.field.id, host.FIELD_ID);
  assert.deepEqual(projection.classGroup.invariantFactors, ["2"]);
  assert.equal(projection.classGroup.classNumber, "2");
  assert.equal(projection.classGroup.generatorIdeals.length, 1);
  assert.equal(projection.classGroup.generatorIdeals[0].length, 16);
  assert.equal(projection.unitGroup.rank, "2");
  assert.equal(projection.unitGroup.regulator.length, 3);
  assert.equal(projection.unitGroup.torsionOrder, "2");
  assert.equal(projection.unitGroup.materialization, "not_given(LARGE)");
  return true;
}

async function main(inputPath = DEFAULT_INPUT) {
  const prepared = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  assert.equal(authentication.authenticatePreparedNf(prepared).sha256,
    host.EXPECTED_AUTHORITY);
  const changed = structuredClone(prepared);
  changed.prep_polynomial[0] = String(BigInt(changed.prep_polynomial[0]) + 1n);
  assert.throws(() => authentication.authenticatePreparedNf(changed));

  const resident = await host.prepareResident(prepared);
  const sample = await host.runResident(resident);
  validateProjection(sample.projection);
  assert.equal(sample.post1006.status, 0);
  assert.equal(sample.post1006.classNumber, "2");
  assert.deepEqual(sample.post1006.invariants, ["2"]);
  assert.deepEqual(sample.units.regulator.map(String),
    sample.post1006.regulator.map(String));
  assert.equal(sample.units.getfuState[0], 2);
  assert.equal(sample.units.getfuState[7], 1);

  assert.deepEqual(sample.klass.generatorIdeals[0], EXPECTED_CLASS_GENERATOR);

  let mutationsRejected = 0;
  for (const mutate of [
    value => { value.classGroup.classNumber = "3"; },
    value => { value.classGroup.invariantFactors = ["3"]; },
    value => { value.classGroup.generatorIdeals[0][0] = "0"; },
    value => { value.unitGroup.regulator = ["0", "1", "0"]; },
  ]) {
    const candidate = structuredClone(sample.projection); mutate(candidate);
    assert.throws(() => {
      validateProjection(candidate);
      assert.deepEqual(candidate, sample.projection);
    });
    mutationsRejected += 1;
  }
  const output = { schema:
      "sagejs.pari-class-group/row13-phase6-resident-kernel-check-v1",
    freshPreparedAuthenticated: true, changedPreparedInputRejected: true,
    exactRelationTransformsAuthenticated: true, mutationsRejected,
    kernelNanoseconds: sample.kernelNanoseconds,
    stageNanoseconds: sample.stageNanoseconds, maxRssKiB: sample.maxRssKiB,
    projection: sample.projection, executionBoundary: sample.executionBoundary };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output;
}

if (require.main === module) main(process.argv[2]).catch(error => {
  console.error(error); process.exitCode = 1;
});
module.exports = { DEFAULT_INPUT, main, validateProjection };
