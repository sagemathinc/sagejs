"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const HERE = __dirname;
const SCHEMA = "sagejs.pari-class-group/row21-first-hnf-owner-v1";
const PREPARED_SHA256 = "63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f";
const FACTOR_SHA256 = "7784eef663b7ca2fad9259f2efe642a14aac511331d0ca9de93fae050aebc533";
const RELATION_SHA256 = "55f1f55a6b02a5d703834af49a716280f7841f3b399af92cdaf258c4b9855233";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value);
const view = value => (value.toArray ? value.toArray() : Array.from(value)).map(String);

function authenticate(payload) {
  assert.deepEqual(Object.keys(payload).sort(),
    ["factorOwner", "outputDirectory", "prepared", "relationOwner"]);
  const auth = require("./prepared_nf_authentication.cjs");
  assert.equal(auth.authenticatePreparedNf(payload.prepared).sha256, PREPARED_SHA256);
  const factor = require("./row21_relation_hnf_frontier_coordinator.cjs");
  factor.authenticateFactorOwner(payload.factorOwner);
  assert.equal(sha(Buffer.from(`${canonical(payload.factorOwner)}\n`)), FACTOR_SHA256);
  assert.equal(sha(Buffer.from(`${canonical(payload.relationOwner)}\n`)), RELATION_SHA256);
  assert.equal(payload.relationOwner.schema,
    "sagejs.pari-class-group/row21-initial-relation-frontier-v1");
  assert.equal(payload.relationOwner.authority.factorOwnerSha256, FACTOR_SHA256);
  assert.deepEqual(payload.relationOwner.relations.frontierState,
    ["1", "5", "32", "27", "4", "19", "370", "24", "15", "8"]);
}

function publish(directory, owner) {
  fs.mkdirSync(directory, { recursive: true });
  const plain = Buffer.from(`${canonical(owner)}\n`), ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const destination = path.join(directory, `row21-first-hnf-${ownerSha256}.json.gz`);
  fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 });
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256, compressedSha256: sha(compressed),
    bytes: plain.length, compressedBytes: compressed.length };
}

async function run(payload) {
  authenticate(payload);
  const host = require("./row21_first_hnf_host.cjs");
  const result = await host.runFirstHnf(payload.prepared, payload.factorOwner);
  assert.equal(result.status, 0);
  assert.deepEqual(result.relationState, ["32", "370", "0", "0", "0", "32"]);
  assert.deepEqual(result.chainState, [3, 0, 5, 32]);
  assert.deepEqual(result.hnfState, [0, 8, 24, 0, 8, 5, 0, 32, 0]);
  const values = result.values;
  const owner = {
    schema: SCHEMA,
    authority: { preparedSha256: PREPARED_SHA256, factorOwnerSha256: FACTOR_SHA256,
      relationOwnerSha256: RELATION_SHA256,
      connectedSourceSha256: sha(fs.readFileSync(path.join(HERE, "connected_relation_hnf.py"))),
      collectorSourceSha256: sha(fs.readFileSync(path.join(HERE, "unreduced_small_norm.py"))),
      hostSourceSha256: sha(fs.readFileSync(path.join(HERE, "row21_first_hnf_host.cjs"))),
      coreSha256: sha(fs.readFileSync(result.built.coreSourcePath)) },
    state: { relation: result.relationState, chain: result.chainState.map(String),
      hnf: result.hnfState.map(String), collector: result.collectorState },
    relations: { rows: 24, columns: 32,
      records: view(values.relation_records).slice(0, 24 * 32),
      generators: view(values.generators).slice(0, 5 * 32),
      metadata: view(values.relation_metadata).slice(0, 3 * 32) },
    hnf: { H: [0, 0], dep: [0, 0], B: [0, 24], C: [4, 32],
      exactH: [], exactDep: [], exactB: [],
      exactC: view(values.hnf_result_c).slice(0, 7 * 4 * 32),
      permutation: view(values.hnf_perm) },
    provenance: { frozenAnswerInputs: false,
      accepted: ["authenticated prepared nf owner", "authenticated factor-base owner",
        "authenticated five-relation frontier owner"],
      forbidden: ["W0 candidates", "W0 relation rows", "W0 logs", "W0 HNF"] },
    publication: { initialRelations: 5, collectedRelations: 32,
      exactLogs: 32, firstHnfComplete: true },
  };
  return { ...publish(payload.outputDirectory, owner), owner };
}

module.exports = { FACTOR_SHA256, PREPARED_SHA256, RELATION_SHA256, SCHEMA, run };
