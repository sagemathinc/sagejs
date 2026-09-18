#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const runtimeRoot = path.resolve(process.env.SAGEJS_REPLAY_RUNTIME_ROOT || root);
const adapter = require("./h1_class_unit_result_adapter.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const fixtureRoot = process.env.SAGEJS_H1_FIXTURE_ROOT ||
  "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/final-bba785ce0";
const fixtures = [
  "stages/resident-cubic-input/attempts/attempt-51iPq2/generated/" +
    "sagejs-prepared-class-inputs-wdESEb/inputs.json",
  "stages/analytic/attempts/attempt-dO7Qet/generated/" +
    "sagejs-analytic-invhr-ibNdcb/fixtures.json",
  "stages/initial-kummer/attempts/attempt-g5Sr4e/generated/" +
    "sagejs-initial-kummer-catalog-BCSD8t/fixtures.json",
].map(relative => path.join(fixtureRoot, relative));

const tools = require(path.join(runtimeRoot,
  "bench/pari-class-group-port/check_unified_h1_terminal_snapshot.cjs"));

function honestyEvidence(input) {
  const program = String.raw`
import dataclasses,importlib,json,sys
sys.path[:0]=[sys.argv[1],sys.argv[1]+"/src/lib"]
m=importlib.import_module("bench.pari-class-group-port.h1_honesty_terminal")
live=json.load(sys.stdin)
print(json.dumps(dataclasses.asdict(m.compose_h1_honesty_terminal(live)),sort_keys=True))
`;
  const child = spawnSync("python3", ["-c", program, runtimeRoot], {
    cwd: runtimeRoot,
    encoding: "utf8",
    input: JSON.stringify(input),
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  return JSON.parse(child.stdout.trim().split("\n").at(-1));
}

function powerCoordinates(owners) {
  const basis = owners.prep_zk.map(BigInt);
  const integral = owners.final_exact_units.map(BigInt);
  const units = [];
  for (let unit = 0; unit < 2; unit += 1) {
    const row = [];
    for (let power = 0; power < 3; power += 1) {
      let value = 0n;
      for (let column = 0; column < 3; column += 1) {
        value += basis[3 * column + power] * integral[3 * unit + column];
      }
      row.push(String(value));
    }
    units.push(row);
  }
  return units;
}

async function fullRegulatorAuthority(owners) {
  const fixture = {
    logs: owners.precision_published_logs,
    provenance: [
      owners.final_retained_relation_map.slice(0, 73),
      owners.final_retained_relation_map.slice(73, 146),
    ],
    regulator: owners.final_regulator,
    units: powerCoordinates(owners),
  };
  const source = fs.readFileSync(path.join(runtimeRoot,
    "bench/pari-class-group-port/regulator_interval_authority.py"), "utf8");
  const { createSage } = require(path.join(runtimeRoot, "dist/tools/kernel.js"));
  const session = await createSage({ mode: "python" });
  try {
    const program = source + String.raw`
import json
fixture=json.loads(${JSON.stringify(JSON.stringify(fixture))})
R=PolynomialRing(QQ,"x");x=R.gen();K=NumberField(x**3-20018*x+20034,"a")
authority=build_live_regulator_interval_authority(
 K,fixture["regulator"],fixture["units"],fixture["provenance"],fixture["logs"])
print(json.dumps(authority,sort_keys=True,separators=(",",":")))
`;
    const result = await session.evaluate(program, {
      filename: "h1-result-envelope-regulator-authority.py",
    });
    assert.equal(result.stderr || "", "");
    if (result.exitCode !== undefined) assert.equal(result.exitCode, 0);
    return JSON.parse(result.stdout.trim().split("\n").at(-1));
  } finally {
    session.close();
  }
}

async function capture(fixturePaths = fixtures) {
  const produced = await tools.produceOwners(fixturePaths);
  const coldReplay = tools.runDetachedReplay(produced.copiedOwners);
  const regulatorAuthority = await fullRegulatorAuthority(produced.copiedOwners);
  return {
    cacheKey: produced.cacheKey,
    coldReplay,
    honesty: honestyEvidence(produced.honestyInput),
    rawOwners: produced.copiedOwners,
    regulatorAuthority,
  };
}

async function produceH1ClassUnitResult(fixturePaths = fixtures) {
  for (const fixture of fixturePaths) assert(fs.existsSync(fixture), `missing ${fixture}`);
  const candidate = await capture(fixturePaths);
  const trusted = await capture(fixturePaths);
  assert.deepEqual(candidate.rawOwners, trusted.rawOwners);
  assert.equal(candidate.coldReplay.sha256, trusted.coldReplay.sha256);
  assert.equal(candidate.regulatorAuthority.authority_sha256,
    trusted.regulatorAuthority.authority_sha256);
  assert.deepEqual(candidate.honesty, trusted.honesty);
  const replaySchema =
    "sagejs.pari-class-group/h1-final-correspondence-replay-v1";
  const prepared = adapter.prepareH1ClassUnitResult(
    makeBoundary(candidate, trusted), { publicationReplaySchema: replaySchema });
  const authority = finalAuthority(prepared, trusted, replaySchema);
  const result = adapter.publishPreparedH1Result(prepared, authority);
  assert(result instanceof neutral.ImmutableClassUnitCorrespondenceResult);
  assert.equal(result.sha256, prepared.envelopeSha256);
  assert.equal(result.detachedPayload().terminal.public_complete, false);
  return result;
}

function evidence(captureValue) {
  return {
    coldReplay: captureValue.coldReplay,
    fieldId: adapter.FIELD_ID,
    honesty: captureValue.honesty,
    rawOwners: captureValue.rawOwners,
    regulatorAuthority: captureValue.regulatorAuthority,
    schema: adapter.BOUNDARY_SCHEMA,
  };
}

function makeBoundary(candidate, trusted) {
  const trustedEvidence = evidence(trusted);
  const evidenceSha256 = neutral.sha256Canonical(trustedEvidence);
  const mathematicalAuthoritySha256 = neutral.sha256Canonical({
    coldReplaySha256: trusted.coldReplay.sha256,
    honesty: trusted.honesty,
    rawNativeOwners: trusted.rawOwners,
    regulatorAuthoritySha256: trusted.regulatorAuthority.authority_sha256,
    source: adapter.PARI_SOURCE_SHA256,
  });
  return {
    authority: {
      evidenceSha256,
      mathematicalAuthoritySha256,
      replay(candidateEvidence) {
        assert.deepEqual(candidateEvidence, trustedEvidence);
        return {
          accepted: true,
          coldReplaySha256: trusted.coldReplay.sha256,
          correspondenceComplete: true,
          evidenceSha256,
          fieldId: adapter.FIELD_ID,
          mathematicalAuthoritySha256,
          publicComplete: false,
          regulatorAuthoritySha256:
            trusted.regulatorAuthority.authority_sha256,
          schema: adapter.BOUNDARY_REPLAY_SCHEMA,
        };
      },
      replaySchema: adapter.BOUNDARY_REPLAY_SCHEMA,
    },
    ...evidence(candidate),
  };
}

function ownerMap(payload) {
  return new Map(payload.storage.map(owner => [owner.name, owner]));
}

function logical(owner) {
  return owner.entries.slice(0, Number(owner.logicalLength));
}

function canonicalBytes(value) {
  return [...neutral.canonical(value)].map(entry => String(entry));
}

function finalAuthority(prepared, trusted, replaySchema) {
  const mathematicalAuthoritySha256 = prepared.mathematicalAuthoritySha256;
  const trustedPower = powerCoordinates(trusted.rawOwners).flat();
  const replay = payload => {
    assert.equal(payload.field.id, adapter.FIELD_ID);
    assert.deepEqual(payload.field.definingPolynomialAscending, adapter.POLYNOMIAL);
    assert.deepEqual(payload.classGroup, {
      classNumber: "1",
      generatorCount: "0",
      invariantFactors: [],
      presentationOwner: "class-presentation",
    });
    assert.equal(payload.terminal.correspondence_complete, true);
    assert.equal(payload.terminal.public_complete, false);
    assert.equal(payload.honesty.outcome, "equal-bound-source-skip");
    const owners = ownerMap(payload);
    for (const [name, values] of Object.entries(trusted.rawOwners)) {
      assert.deepEqual(logical(owners.get(`replay-${name}`)), values,
        `neutral raw owner ${name}`);
    }
    assert.deepEqual(logical(owners.get("class-presentation")),
      trusted.rawOwners.final_presentation);
    assert.deepEqual(logical(owners.get("exact-unit-coordinates")), trustedPower);
    assert.deepEqual(logical(owners.get("exact-unit-norms")),
      trusted.rawOwners.final_exact_norms);
    assert.deepEqual(logical(owners.get("torsion-generator")), ["-1", "0", "0"]);
    assert.deepEqual(logical(owners.get("honesty-evidence")),
      canonicalBytes(trusted.honesty));
    assert.deepEqual(logical(owners.get("regulator-rigorous-authority")),
      canonicalBytes(trusted.regulatorAuthority));
    assert.deepEqual(logical(owners.get("workload-boundary-evidence")),
      canonicalBytes(adapter.WORKLOAD_BOUNDARY));
    assert.deepEqual(payload.unitGroup, {
      materialization: {
        coordinatesOwner: "exact-unit-coordinates",
        normsOwner: "exact-unit-norms",
        tag: "exact_units",
      },
      rank: "2",
      regulatorOwner: "regulator-enclosure",
      torsionGeneratorOwner: "torsion-generator",
      torsionOrder: "2",
    });
    return {
      correspondence_complete: true,
      fieldId: adapter.FIELD_ID,
      mathematicalAuthoritySha256,
      payloadSha256: neutral.sha256Canonical(payload),
      public_complete: false,
      schema: replaySchema,
    };
  };
  return neutral.createDetachedClassUnitAuthority({
    envelopeSha256: prepared.envelopeSha256,
    mathematicalAuthoritySha256,
    replay,
    replaySchema,
  });
}

function reseal(payload) {
  return neutral.sealClassUnitCorrespondenceResult(payload);
}

async function main() {
  for (const fixture of fixtures) assert(fs.existsSync(fixture), `missing ${fixture}`);
  const candidate = await capture();
  const trusted = await capture();
  assert.deepEqual(candidate.rawOwners, trusted.rawOwners);
  assert.equal(candidate.coldReplay.sha256, trusted.coldReplay.sha256);
  assert.equal(candidate.regulatorAuthority.authority_sha256,
    trusted.regulatorAuthority.authority_sha256);
  assert.deepEqual(candidate.honesty, trusted.honesty);

  const replaySchema =
    "sagejs.pari-class-group/h1-final-correspondence-replay-v1";
  const boundary = makeBoundary(candidate, trusted);
  const prepared = adapter.prepareH1ClassUnitResult(boundary, {
    publicationReplaySchema: replaySchema,
  });
  assert.equal(prepared.status, "ready-for-out-of-band-publication-authority");
  assert.equal(prepared.correspondenceComplete, true);
  assert.equal(prepared.publicComplete, false);
  assert(Object.isFrozen(prepared));

  const raw = Buffer.from(prepared.sealedEnvelopeHex, "hex");
  const payload = JSON.parse(raw.toString("ascii")).payload;
  assert.equal(payload.storage.length, Object.keys(adapter.OWNER_LENGTHS).length + 8);
  const authority = finalAuthority(prepared, trusted, replaySchema);
  const publisher = new neutral.ClassUnitCorrespondencePublisher();
  const published = adapter.publishPreparedH1Result(prepared, authority, publisher);
  assert.equal(published, publisher.current());
  assert.equal(adapter.publishPreparedH1Result(prepared, authority, publisher), published);
  assert.equal(published.detachedPayload().terminal.public_complete, false);

  let mutationsRejected = 0;
  function rejectBoundary(mutator) {
    const changedCapture = structuredClone(candidate);
    mutator(changedCapture);
    const changed = makeBoundary(changedCapture, trusted);
    assert.throws(() => adapter.prepareH1ClassUnitResult(changed, {
      publicationReplaySchema: replaySchema,
    }), adapter.H1ClassUnitAdapterFailure);
    mutationsRejected += 1;
  }

  rejectBoundary(value => { value.rawOwners.final_presentation[0] = "2"; });
  rejectBoundary(value => { value.rawOwners.final_exact_units[0] = "1"; });
  rejectBoundary(value => { value.rawOwners.final_torsion_generator[0] = "1"; });
  rejectBoundary(value => { value.coldReplay.sha256 = "0".repeat(64); });
  rejectBoundary(value => { value.honesty.checking_groups = 47; });
  rejectBoundary(value => { value.honesty.relation_bound = 48; });
  rejectBoundary(value => {
    value.regulatorAuthority.evidence.live_regulator_contained = false;
  });

  const changedPayload = structuredClone(payload);
  const changedOwner = changedPayload.storage.find(owner =>
    owner.name === "replay-final_exact_units");
  changedOwner.entries[0] = String(BigInt(changedOwner.entries[0]) + 1n);
  const changedRaw = reseal(changedPayload);
  const changedAuthority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(changedRaw),
    mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
    replay: authority.replay,
    replaySchema,
  });
  assert.throws(() => neutral.verifyClassUnitCorrespondenceResult(
    changedRaw, changedAuthority));
  mutationsRejected += 1;

  const conflictingPayload = structuredClone(payload);
  conflictingPayload.source.assumptions[0].statement += " (changed)";
  const conflictingRaw = reseal(conflictingPayload);
  const conflictPrepared = {
    ...prepared,
    envelopeSha256: neutral.sha256Bytes(conflictingRaw),
    sealedEnvelopeHex: conflictingRaw.toString("hex"),
  };
  const conflictAuthority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: conflictPrepared.envelopeSha256,
    mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
    replay: candidatePayload => ({
      correspondence_complete: true,
      fieldId: adapter.FIELD_ID,
      mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
      payloadSha256: neutral.sha256Canonical(candidatePayload),
      public_complete: false,
      schema: replaySchema,
    }),
    replaySchema,
  });
  assert.throws(() => adapter.publishPreparedH1Result(
    conflictPrepared, conflictAuthority, publisher),
  neutral.ClassUnitResultConflict);
  assert.equal(publisher.current().sha256, published.sha256);
  mutationsRejected += 1;

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/h1-neutral-result-adapter-check-v1",
    fieldId: adapter.FIELD_ID,
    candidateCacheKey: candidate.cacheKey,
    trustedCacheKey: trusted.cacheKey,
    coldReplaySha256: trusted.coldReplay.sha256,
    regulatorAuthoritySha256: trusted.regulatorAuthority.authority_sha256,
    mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
    envelopeSha256: prepared.envelopeSha256,
    rawReplayOwners: Object.keys(adapter.OWNER_LENGTHS).length,
    exactUnits: 2,
    classNumber: 1,
    honesty: trusted.honesty.honesty_status,
    mutationsRejected,
    atomicPublication: true,
    idempotentPublication: true,
    correspondenceComplete: true,
    publicComplete: false,
    pariCallsAfterBoundary: 0,
  }, null, 2));
}

module.exports = { produceH1ClassUnitResult };

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
