"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const authentication = require("./prepared_nf_authentication.cjs");
const factor = require("./row20_fresh_factor_base_coordinator.cjs");
const factorRoot = require("./row20_phase6_factor_base_host.cjs");
const hnf = require("./row20_fresh_first_hnf_host.cjs");
const acceptance = require("./row20_fresh_acceptance_host.cjs");
const units = require("./row20_phase6_resident_unit_host.cjs");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const SCHEMA = "sagejs.pari-class-group/row20-phase6-resident-kernel-v1";

function packedAt(buffer, index) {
  const signed = buffer.sizes[index], words = Math.abs(signed);
  let value = 0n;
  for (let word = words - 1; word >= 0; word -= 1)
    value = (value << 64n) + buffer.limbs[index * buffer.wordCapacity + word];
  return signed < 0 ? -value : value;
}
function snapshot(owner) {
  if (owner?.sizes && owner?.limbs) {
    const sizes = owner.sizes.slice(), limbs = owner.limbs.slice();
    return () => { owner.sizes.set(sizes); owner.limbs.set(limbs); };
  }
  if (ArrayBuffer.isView(owner)) {
    const values = owner.slice();
    return () => owner.set(values);
  }
  return null;
}
const resetters = values => Object.values(values).map(snapshot).filter(Boolean);

function verifyFactor(resident) {
  const current = resident.factorResident.owners;
  const expected = resident.expectedFactor.factorBase;
  const equal = (buffer, index, value, label) => assert.equal(
    packedAt(buffer, index), BigInt(value), `${label}[${index}] changed`);
  const expectedState = [0, 7, 7, 3, 4, 85, 136, 1];
  for (let i = 0; i < expectedState.length; i += 1)
    equal(current.resident_state, i, expectedState[i], "resident state");
  for (let i = 0; i < 3; i += 1) {
    equal(current.selected_primes, i, expected.rationalPrimes[i], "prime");
    equal(current.group_offsets, i, [0, 3, 6][i], "group offset");
    equal(current.group_sizes, i, [3, 3, 1][i], "group size");
    equal(current.group_complete, i, 1, "group complete");
  }
  for (let i = 0; i < 7; i += 1) {
    equal(current.selected_norms, i, expected.norms[i], "norm");
    equal(current.permutation, i, expected.permutation[i], "permutation");
    for (let j = 0; j < 33; j += 1)
      equal(current.selected_descriptors, 33 * i + j,
        expected.descriptors[i][j], "descriptor");
    for (let j = 0; j < 25; j += 1)
      equal(current.selected_ideals, 25 * i + j,
        expected.ideals[i][j], "ideal");
  }
  for (let i = 0; i < 4; i += 1)
    equal(current.subfactor_state, i, expected.subfactorState[i], "subfactor state");
}

function determinant(values, size) {
  const work = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => BigInt(values[row * size + column])));
  let sign = 1n, previous = 1n;
  for (let column = 0; column < size - 1; column += 1) {
    let pivot = column;
    while (pivot < size && work[pivot][column] === 0n) pivot += 1;
    if (pivot === size) return 0n;
    if (pivot !== column) { [work[pivot], work[column]] =
      [work[column], work[pivot]]; sign = -sign; }
    const value = work[column][column];
    for (let row = column + 1; row < size; row += 1)
      for (let other = column + 1; other < size; other += 1) {
        const numerator = work[row][other] * value -
          work[row][column] * work[column][other];
        assert.equal(numerator % previous, 0n);
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
  assert.equal(authority.sha256, factor.PREPARED_SHA256);
  const storedPrepared = structuredClone(prepared);
  const factorResident = await factorRoot.prepare(storedPrepared);
  const setupFactor = await factor.runResident({ prepared: storedPrepared,
    preparedAuthoritySha256: authority.sha256 });
  const hnfSource = path.join(__dirname, "row20_connected_relation_hnf.py");
  const hnfBuilt = await compileKernel({ sourcePath: hnfSource,
    cacheRoot: "/scratch/sagejs-native-cache-row20-phase6-hnf" });
  const hnfInvocation = await hnf.runFirstHnf(storedPrepared,
    setupFactor.owner, { defer: true, residentBuilt: hnfBuilt,
      residentNames: hnf.signature(hnfSource) });
  factorRoot.bindHnfIngress(factorResident, hnfInvocation);
  const hnfReset = resetters(hnfInvocation.values);
  const setupHnf = hnf.invokeFirstHnf(hnfInvocation);
  assert.equal(setupHnf.status, 0);
  const acceptanceResident = await acceptance.prepareResident();
  const analyticInvocation = await acceptance.analyticInverseHr(storedPrepared,
    acceptanceResident, { defer: true });
  const analyticReset = [...resetters(analyticInvocation.cv),
    ...resetters(analyticInvocation.av)];
  const acceptanceInvocation = await acceptance.runAcceptance(storedPrepared,
    setupHnf, acceptanceResident, { defer: true, analyticInvocation });
  const acceptanceReset = resetters(acceptanceInvocation.values);
  for (const restore of hnfReset) restore();
  for (const restore of analyticReset) restore();
  const unitResident = await units.prepare(storedPrepared);
  units.bindInputs(unitResident, hnfInvocation, acceptanceInvocation);
  return { acceptanceInvocation, acceptanceReset, analyticInvocation,
    analyticReset, authority, expectedFactor: setupFactor.owner,
    factorResident, hnfInvocation, hnfReset, prepared: storedPrepared,
    unitResident };
}

function resetResident(resident) {
  factorRoot.reset(resident.factorResident);
  for (const restore of resident.hnfReset) restore();
  for (const restore of resident.analyticReset) restore();
  for (const restore of resident.acceptanceReset) restore();
  units.reset(resident.unitResident);
}

function runResident(resident) {
  resetResident(resident);
  const started = process.hrtime.bigint();
  const factorStatus = factorRoot.runNative(resident.factorResident);
  const hnfStatus = resident.hnfInvocation.fn.gmp(...resident.hnfInvocation.args);
  const catalogStatus = resident.analyticInvocation.catalog.fn.gmp(
    ...resident.analyticInvocation.catalogArgs);
  const analyticStatus = resident.analyticInvocation.analytic.fn.gmp(
    ...resident.analyticInvocation.analyticArgs);
  const acceptanceStatus = resident.acceptanceInvocation.kernel.fn.gmp(
    ...resident.acceptanceInvocation.args);
  const unitStatus = units.runNative(resident.unitResident);
  const stopped = process.hrtime.bigint();
  assert.equal(factorStatus, 0n);
  verifyFactor(resident);
  assert.equal(hnfStatus, 0n); assert.equal(catalogStatus, 0n);
  assert.equal(analyticStatus, 0n); assert.equal(acceptanceStatus, 0n);
  const materialized = units.projection(resident.unitResident, unitStatus);
  const first = materialized.units.slice(0, 5), second = materialized.units.slice(5);
  const norms = [unitNorm(first, resident.prepared.basis_table),
    unitNorm(second, resident.prepared.basis_table)];
  assert(norms.every(value => value === 1n || value === -1n));
  const hnfState = Array.from(resident.hnfInvocation.values.hnf_state, Number);
  assert.deepEqual(hnfState, [0, 7, 7, 0, 7, 4, 0, 14, 0]);
  const classNumber = String(packedAt(
    resident.acceptanceInvocation.values.class_number, 0));
  assert.equal(classNumber, "1");
  return { schema: SCHEMA, kernelNanoseconds: String(stopped - started),
    classGroup: { classNumber, invariantFactors: [], generatorCount: "0" },
    unitGroup: { rank: "2", torsionOrder: "2", regulatorPresent: true,
      coordinates: materialized.units, norms: norms.map(String) },
    exact: { hnfState, unitState: materialized.residentState,
      relationCount: "14", factorBaseSize: "7" },
    boundary: { allocationInsideClock: false, filesystemInsideClock: false,
      subprocessesInsideClock: false, serializationInsideClock: false,
      resetInsideClock: false, nativeCallsInsideClock: 6 },
    allocationFreeMatchedClock: true, correspondenceComplete: true,
    publicComplete: false };
}

module.exports = { SCHEMA, determinant, prepareResident, resetResident,
  runResident, unitNorm };
