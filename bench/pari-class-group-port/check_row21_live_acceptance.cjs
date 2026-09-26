#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const W0_SHA256 = "45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const readGzip = filename => JSON.parse(zlib.gunzipSync(fs.readFileSync(filename)));
function packedReal(value) {
  assert.equal(value.kind, "real");
  return [value.mantissa, String(value.precision), String(value.exponent)];
}
function integerMatrix(value) {
  assert.equal(value.kind, "matrix");
  return value.values.flatMap(column => column.values.map(entry => entry.value));
}

async function main() {
  const [preparedPath, firstHnfPath, w0Path] = process.argv.slice(2);
  assert(preparedPath && firstHnfPath && w0Path,
    "usage: check_row21_live_acceptance.cjs PREPARED.json FIRST_HNF.json.gz W0.json");
  const prepared = JSON.parse(fs.readFileSync(preparedPath));
  const firstHnfOwner = readGzip(firstHnfPath);
  const coordinator = require("./row21_acceptance_coordinator.cjs");
  const first = await coordinator.run({ prepared, firstHnfOwner,
    outputDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "row21-accept-a-")) });
  const second = await coordinator.run({ prepared, firstHnfOwner,
    outputDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "row21-accept-b-")) });
  assert.equal(first.ownerSha256, second.ownerSha256);
  assert.deepEqual(first.owner, second.owner);
  assert.equal(first.owner.provenance.frozenAnswerInputs, false);

  const latticeHost = require("./row21_live_rank3_lattice_host.cjs");
  const suffix = await latticeHost.runLiveRankThreeLattice(first.owner);
  assert.deepEqual(suffix.integerState, [5, 5, 3, 0, 0]);
  assert.deepEqual(suffix.realState, [0, 0]);
  assert.deepEqual(suffix.cleanarchState, [0, 3, 3, -183, -174, -1, -1]);
  assert.deepEqual(suffix.unitTransform,
    ["0", "0", "0", "0", "0", "1", "0", "0",
      "0", "0", "0", "0", "0", "1", "3", "1",
      "0", "0", "0", "0", "0", "-1", "1", "0"]);

  // W0 is a postcompute oracle only, opened after both owner publications and
  // the live rank-three lattice/cleanarch continuation have completed.
  const w0Bytes = fs.readFileSync(w0Path);
  assert.equal(sha(w0Bytes), W0_SHA256);
  const raw = JSON.parse(w0Bytes);
  const event = name => raw.events.find(value => value.event === name);
  const acceptance = event("acceptance"), hnf = event("hnf");
  assert(acceptance && hnf);
  assert.equal(first.owner.acceptance.classNumber, acceptance.h);
  assert.deepEqual(first.owner.acceptance.regulator, packedReal(acceptance.exactR));
  assert.deepEqual(first.owner.acceptance.relationLattice,
    integerMatrix(acceptance.lattice));
  assert.deepEqual(first.owner.hnf.C, hnf.C);
  assert.equal(first.owner.hnf.exactC.length, 7 * 4 * 32);

  const mutations = [];
  for (const [label, mutate] of [
    ["prepared", value => { value.prepared.prep_polynomial[0] = "37"; }],
    ["first-hnf", value => { value.firstHnfOwner.state.hnf[0] = "1"; }],
  ]) {
    const bad = { prepared: structuredClone(prepared),
      firstHnfOwner: structuredClone(firstHnfOwner),
      outputDirectory: fs.mkdtempSync(path.join(os.tmpdir(), `row21-accept-bad-${label}-`)) };
    mutate(bad);
    await assert.rejects(coordinator.run(bad));
    assert.deepEqual(fs.readdirSync(bad.outputDirectory), []);
    mutations.push(label);
  }
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row21-live-acceptance-check-v1",
    ownerSha256: first.ownerSha256, compressedSha256: first.compressedSha256,
    analyticState: first.owner.analytic.state,
    catalogState: first.owner.analytic.catalogState,
    postHnfState: first.owner.acceptance.postHnfState,
    multipleState: first.owner.acceptance.multipleState,
    acceptanceState: first.owner.acceptance.state,
    reconstructionState: first.owner.acceptance.reconstructionState,
    classNumber: first.owner.acceptance.classNumber,
    regulator: first.owner.acceptance.regulator,
    latticeEntries: first.owner.acceptance.relationLattice.length,
    suffix: { integerState: suffix.integerState, realState: suffix.realState,
      cleanarchState: suffix.cleanarchState, unitTransform: suffix.unitTransform },
    mutationsRejected: mutations,
  })}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
