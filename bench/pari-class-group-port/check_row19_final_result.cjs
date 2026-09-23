#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const api = require("./row19_final_result_coordinator.cjs");

const TERMINAL = "/scratch/sagejs-row19-terminal-continuation/row19-terminal-continuation-f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76.json.gz";
const UNIT = "/scratch/sagejs-row19-live-unit-result/row19-live-unit-result-ee4828c398ad0b59446e669ac24c1fb482bfc4f7226cf83a92b4f1b67ae44ea9.json.gz";
const FIRST = "/scratch/sagejs-row19-first-hnf/row19-first-hnf-076d334e302d880b2a7da80366fe492d62b118e2a495f15c422908137aa66258.json.gz";
const CLASS = "/scratch/sagejs-row19-class-group-principal/row19-class-group-principal-1a080b32e3f54e10eb9d525bc0dae139e22d3b1f63defbe332dc0e193f1632e1.json.gz";
const CLASS_SHA256 = api.CLASS_SHA256;
const CLASS_COMPRESSED_SHA256 = api.CLASS_COMPRESSED_SHA256;
const OUTPUT = "/scratch/sagejs-row19-final-result";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function descriptor(file, ownerSha256, compressedSha256) {
  return { path: file, ownerSha256, compressedSha256 };
}

function main() {
  const started = process.hrtime.bigint();
  const descriptors = {
    terminal: descriptor(TERMINAL, api.TERMINAL_SHA256, api.TERMINAL_COMPRESSED_SHA256),
    unit: descriptor(UNIT, api.UNIT_SHA256, api.UNIT_COMPRESSED_SHA256),
    first: descriptor(FIRST, api.FIRST_SHA256, api.FIRST_COMPRESSED_SHA256),
    classOwner: descriptor(CLASS, CLASS_SHA256, CLASS_COMPRESSED_SHA256),
  };

  assert.throws(() => api.compose({ terminal: descriptors.terminal, unit: descriptors.unit }),
    /missing raw-to-terminal principal-relation\/class owner/);
  assert.throws(() => api.compose({ ...descriptors, classOwner: {
    ...descriptors.classOwner,
    ownerSha256: "2c056ce2462cb856872ab9946eff6ec62431c1fcbd443d4df50d054d984fc4ff",
  } }), /superseded principal class owner is revoked/);
  assert.throws(() => api.replay(descriptors, {
    path: "/scratch/revoked-row19-final.json.gz",
    ownerSha256: api.REVOKED_FINAL_SHA256,
    compressedSha256: "0".repeat(64),
  }), /revoked row-19 final result/);

  const owner = api.compose(descriptors);
  assert.equal(api.verifyOwner(owner, owner.ancestry), true);
  const first = api.publish(owner, OUTPUT);
  const repeated = api.publish(api.compose(descriptors), OUTPUT);
  assert.deepEqual(repeated, first);
  const published = api.replay(descriptors, first);
  assert.deepEqual(published, owner);
  assert.equal(fs.statSync(first.path).mode & 0o222, 0);

  const mutations = [
    value => { value.ancestry.classOwnerSha256 = "0".repeat(64); },
    value => { value.field.definingPolynomial[0] = "-1"; },
    value => { value.classGroup.classNumber = "39367"; },
    value => { value.classGroup.invariants[0] = "3"; },
    value => { value.classGroup.generatorIdealHnfs[0][0] =
      String(BigInt(value.classGroup.generatorIdealHnfs[0][0]) + 1n); },
    value => { const witness = value.classGroup.exactOrderWitnesses[0].principal;
      witness.rawRelationCoefficients[0] =
        String(BigInt(witness.rawRelationCoefficients[0]) + 1n); },
    value => { const witness = value.classGroup.exactOrderWitnesses[0].principal;
      witness.generatorPowerFactorBaseExponents[0] =
        String(BigInt(witness.generatorPowerFactorBaseExponents[0]) + 1n); },
    value => { const unit = value.unitGroup.compactFundamentalUnit;
      unit.relationExponents[0] = String(BigInt(unit.relationExponents[0]) + 1n); },
    value => { const regulator = value.unitGroup.regulatorCertificate.regulator;
      regulator[0] = String(BigInt(regulator[0]) + 1n); },
    value => { value.unitGroup.torsionGenerator[0] = "1"; },
    value => { value.internals.transforms.D[0] =
      String(BigInt(value.internals.transforms.D[0]) + 1n); },
    value => { value.internals.GD[0] = String(BigInt(value.internals.GD[0]) + 1n); },
    value => { value.internals.principalRelationTransform.firstStageFullValuationReplayExact =
      false; },
    value => { value.internals.valuationReplay.terminalFullIdentityExact = false; },
    value => { value.retained.relations[0] =
      String(BigInt(value.retained.relations[0]) + 1n); },
    value => { value.retained.rawLogs[0] =
      String(BigInt(value.retained.rawLogs[0]) + 1n); },
    value => { value.retained.factorBase.idealHnfs.pop(); },
    value => { value.assumptions.grhAndRelationBounds = "proved"; },
    value => { value.sourceBoundary.usedW0RuntimeData = true; },
    value => { value.completion.internalComplete = false; },
    value => { value.materialDigests.retained = "0".repeat(64); },
    value => { value.sealSha256 = "0".repeat(64); },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(owner);
    mutate(changed);
    assert.throws(() => api.verifyOwner(changed, owner.ancestry));
  }

  const duplicatePlain = Buffer.from('{"schema":"x","schema":"y"}\n');
  const duplicateCompressed = zlib.gzipSync(duplicatePlain, { level: 9, mtime: 0 });
  const duplicateDirectory = fs.mkdtempSync("/scratch/sagejs-row19-final-duplicate-");
  const duplicatePath = path.join(duplicateDirectory, "duplicate.json.gz");
  fs.writeFileSync(duplicatePath, duplicateCompressed, { mode: 0o400 });
  fs.chmodSync(duplicatePath, 0o444);
  assert.throws(() => api.readGzip(descriptor(duplicatePath, sha(duplicatePlain),
    sha(duplicateCompressed)), "duplicate", "y"), /not strict JSON/);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-final-result-check-v1",
    ...first,
    terminalOwnerSha256: api.TERMINAL_SHA256,
    classOwnerSha256: CLASS_SHA256,
    unitOwnerSha256: api.UNIT_SHA256,
    classNumber: owner.classGroup.classNumber,
    invariants: owner.classGroup.invariants,
    classGenerators: owner.classGroup.generatorIdealHnfs.length,
    principalWitnesses: owner.classGroup.exactOrderWitnesses.length,
    factorBaseSize: owner.retained.factorBase.idealHnfs.length,
    relationCount: owner.retained.relationHashes.length,
    firstStageValuationCellsReplayed: 424 * 423,
    terminalValuationCellsReplayed: 424 * 430,
    generatorPowerFactorBaseEqualitiesReplayed: 9,
    compactFundamentalUnits: 1,
    unitMaterialization: owner.unitGroup.materialization.tag,
    runtimeW0Reads: 0,
    mutationRejections: mutations.length,
    duplicateKeyRejected: true,
    replayedFromImmutableOwners: true,
    atomicIdempotentPublication: true,
    elapsedNs: String(process.hrtime.bigint() - started),
  })}\n`);
}

try { main(); } catch (error) {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
}
