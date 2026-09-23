"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const SCHEMA = "sagejs.pari-class-group/row23-live-exact-unit-owner-v2";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const canonical = value => JSON.stringify(value);

function validate(owner) {
  assert(owner && typeof owner === "object" && !Array.isArray(owner));
  assert.deepEqual(Object.keys(owner).sort(), ["acceptanceAuthoritySha256", "analytic",
    "classNumber", "exactInversesIntegralBasis", "exactNorms", "exactRealSigns",
    "factorOwnerSha256", "field", "getfuFactor", "native", "outputPackedLogs",
    "qualifiedTiming", "rankFourStates", "regulator", "regulatorAuthoritySha256",
    "relationToUnit", "schema", "solveState", "state", "unitRank",
    "unitsIntegralBasis"].sort());
  assert.equal(owner.schema, SCHEMA);
  assert.equal(owner.field, "5.5.1002836007889.1");
  assert.equal(owner.classNumber, "6");
  assert.equal(owner.unitRank, 4);
  assert.equal(owner.qualifiedTiming, false);
  assert.deepEqual(owner.state, [0, 20, 0, 4, 13, 3]);
  assert.deepEqual(owner.solveState, [0, 5, 4, -222, 4]);
  assert(Array.isArray(owner.unitsIntegralBasis) && owner.unitsIntegralBasis.length === 4);
  for (const unit of owner.unitsIntegralBasis)
    assert(Array.isArray(unit) && unit.length === 5 && unit.every(value => /^-?\d+$/.test(value)));
  assert.equal(owner.exactInversesIntegralBasis.length, 4);
  assert.equal(owner.exactNorms.length, 4);
  assert(owner.exactNorms.every(value => value === "1" || value === "-1"));
  assert.equal(owner.exactRealSigns.length, 4);
  assert(owner.exactRealSigns.every(row => row.length === 5 &&
    row.every(value => value === 1 || value === -1)));
  assert.equal(owner.relationToUnit.length, 36);
  assert.equal(owner.getfuFactor.length, 16);
  assert.equal(owner.outputPackedLogs.length, 140);
  assert(Array.isArray(owner.regulator) && owner.regulator.length === 3);
  assert.equal(owner.analytic.inverseHr.length, 3);
  return owner;
}

function compose({ prepared, factor, acceptance, bridge, units }) {
  assert.equal(prepared.n, "5");
  assert.equal(prepared.admission_real_count, "5");
  assert.equal(acceptance.status, 0);
  assert.equal(bridge.status, 0);
  assert.equal(units.status, 0);
  const flat = units.exactUnitsIntegralBasis;
  const inverseFlat = units.exactInversesIntegralBasis;
  const inverseMask = units.state[4];
  const packedLogs = bridge.candidateA.slice();
  for (let column = 0; column < 4; column += 1)
    if ((inverseMask & (1 << column)) !== 0)
      for (let row = 0; row < 5; row += 1) {
        const at = 7 * (5 * column + row);
        packedLogs[at + 1] = String(-BigInt(packedLogs[at + 1]));
        packedLogs[at + 4] = String(-BigInt(packedLogs[at + 4]));
      }
  const acceptanceAuthority = {
    classNumber: acceptance.classNumber,
    regulator: acceptance.regulator,
    lattice: acceptance.lattice,
    postHnfState: acceptance.postHnfState,
    multipleState: acceptance.multipleState,
    acceptanceState: acceptance.acceptanceState,
    reconstructionState: acceptance.reconstructionState,
  };
  return validate({
    schema: SCHEMA,
    field: "5.5.1002836007889.1",
    classNumber: acceptance.classNumber,
    unitRank: 4,
    unitsIntegralBasis: Array.from({ length: 4 }, (_, column) =>
      flat.slice(5 * column, 5 * column + 5)),
    exactInversesIntegralBasis: Array.from({ length: 4 }, (_, column) =>
      inverseFlat.slice(5 * column, 5 * column + 5)),
    exactNorms: units.exactNorms.slice(),
    exactRealSigns: units.exactRealSigns.map(row => row.slice()),
    relationToUnit: bridge.U.slice(),
    getfuFactor: bridge.factor.slice(),
    outputPackedLogs: packedLogs,
    rankFourStates: structuredClone(bridge.states),
    regulator: acceptance.regulator.slice(),
    regulatorAuthoritySha256: sha(Buffer.from(canonical(acceptance.regulator))),
    acceptanceAuthoritySha256: sha(Buffer.from(canonical(acceptanceAuthority))),
    analytic: {
      inverseHr: acceptance.analytic.inverseHr.slice(),
      state: acceptance.analytic.state.slice(),
      catalogState: acceptance.analytic.catalogState.slice(),
    },
    state: units.state.slice(),
    solveState: units.solveState.slice(),
    factorOwnerSha256: factor.ownerSha256,
    native: {
      sourcePath: path.basename(units.native.sourcePath),
      cacheKey: units.native.cacheKey,
      exactUnitsSha256: units.exactUnitsSha256,
      exponentialRhsSha256: units.exponentialRhsSha256,
      candidateUnitsSha256: units.candidateUnitsSha256,
      unitTransformSha256: bridge.hashes.U,
    },
    qualifiedTiming: false,
  });
}

function publish(owner, directory) {
  validate(owner);
  fs.mkdirSync(directory, { recursive: true });
  const plain = Buffer.from(`${canonical(owner)}\n`);
  const contentSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const destination = path.join(directory,
    `row23-live-exact-unit-owner-${contentSha256}.json.gz`);
  fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 });
  fs.chmodSync(destination, 0o444);
  return { path: destination, contentSha256,
    compressedSha256: sha(compressed), bytes: plain.length,
    compressedBytes: compressed.length };
}

function authenticate(bytes, expectedSha256) {
  assert(Buffer.isBuffer(bytes));
  assert.equal(sha(bytes), expectedSha256, "row-23 live unit owner digest changed");
  return validate(JSON.parse(bytes.toString("utf8")));
}

module.exports = { SCHEMA, authenticate, compose, publish };
