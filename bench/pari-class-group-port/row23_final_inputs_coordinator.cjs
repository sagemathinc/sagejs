#!/usr/bin/env node
"use strict";

// Publish the live row-23 relation/HNF and analytic-acceptance projections
// needed by the final immutable buchall_end composer.  The projections retain
// every active relation, logarithm, and transformation cell while omitting the
// large unused capacity tails of the native workspaces.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const PREPARED_SHA256 = "0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299";
const FACTOR_SHA256 = "b4fa7209eb9fcd86438dc8d1f0fac9d194a32535f612de97ed605da6ca2bf439";
const RELATION_SCHEMA = "sagejs.pari-class-group/row23-live-relation-hnf-owner-v1";
const ACCEPTANCE_SCHEMA = "sagejs.pari-class-group/row23-live-acceptance-owner-v1";

class Row23FinalInputFailure extends Error {}
const fail = message => { throw new Row23FinalInputFailure(message); };
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const array = (owner, length = owner.length) =>
  (owner.toArray ? owner.toArray() : Array.from(owner)).slice(0, length);
const strings = (owner, length = owner.length) => array(owner, length).map(String);
const numbers = (owner, length = owner.length) => array(owner, length).map(Number);

function strictGzipOwner(filename, schema, expectedSha256) {
  const compressed = fs.readFileSync(filename);
  let raw;
  try { raw = zlib.gunzipSync(compressed); } catch { fail(`invalid gzip owner: ${filename}`); }
  if (sha(raw) !== expectedSha256) fail(`owner authority changed: ${filename}`);
  const owner = JSON.parse(raw);
  if (owner?.schema !== schema) fail(`owner schema changed: ${filename}`);
  return { owner, raw, sha256: expectedSha256 };
}

function publish(owner, directory, stem) {
  const raw = Buffer.from(`${JSON.stringify(owner)}\n`);
  const ownerSha256 = sha(raw);
  const compressed = zlib.gzipSync(raw, { level: 9, mtime: 0 });
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `${stem}-${ownerSha256}.json.gz`);
  if (fs.existsSync(destination)) {
    const current = fs.readFileSync(destination);
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 ||
        !zlib.gunzipSync(current).equals(raw)) fail(`immutable ${stem} owner conflicts`);
  } else {
    const temporary = path.join(directory,
      `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, compressed, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination);
      fs.chmodSync(destination, 0o444);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  return { path: destination, ownerSha256, compressedSha256: sha(compressed),
    bytes: raw.length, compressedBytes: compressed.length, owner };
}

function relationProjection(live, factorSha256) {
  if (live?.status !== 0) fail("row-23 relation/HNF root is not terminal");
  const value = live.values;
  const owner = {
    schema: RELATION_SCHEMA,
    authority: {
      preparedSha256: PREPARED_SHA256,
      factorOwnerSha256: factorSha256,
      relationSourceSha256: sha(fs.readFileSync(
        path.join(__dirname, "row23_connected_relation_hnf.py"))),
      relationCoreSha256: sha(fs.readFileSync(live.built.coreSourcePath)),
    },
    dimensions: { degree: 5, factorRows: 31, relations: 40,
      hnfRows: 4, hnfColumns: 13, logPlaces: 5, logWidth: 7 },
    state: {
      relation: live.relationState,
      chain: live.chainState,
      hnf: live.hnfState,
      collector: live.collectorState,
      assembly: numbers(value.hnf_assembly_state, 6),
      final: numbers(value.hnf_final_state, 7),
      diagonal: numbers(value.hnf_diagonal, 4),
    },
    relations: {
      recordsShape: [31, 40],
      recordsColumnMajor: strings(value.relation_records, 31 * 40),
      principalGeneratorsShape: [40, 5],
      principalGenerators: strings(value.generators, 40 * 5),
      metadataShape: [40, 3],
      metadata: strings(value.relation_metadata, 40 * 3),
    },
    hnf: {
      originalShape: [31, 40],
      original: strings(value.hnf_original, 31 * 40),
      cleanupTransformShape: [40, 40],
      cleanupTransform: strings(value.hnf_transform, 40 * 40),
      fullHShape: [4, 13],
      fullH: strings(value.hnf_full_h, 4 * 13),
      hnfTransformShape: [13, 13],
      hnfTransform: strings(value.hnf_hnf_transform, 13 * 13),
      hnfLambdaShape: [13, 13],
      hnfLambda: strings(value.hnf_lam, 13 * 13),
      hnfDenominatorsShape: [14],
      hnfDenominators: strings(value.hnf_d, 14),
      terminalWShape: [1, 1],
      terminalW: strings(value.hnf_result_h, 1),
      terminalDepShape: [31, 0],
      terminalDep: [],
      terminalBShape: [30, 1],
      terminalB: strings(value.hnf_result_b, 30),
      terminalPermutation: strings(value.hnf_perm, 31),
      exactLogShape: [9, 5, 7],
      exactLogs: strings(value.hnf_result_c, 9 * 5 * 7),
    },
    provenance: {
      preparedInputOnly: true,
      frozenRelationInput: false,
      frozenLogInput: false,
      activeCapacityOnly: true,
      postcomputeOracleConsumed: false,
    },
  };
  if (JSON.stringify(owner.relations.recordsColumnMajor) !==
      JSON.stringify(owner.hnf.original)) fail("row-23 HNF input detached from relations");
  return owner;
}

function acceptanceProjection(acceptance, relationSha256) {
  if (acceptance?.status !== 0 || acceptance.classNumber !== "6")
    fail("row-23 acceptance root is not terminal");
  return {
    schema: ACCEPTANCE_SCHEMA,
    authority: {
      preparedSha256: PREPARED_SHA256,
      relationOwnerSha256: relationSha256,
      acceptanceSourceSha256: sha(fs.readFileSync(
        path.join(__dirname, "row23_post_hnf_acceptance.py"))),
      analyticSourceSha256: sha(fs.readFileSync(
        path.join(__dirname, "row23_analytic_catalog.py"))),
    },
    analytic: {
      inverseHr: acceptance.analytic.inverseHr,
      state: acceptance.analytic.state,
      catalogState: acceptance.analytic.catalogState,
    },
    acceptance: {
      classNumber: acceptance.classNumber,
      regulator: acceptance.regulator,
      relationLatticeShape: [4, 9],
      relationLattice: acceptance.lattice,
      packedLogsShape: [5, 9, 3],
      packedLogs: strings(acceptance.values.logs, 5 * 9 * 3),
      coordinatesShape: [4, 9, 3],
      coordinates: acceptance.coordinates,
      multiple: acceptance.multiple,
      postHnfState: acceptance.postHnfState,
      multipleState: acceptance.multipleState,
      state: acceptance.acceptanceState,
      reconstructionState: acceptance.reconstructionState,
    },
    provenance: {
      liveRelationInput: true,
      frozenAcceptanceInput: false,
      postcomputeOracleConsumed: false,
      regulatorRigorousEnclosure: false,
    },
  };
}

async function run({ prepared, factorPath, outputDirectory }) {
  const auth = require("./prepared_nf_authentication.cjs");
  if (auth.authenticatePreparedNf(prepared).sha256 !== PREPARED_SHA256)
    fail("row-23 prepared authority changed");
  const factor = strictGzipOwner(factorPath,
    "sagejs.pari-class-group/row23-prepared-factor-base-v1", FACTOR_SHA256);
  const hnfHost = require("./row23_first_hnf_host.cjs");
  const acceptanceHost = require("./row23_acceptance_host.cjs");
  const live = await hnfHost.runFirstHnf(prepared, factor.owner);
  const relationOwner = relationProjection(live, factor.sha256);
  const relation = publish(relationOwner, outputDirectory, "row23-live-relation-hnf");
  const accepted = await acceptanceHost.runAcceptance(prepared, live);
  const acceptanceOwner = acceptanceProjection(accepted, relation.ownerSha256);
  const acceptance = publish(acceptanceOwner, outputDirectory,
    "row23-live-acceptance");
  return { relation, acceptance, live, accepted };
}

module.exports = { ACCEPTANCE_SCHEMA, FACTOR_SHA256, PREPARED_SHA256,
  RELATION_SCHEMA, Row23FinalInputFailure, acceptanceProjection, publish,
  relationProjection, run, strictGzipOwner };
