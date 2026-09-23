"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const PREPARED_SHA256 =
  "63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f";
const FIRST_HNF_SHA256 =
  "a0eec806853ea37226ded40be707f95abb414b9af6e3bb0a811493147382c136";
const SCHEMA = "sagejs.pari-class-group/row21-live-hnf-log-regulator-owner-v1";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const canonical = value => JSON.stringify(value);

function authenticate(prepared, firstHnfOwner) {
  const auth = require("./prepared_nf_authentication.cjs");
  assert.equal(auth.authenticatePreparedNf(prepared).sha256, PREPARED_SHA256);
  assert.equal(firstHnfOwner.schema,
    "sagejs.pari-class-group/row21-first-hnf-owner-v1");
  assert.equal(sha(Buffer.from(`${canonical(firstHnfOwner)}\n`)), FIRST_HNF_SHA256);
  assert.equal(firstHnfOwner.provenance.frozenAnswerInputs, false);
  assert.equal(firstHnfOwner.publication.firstHnfComplete, true);
  assert.deepEqual(firstHnfOwner.hnf.C, [4, 32]);
}
function publish(directory, owner) {
  fs.mkdirSync(directory, { recursive: true });
  const plain = Buffer.from(`${canonical(owner)}\n`);
  const ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const destination = path.join(directory,
    `row21-live-hnf-log-regulator-${ownerSha256}.json.gz`);
  fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 });
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256,
    compressedSha256: sha(compressed), bytes: plain.length,
    compressedBytes: compressed.length };
}

async function run(payload) {
  assert(payload && typeof payload === "object");
  assert.deepEqual(Object.keys(payload).sort(),
    ["firstHnfOwner", "outputDirectory", "prepared"]);
  authenticate(payload.prepared, payload.firstHnfOwner);
  const host = require("./row21_acceptance_host.cjs");
  const result = await host.runAcceptance(payload.prepared, payload.firstHnfOwner);
  assert.equal(result.status, 0);
  assert.deepEqual(result.analytic.state, [2135, 321]);
  assert.deepEqual(result.postHnfState, [0, 8, 1]);
  assert.deepEqual(result.multipleState, [0, 0, 185, 2]);
  assert.deepEqual(result.acceptanceState, [2, 0, 0]);
  assert.deepEqual(result.reconstructionState, [0, 5, 189, 3]);
  assert.equal(result.classNumber, "1");
  const owner = {
    schema: SCHEMA,
    authority: {
      preparedSha256: PREPARED_SHA256, firstHnfOwnerSha256: FIRST_HNF_SHA256,
      catalogSourceSha256: sha(fs.readFileSync(path.join(__dirname,
        "row21_analytic_catalog.py"))),
      acceptanceHostSha256: sha(fs.readFileSync(path.join(__dirname,
        "row21_acceptance_host.cjs"))),
      catalogCoreSha256: sha(fs.readFileSync(result.analytic.catalogBuilt.coreSourcePath)),
      analyticCoreSha256: sha(fs.readFileSync(result.analytic.analyticBuilt.coreSourcePath)),
      acceptanceCoreSha256: sha(fs.readFileSync(result.kernel.built.coreSourcePath)),
    },
    field: { degree: 5, signature: [3, 1], precision: 192, unitRank: 3 },
    hnf: { H: payload.firstHnfOwner.hnf.H, dep: payload.firstHnfOwner.hnf.dep,
      B: payload.firstHnfOwner.hnf.B, C: payload.firstHnfOwner.hnf.C,
      exactC: payload.firstHnfOwner.hnf.exactC,
      permutation: payload.firstHnfOwner.hnf.permutation },
    analytic: { catalogState: result.analytic.catalogState,
      state: result.analytic.state.map(String), inverseHr: result.analytic.inverseHr },
    acceptance: { postHnfState: result.postHnfState.map(String),
      multipleState: result.multipleState.map(String),
      state: result.acceptanceState.map(String),
      reconstructionState: result.reconstructionState.map(String),
      classNumber: result.classNumber, regulator: result.regulator,
      relationLattice: result.lattice, realLogs: result.logs,
      multiple: result.multiple, coordinates: result.coordinates },
    publication: { hnfColumns: 32, unitLogColumns: 8,
      acceptedUnitRank: 3, liveRankThreeSuffixReady: true },
    provenance: { frozenAnswerInputs: false,
      accepted: ["authenticated prepared nf owner", "authenticated live first-HNF owner"],
      forbidden: ["W0 analytic degree patterns", "W0 inverse hR", "W0 regulator",
        "W0 acceptance lattice", "W0 fundamental units"] },
  };
  return { ...publish(payload.outputDirectory, owner), owner };
}

module.exports = { PREPARED_SHA256, FIRST_HNF_SHA256, SCHEMA, authenticate, run };
