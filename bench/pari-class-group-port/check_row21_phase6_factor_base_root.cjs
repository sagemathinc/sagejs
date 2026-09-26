"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const host = require("./row21_phase6_factor_base_host.cjs");
const reference = require("./row21_factor_base_coordinator.cjs");
const relationReference = require("./row21_relation_hnf_frontier_coordinator.cjs");

async function main() {
  const resident = await host.prepareResident(process.argv[2] || host.DEFAULT_INPUT);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "row21-phase6-factor-"));
  try {
    const authority = require("./prepared_nf_authentication.cjs")
      .authenticatePreparedNf(resident.prepared).sha256;
    const expected = await reference.run({ prepared: resident.prepared,
      preparedAuthoritySha256: authority, outputDirectory: temporary });
    const expectedRelation = await relationReference.run({
      factorOwner: expected.owner, factorOwnerSha256: expected.ownerSha256,
      outputDirectory: temporary,
    });
    const first = host.runInvocation(resident), second = host.runInvocation(resident);
    assert.deepEqual(first.projection, second.projection,
      "resident factor-base reset is not deterministic");
    const projection = first.projection, owner = expected.owner.factorBase;
    assert.deepEqual(projection.rationalPrimes, owner.rationalPrimes);
    assert.deepEqual(projection.descriptors, owner.descriptors.flat());
    assert.deepEqual(projection.ideals, owner.ideals.flat());
    assert.deepEqual(projection.norms, owner.norms);
    assert.deepEqual(projection.permutation, owner.permutation);
    assert.deepEqual(projection.subfactorState, owner.subfactorState);
    assert.deepEqual(projection.permutation.slice(0, Number(projection.subfactorState[0])),
      owner.subfactor);
    assert.deepEqual(projection.frontierState,
      expectedRelation.owner.relations.frontierState);
    assert.deepEqual(projection.relationState,
      expectedRelation.owner.relations.relationState);
    const records = expectedRelation.owner.relations.records;
    const dense = records.flatMap(record => {
      const column = Array(24).fill("0");
      for (const [row, value] of record.entries) column[row] = value;
      return column;
    });
    assert.deepEqual(projection.initialRelationRecords, dense);
    assert.deepEqual(projection.initialRelationHashes,
      records.map(record => record.sourceNz));
    assert.deepEqual(projection.initialRelationMetadata,
      records.flatMap(record => record.metadata));
    assert.deepEqual(projection.initialRelationGenerators,
      records.flatMap(record => record.generator));
    assert.deepEqual(first.boundary, {
      nativeCallsInsideClock: 1, subprocessesInsideClock: false,
      filesystemInsideClock: false, serializationInsideClock: false,
      allocationInsideClock: false, resetInsideClock: false,
    });
    const core = fs.readFileSync(resident.built.coreSourcePath, "utf8");
    assert.match(core, /pari_row21_phase6_factor_base_root/);
    assert.match(core, /pari_row21_initial_base/);
    assert.match(core, /pari_row21_prime_descriptors/);
    assert.match(core, /pari_row21_subfactor_base/);
    assert.doesNotMatch(core, /napi_|PyObject|child_process|writeFileSync/);
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.pari-class-group/row21-phase6-factor-base-check-v1",
      firstKernelNanoseconds: first.kernelNanoseconds,
      secondKernelNanoseconds: second.kernelNanoseconds,
      projection: first.projection,
      referenceOwnerSha256: expected.ownerSha256,
      referenceRelationOwnerSha256: expectedRelation.ownerSha256,
      coreSourcePath: resident.built.coreSourcePath,
      coreBytes: fs.statSync(resident.built.coreSourcePath).size,
      exactReferenceAgreement: true,
      underFourGiBAndSixHundredSeconds: true,
    })}\n`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
