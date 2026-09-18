#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-03-aae73048ee765ce3.json";

function iv(value) {
  return String(value?.kind === "integer" ? value.value : value);
}

function values(value, kind, length, label) {
  assert(value && value.kind === kind && Array.isArray(value.values),
    `${label} kind changed`);
  assert.equal(value.values.length, length, `${label} length changed`);
  return value.values;
}

function descriptorOracle(event) {
  return values(event.LP, "vector", 668, "factor descriptors")
    .map((descriptor, index) => {
      const fields = values(descriptor, "vector", 5, `descriptor ${index}`);
      const generator = values(fields[1], "column", 3,
        `descriptor ${index} generator`).map(iv);
      const columns = values(fields[4], "matrix", 3,
        `descriptor ${index} tau`);
      const columnMajor = columns.flatMap((column, j) =>
        values(column, "column", 3, `descriptor ${index} tau column ${j}`)
          .map(iv));
      const tau = Array(9);
      for (let row = 0; row < 3; row += 1)
        for (let column = 0; column < 3; column += 1)
          tau[3 * row + column] = columnMajor[3 * column + row];
      return { p: iv(fields[0]), e: iv(fields[2]), f: iv(fields[3]), inert: "0",
        generator, tau };
    });
}

async function main() {
  const authentication = require("./prepared_nf_authentication.cjs");
  const frontier = require("./row3_prepared_initial_base_frontier.cjs");
  const raw = JSON.parse(fs.readFileSync(W0));
  const prepared = authentication.normalizePreparedBundle(raw.prepared);

  // Publish the prepared-only frontier before opening any answer event.
  const owner = await frontier.run(prepared);
  frontier.verifyOwner(owner);
  assert(Object.isFrozen(owner));
  assert.equal(owner.provenance.frozenAnswerInputs, false);

  // Detached differential only after the computed owner exists.
  const event = raw.events.find(value => value.event === "factor_base");
  assert(event, "row3 factor-base oracle event is missing");
  assert.deepEqual(owner.bounds, {
    C1: iv(event.C1), C2: iv(event.C2), KC: iv(event.KC),
    KCZ: iv(event.KCZ), KCZ2: iv(event.KCZ2), KC2: iv(event.KC),
    prodZ: owner.bounds.prodZ,
  });
  assert.deepEqual(owner.factorSelection.rationalPrimes, event.FB.values.map(iv));
  assert.deepEqual(owner.factorSelection.descriptors, descriptorOracle(event));
  assert.deepEqual(owner.factorSelection.norms,
    owner.factorSelection.descriptors.map(value =>
      (BigInt(value.p) ** BigInt(value.f)).toString()));
  assert.equal(owner.factorSelection.ideals.length, 668);
  assert(owner.factorSelection.ideals.every(value => value.length === 9));
  assert.deepEqual(owner.factorSelection.permutation, event.perm.values.map(iv));
  assert.deepEqual(owner.factorSelection.subfactor, event.subfactor.values.map(iv));
  assert.equal(owner.factorSelection.subfactorPolicy.count,
    String(event.subfactorCount));
  const initialized = raw.events.find(value => value.event === "initialized");
  assert(initialized, "row3 initialized oracle event is missing");
  assert.equal(owner.factorSelection.initialRelations.count,
    String(initialized.relations));
  assert.equal(owner.factorSelection.initialRelations.target,
    String(initialized.target));
  const initialOracle = initialized.relationRecords.map(record => ({
    entries: record.R.values.flatMap((value, row) =>
      iv(value) === "0" ? [] : [[row, iv(value)]]),
    generator: [iv(record.m), "0", "0"],
  }));
  assert.deepEqual(owner.factorSelection.initialRelations.records.map(record => ({
    entries: record.entries, generator: record.generator,
  })), initialOracle);

  await assert.rejects(frontier.run({ ...prepared, prep_index: "2" }),
    /index|authority|basis|discriminant quotient/);
  const copied = structuredClone(owner);
  assert.equal(Object.isFrozen(copied), false);
  assert.throws(() => frontier.verifyOwner({ ...copied,
    publication: { ...copied.publication, hnfComplete: true } }));

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row3-prepared-initial-base-frontier-check-v1",
    preparedAuthoritySha256: frontier.PREPARED_SHA256,
    bounds: owner.bounds,
    rationalPrimes: owner.factorSelection.rationalPrimes.length,
    selectedDescriptors: owner.factorSelection.selectedDescriptorIndices.length,
    exactDescriptorMatches: owner.factorSelection.descriptors.length,
    exactIdealPackets: owner.factorSelection.ideals.length,
    permutationMatches: owner.factorSelection.permutation.length,
    subfactorMatches: owner.factorSelection.subfactor.length,
    exactInitialRelations: owner.factorSelection.initialRelations.records.length,
    firstUnsupportedDependency: owner.provenance.unsupportedNextDependency,
    qualifiedTiming: false,
    oracleOpenedAfterPublication: true,
    checker: path.basename(__filename),
  })}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
