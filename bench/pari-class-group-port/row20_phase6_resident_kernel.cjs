"use strict";

// Publication-free row-20 prepared-field transaction.  All compiler and
// source-authentication work occurs in prepareResident.  runResident performs
// only mathematical computation on retained in-memory owners.  The current
// remaining qualification blocker is allocation of the factor/HNF/acceptance
// owner graph inside this one inclusive invocation.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const authentication = require("./prepared_nf_authentication.cjs");
const factor = require("./row20_fresh_factor_base_coordinator.cjs");
const hnf = require("./row20_fresh_first_hnf_host.cjs");
const acceptance = require("./row20_fresh_acceptance_host.cjs");
const units = require("./row20_phase6_resident_unit_host.cjs");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const SCHEMA = "sagejs.pari-class-group/row20-phase6-resident-kernel-v1";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function determinant(values, size) {
  const work = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => BigInt(values[row * size + column])));
  let sign = 1n, previous = 1n;
  for (let column = 0; column < size - 1; column += 1) {
    let pivot = column;
    while (pivot < size && work[pivot][column] === 0n) pivot += 1;
    if (pivot === size) return 0n;
    if (pivot !== column) {
      [work[pivot], work[column]] = [work[column], work[pivot]];
      sign = -sign;
    }
    const value = work[column][column];
    for (let row = column + 1; row < size; row += 1)
      for (let other = column + 1; other < size; other += 1) {
        const numerator = work[row][other] * value -
          work[row][column] * work[column][other];
        assert.equal(numerator % previous, 0n, "nonexact row-20 determinant division");
        work[row][other] = numerator / previous;
      }
    previous = value;
  }
  return sign * work[size - 1][size - 1];
}

function unitNorm(unit, tensor) {
  const matrix = [];
  for (let row = 0; row < 5; row += 1)
    for (let column = 0; column < 5; column += 1) {
      let value = 0n;
      for (let basis = 0; basis < 5; basis += 1)
        value += BigInt(unit[basis]) * BigInt(tensor[25 * basis + 5 * column + row]);
      matrix.push(value);
    }
  return determinant(matrix, 5);
}

async function prepareResident(prepared) {
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, factor.PREPARED_SHA256,
    "row-20 resident prepared authority changed");
  const here = __dirname;
  const factorSource = path.join(here, "row21_factor_base.py");
  const indexSource = path.join(here, "prepared_index_prime.py");
  const hnfSource = path.join(here, "row20_connected_relation_hnf.py");
  const [factorBuilt, indexBuilt, unitResident, hnfBuilt,
    acceptanceResident] = await Promise.all([
    compileKernel({ sourcePath: factorSource,
      cacheRoot: "/scratch/sagejs-native-cache-row20-phase6-factor" }),
    compileKernel({ sourcePath: indexSource,
      cacheRoot: "/scratch/sagejs-native-cache-row20-phase6-factor" }),
    units.prepare(prepared),
    compileKernel({ sourcePath: hnfSource,
      cacheRoot: "/scratch/sagejs-native-cache-row20-phase6-hnf" }),
    acceptance.prepareResident(),
  ]);
  const sourceAuthority = {
    sourceSha256: sha(fs.readFileSync(factorSource)),
    indexSourceSha256: sha(fs.readFileSync(indexSource)),
    coreSha256: sha(fs.readFileSync(factorBuilt.coreSourcePath)),
    indexCoreSha256: sha(fs.readFileSync(indexBuilt.coreSourcePath)),
  };
  return Object.freeze({ acceptanceResident, authority,
    factorKernels: Object.freeze({ factorBuilt, indexBuilt }),
    hnfBuilt, hnfNames: hnf.signature(hnfSource),
    prepared: structuredClone(prepared),
    sourceAuthority: Object.freeze(sourceAuthority), unitResident });
}

async function runResident(resident) {
  assert.equal(authentication.authenticatePreparedNf(resident.prepared).sha256,
    resident.authority.sha256);
  const factorResult = await factor.runResident({
    prepared: resident.prepared,
    preparedAuthoritySha256: resident.authority.sha256,
    residentKernels: resident.factorKernels,
    sourceAuthority: resident.sourceAuthority,
  });
  const hnfResult = await hnf.runFirstHnf(resident.prepared, factorResult.owner, {
    residentBuilt: resident.hnfBuilt, residentNames: resident.hnfNames });
  assert.equal(hnfResult.status, 0, "row-20 resident HNF failed");
  assert.deepEqual(hnfResult.hnfState, [0, 7, 7, 0, 7, 4, 0, 14, 0]);
  const accepted = await acceptance.runAcceptance(resident.prepared, hnfResult,
    resident.acceptanceResident);
  assert.equal(accepted.status, 0, "row-20 resident acceptance failed");
  assert.equal(accepted.classNumber, "1");
  const materialized = units.run(resident.unitResident, hnfResult, accepted);
  const first = materialized.units.slice(0, 5);
  const second = materialized.units.slice(5, 10);
  const norms = [unitNorm(first, resident.prepared.basis_table),
    unitNorm(second, resident.prepared.basis_table)];
  assert(norms.every(value => value === 1n || value === -1n),
    "row-20 resident materialization did not produce units");
  return {
    schema: SCHEMA,
    classGroup: { classNumber: "1", invariantFactors: [], generatorCount: "0" },
    unitGroup: { rank: "2", torsionOrder: "2", regulatorPresent: true,
      coordinates: materialized.units, norms: norms.map(String) },
    exact: { factorOwnerSha256: factorResult.ownerSha256,
      hnfState: hnfResult.hnfState, unitState: materialized.residentState,
      relationCount: "14", factorBaseSize: "7" },
    allocationFreeMatchedClock: false,
    correspondenceComplete: true,
    publicComplete: false,
  };
}

module.exports = { SCHEMA, determinant, prepareResident, runResident, unitNorm };
