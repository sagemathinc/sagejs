"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const PREPARED_SHA256 =
  "63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f";
const ACCEPTANCE_SHA256 =
  "530fbd38198464fcac1285402cdb1394bdb8ce82f876198770aaef475b2749bb";
const SCHEMA = "sagejs.pari-class-group/row21-live-unit-owner-v1";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const canonical = value => JSON.stringify(value);

function authenticate(prepared, acceptanceOwner) {
  const preparedAuth = require("./prepared_nf_authentication.cjs");
  assert.equal(preparedAuth.authenticatePreparedNf(prepared).sha256,
    PREPARED_SHA256);
  assert.equal(acceptanceOwner.schema,
    "sagejs.pari-class-group/row21-live-hnf-log-regulator-owner-v1");
  assert.equal(sha(Buffer.from(`${canonical(acceptanceOwner)}\n`)),
    ACCEPTANCE_SHA256);
  assert.equal(acceptanceOwner.provenance.frozenAnswerInputs, false);
  assert.equal(acceptanceOwner.publication.liveRankThreeSuffixReady, true);
}

function unitColumns(values) {
  return Array.from({ length: 3 }, (_, column) =>
    values.slice(5 * column, 5 * column + 5));
}

function verifyOwnerAgainstResult(owner, result) {
  assert.equal(owner.schema, SCHEMA);
  assert.deepEqual(owner.units.exactIntegralBasis, unitColumns(result.units));
  assert.deepEqual(owner.units.exactInverseIntegralBasis,
    unitColumns(result.inverses));
  assert.deepEqual(owner.units.norms, result.norms);
  assert.deepEqual(owner.units.realSigns, result.realSigns);
  assert.deepEqual(owner.transforms.getfuFactor, result.factor);
  assert.deepEqual(owner.replay.getfuState, result.getfuState.map(String));
  assert.deepEqual(owner.replay.outputLogs.real, result.logsReal);
  assert.deepEqual(owner.replay.outputLogs.imaginary, result.logsImag);
  return true;
}

function publish(directory, owner) {
  fs.mkdirSync(directory, { recursive: true });
  const plain = Buffer.from(`${canonical(owner)}\n`);
  const ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const destination = path.join(directory, `row21-live-units-${ownerSha256}.json.gz`);
  fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 });
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256, compressedSha256: sha(compressed),
    bytes: plain.length, compressedBytes: compressed.length };
}

async function run(payload) {
  assert(payload && typeof payload === "object");
  assert.deepEqual(Object.keys(payload).sort(),
    ["acceptanceOwner", "outputDirectory", "prepared"]);
  authenticate(payload.prepared, payload.acceptanceOwner);
  const host = require("./row21_live_unit_host.cjs");
  const result = await host.runLiveUnits(payload.prepared, payload.acceptanceOwner);
  assert.deepEqual(result.getfuRealState, [0, 0]);
  assert.deepEqual(result.getfuState, [0, 5, -185, 0, -130, 2, 3, 1]);
  assert.deepEqual(result.factor, ["1", "0", "0", "0", "1", "0", "1", "0", "1"]);
  assert.deepEqual(result.norms, ["-1", "-1", "-1"]);
  assert.deepEqual(result.realSigns,
    [[-1, 1, 1], [1, -1, 1], [1, -1, 1]]);
  const readSha = filename => sha(fs.readFileSync(path.join(__dirname, filename)));
  const owner = {
    schema: SCHEMA,
    authority: { preparedSha256: PREPARED_SHA256,
      acceptanceOwnerSha256: ACCEPTANCE_SHA256,
      hostSourceSha256: readSha("row21_live_unit_host.cjs"),
      getfuSourceSha256: readSha("row21_rank3_getfu.py"),
      latticeSourceSha256: readSha("row21_rank3_unit_lattice.py"),
      getfuCoreSha256: sha(fs.readFileSync(result.built.coreSourcePath)),
      latticeCoreSha256: sha(fs.readFileSync(result.latticeBuilt.coreSourcePath)) },
    field: { degree: 5, signature: [3, 1], unitRank: 3, precision: 192 },
    ancestry: { classNumber: payload.acceptanceOwner.acceptance.classNumber,
      regulator: payload.acceptanceOwner.acceptance.regulator,
      relationLattice: payload.acceptanceOwner.acceptance.relationLattice,
      acceptanceCoordinates: payload.acceptanceOwner.acceptance.coordinates,
      hnf: { H: payload.acceptanceOwner.hnf.H,
        dep: payload.acceptanceOwner.hnf.dep,
        permutation: payload.acceptanceOwner.hnf.permutation } },
    transforms: { integerLll: result.lattice.u1,
      realLll: result.lattice.u2,
      relationToUnit: result.lattice.unitTransform,
      getfuFactor: result.factor },
    units: { exactIntegralBasis: unitColumns(result.units),
      exactInverseIntegralBasis: unitColumns(result.inverses),
      norms: result.norms, realSigns: result.realSigns },
    replay: { integerLatticeState: result.lattice.integerState.map(String),
      realLatticeState: result.lattice.realState.map(String),
      cleanarchState: result.lattice.cleanarchState.map(String),
      getfuRealLatticeState: result.getfuRealState.map(String),
      getfuState: result.getfuState.map(String),
      outputLogs: { real: result.logsReal, imaginary: result.logsImag } },
    publication: { exactUnitCount: 3, exactInversesVerified: true,
      exactNormsVerified: true, exactRealSignsVerified: true,
      finalAssemblyReady: true },
    provenance: { frozenAnswerInputs: false,
      accepted: ["authenticated prepared nf owner",
        "authenticated live HNF/log/regulator owner"],
      forbidden: ["W0 fundamental units", "W0 unit inverses",
        "W0 regulator", "W0 class-group answer"] },
  };
  verifyOwnerAgainstResult(owner, result);
  return { ...publish(payload.outputDirectory, owner), owner, result };
}

module.exports = { PREPARED_SHA256, ACCEPTANCE_SHA256, SCHEMA, authenticate,
  verifyOwnerAgainstResult, run };
