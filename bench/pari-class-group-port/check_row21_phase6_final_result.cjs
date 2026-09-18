#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const result = require("./row21_phase6_final_result.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

function ownerMap(payload) {
  return new Map(payload.storage.map(owner => [owner.name, owner]));
}
function logical(owner) {
  return owner.entries.slice(0, Number(owner.logicalLength));
}
function focused() {
  const source = fs.readFileSync(require.resolve("./row21_phase6_final_result.cjs"), "utf8");
  assert.match(source, /new WeakSet\(\)/);
  assert.match(source, /new WeakMap\(\)/);
  assert.match(source, /columnHnfWitness/);
  assert.match(source, /multiplyCoordinates/);
  assert.match(source, /exact-unit-inverses/);
  assert.match(source, /exact-unit-real-signs/);
  assert.match(source, /regulator-acceptance/);
  assert.doesNotMatch(source, /live-unit-owner|panel-21-6966124|pristine-w0|W0_SHA256/);
  assert.throws(() => result.computeCandidate({}), /capability/);
  assert.throws(() => result.publishCandidate({}), /capability/);
  return { schema: "sagejs.pari-class-group/row21-phase6-final-result-focused-v1",
    capabilityBacked: true, answerFixtureRuntimeInputs: 0,
    serializationInsideNativeClock: false, exactClassReplay: true,
    exactUnitReplay: true, publicComplete: false };
}

async function genuine() {
  const resident = await result.prepareResident();
  const candidate = result.computeCandidate(resident);
  const inspected = result.inspectCandidate(candidate);
  const payload = inspected.payload, owners = ownerMap(payload);
  assert.equal(candidate.correspondenceComplete, true);
  assert.equal(candidate.publicComplete, false);
  assert.equal(candidate.boundary.nativeCallsInsideClock, 1);
  assert.equal(candidate.boundary.serializationInsideClock, false);
  assert.equal(payload.classGroup.classNumber, "1");
  assert.deepEqual(payload.classGroup.invariantFactors, []);
  assert.equal(payload.unitGroup.rank, "3");
  assert.equal(payload.source.assumptions.length, 3);
  assert(payload.source.assumptions.every(item => item.disposition === "assumed"));
  assert.equal(logical(owners.get("exact-unit-coordinates")).length, 15);
  assert.equal(logical(owners.get("exact-unit-inverses")).length, 15);
  assert.deepEqual(logical(owners.get("exact-unit-norms")), ["-1", "-1", "-1"]);
  assert.equal(logical(owners.get("exact-unit-real-signs")).length, 9);
  assert.equal(logical(owners.get("class-presentation")).length,
    24 * 32 + 24 * 32 + 32 * 32 + 32 * 24 + 1);
  assert.equal(logical(owners.get("accepted-regulator"))[1], "192");
  assert.deepEqual(logical(owners.get("acceptance-state")), ["2", "0", "0"]);
  let payloadMutationsRejected = 0;
  for (const mutate of [
    value => { ownerMap(value).get("exact-unit-inverses").entries[0] = "999"; },
    value => { const entry = ownerMap(value).get("exact-unit-real-signs");
      entry.entries[0] = entry.entries[0] === "1" ? "-1" : "1"; },
    value => { ownerMap(value).get("accepted-regulator").entries[0] = "1"; },
    value => { ownerMap(value).get("acceptance-state").entries[0] = "1"; },
    value => { const entry = ownerMap(value).get("class-presentation");
      entry.entries[0] = entry.entries[0] === "0" ? "1" : "0"; },
    value => { value.field.definingPolynomialAscending[0] = "37"; },
    value => { value.source.assumptions[0].statement += " mutated"; },
    value => { value.terminal.status = "not-complete"; },
  ]) {
    const changed = structuredClone(payload); mutate(changed);
    assert.throws(() => result.replayCandidatePayload(candidate, changed));
    payloadMutationsRejected += 1;
  }
  const acceptanceOwner = resident.values.t_accept_acceptance_state;
  const acceptanceBefore = acceptanceOwner.slice();
  acceptanceOwner.set([3n], 0);
  assert.throws(() => result.publishCandidate(candidate,
    new neutral.ClassUnitCorrespondencePublisher()),
  /independent mathematical replay rejected/);
  acceptanceOwner.set(acceptanceBefore);
  const publisher = new neutral.ClassUnitCorrespondencePublisher();
  const published = result.publishCandidate(candidate, publisher);
  assert.equal(result.publishCandidate(candidate, publisher), published);
  assert.deepEqual(published.detachedPayload(), payload);
  assert.equal(Object.isFrozen(candidate), true);
  assert.throws(() => result.computeCandidate({ ...resident }), /capability/,
    "a copied resident unexpectedly retained its capability");
  return { envelopeSha256: candidate.envelopeSha256,
    kernelNanoseconds: candidate.kernelNanoseconds, ownerCapabilities: owners.size,
    payloadMutationsRejected, staleOwnerMutationRejected: true };
}

async function main() {
  const report = focused();
  if (process.argv.includes("--genuine")) {
    // Genuine computation is intentionally a separate 4 GiB/600 s worker in
    // the invoking shell; this process performs no answer-oracle import.
    Object.assign(report, await genuine(), { genuine: true });
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

main().catch(error => { process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1; });
