#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_CAPSULE = "/tmp/row14-capsule-test/row14-initial-33d2606a151ecf0ba5a73c247ecf3f219ff84a2341048ebbbe374ecd9c7939b1.json.gz";
const DEFAULT_OWNER = "/tmp/sagejs-row14-prepared-root-VNkAWv/owner/row14-prepared-initial-b2088268bca4b735816d280d15bccb94f45faab9831bc7523c9dc671b6716ae0.json.gz";
const DEFAULT_W0 = "/scratch/sagejs-pari-development-panel-a998/panel-14-aa0aa6152d8cf26c.json";
const CAPSULE_SHA256 = "33d2606a151ecf0ba5a73c247ecf3f219ff84a2341048ebbbe374ecd9c7939b1";
const OWNER_SHA256 = "b2088268bca4b735816d280d15bccb94f45faab9831bc7523c9dc671b6716ae0";
const COMPRESSED_OWNER_SHA256 = "b06f0146d8d21bfaac6f43e0e33b176d30e6b61fe480050bb51ff74d9d35b833";
const W0_SHA256 = "13f7e37fe4ba3c610e2c4340c243fa9da398b8d32a272b3c450525c287afe18a";
const ROWS = 799, PLACES = 3;
const EXPECTED_STATES = [
  [3, 10, 792, 4, 7, 105, 0, 802, 0],
  [4, 11, 793, 2, 7, 1, 0, 804, 0],
  [2, 9, 796, 1, 7, 3, 0, 805, 0],
  [3, 10, 796, 0, 7, 0, 0, 806, 0],
];
const EXPECTED_TRACE = [
  { pass: 1, need: 4, searchCount: 4, squash: 0, before: 802, after: 804,
    schedule: [0, 1, 1, 0], outer: [0,4,2,0,800,804,804,2,0,0,0,802,1,799,0,0,3,1,0] },
  { pass: 2, need: 2, searchCount: 2, squash: 0, before: 804, after: 805,
    schedule: [0, 1, 1, 0], outer: [0,4,3,0,800,805,805,1,0,0,0,804,2,799,0,0,4,1,0] },
  { pass: 3, need: 1, searchCount: 1, squash: 0, before: 805, after: 805,
    schedule: [0, 1, 1, 0], outer: [0,4,4,1,800,805,805,1,0,0,0,805,3,799,0,0,2,1,0] },
  { pass: 4, need: 1, searchCount: 1, squash: 0, before: 805, after: 805,
    schedule: [0, 1, 1, 0], outer: [0,4,5,2,800,805,805,1,0,0,0,805,4,799,0,0,2,1,0] },
  { pass: 5, need: 1, searchCount: 1, squash: 0, before: 805, after: 805,
    schedule: [0, 1, 1, 0], outer: [0,4,6,3,800,805,805,1,0,0,0,805,5,799,0,0,2,1,0] },
  { pass: 6, need: 1, searchCount: 1, squash: 0, before: 805, after: 805,
    schedule: [0, 1, 1, 0], outer: [0,4,7,4,800,805,805,1,0,0,0,805,6,799,0,0,2,1,0] },
  { pass: 7, need: 1, searchCount: 1, squash: 0, before: 805, after: 806,
    schedule: [0, 1, 1, 1], outer: [0,4,8,0,800,806,806,0,0,0,0,805,7,799,0,0,2,1,0] },
];

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => sha256(Buffer.from(JSON.stringify(value)));

function integer(value) {
  assert.equal(value.kind, "integer");
  return value.value;
}

function integerMatrix(matrix) {
  assert.equal(matrix.kind, "matrix");
  return matrix.values.flatMap(column => column.values.map(integer));
}

function realTriple(value) {
  if (value.kind === "integer") return [value.value, "-1", "0"];
  assert.equal(value.kind, "real");
  return [value.mantissa, String(value.precision), String(value.exponent)];
}

function logMatrix(matrix) {
  assert.equal(matrix.kind, "matrix");
  return matrix.values.flatMap(column => column.values.flatMap(value => {
    if (value.kind === "complex")
      return ["2", ...realTriple(value.real), ...realTriple(value.imag)];
    return ["1", ...realTriple(value), "0", "-1", "0"];
  }));
}

async function worker() {
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  assert.deepEqual(Object.keys(payload).sort(), ["prepared", "rootOwner"]);
  assert.deepEqual(Object.keys(payload.rootOwner).sort(), ["compressedSha256", "path",
    "plainSha256"]);
  const compressed = fs.readFileSync(payload.rootOwner.path);
  assert.equal(sha256(compressed), payload.rootOwner.compressedSha256);
  assert.equal(fs.statSync(payload.rootOwner.path).mode & 0o222, 0,
    "prepared root owner must be immutable");
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha256(plain), payload.rootOwner.plainSha256);
  const rootOwner = JSON.parse(plain);

  const { runPreparedGateC } = require("./row14_prepared_gate_c_host.cjs");
  const started = process.hrtime.bigint();
  const live = await runPreparedGateC(payload.prepared, rootOwner);
  const elapsedNs = process.hrtime.bigint() - started;
  assert.deepEqual(live.checkpoints.map(checkpoint => checkpoint.state), EXPECTED_STATES);
  assert.deepEqual(live.passTrace, EXPECTED_TRACE);
  assert.equal(live.collectionPasses, 8);
  assert.deepEqual(live.collectorValues.relation_state.toArray().map(String),
    ["806", "8110", "0", "0", "806", "806"]);

  const records = live.collectorValues.relation_records.toArray().map(String);
  const logs = live.collectorValues.log_embeddings.toArray().map(String);
  const checkpointHashes = live.checkpoints.map(checkpoint => ({
    columns: checkpoint.columns, state: checkpoint.state,
    hashes: {
      relations: hash(records.slice(0, ROWS * checkpoint.columns)),
      logs: hash(logs.slice(0, 7 * PLACES * checkpoint.columns)),
      h: hash(checkpoint.h), dep: hash(checkpoint.dep), b: hash(checkpoint.b),
      c: hash(checkpoint.c), perm: hash(checkpoint.perm),
    },
  }));
  const columns = 806;
  const identities = {
    generators: hash(live.collectorValues.generators.toArray().slice(0, 4 * columns).map(String)),
    hashes: hash(live.collectorValues.relation_hashes.toArray().slice(0, columns).map(String)),
    metadata: hash(live.collectorValues.relation_metadata.toArray().slice(0, 3 * columns).map(String)),
  };
  process.stdout.write(`${JSON.stringify({ checkpointHashes, identities,
    relationState: live.collectorValues.relation_state.toArray().map(String),
    collectionPasses: live.collectionPasses, passTrace: live.passTrace,
    ownerBytesUpperBound: live.ownerBytesUpperBound, elapsedNs: String(elapsedNs),
    maxRssKiB: process.resourceUsage().maxRSS,
    preparedRngSha256: hash(live.preparedRng) })}\n`);
}

function main() {
  const capsulePath = path.resolve(process.argv[2] || DEFAULT_CAPSULE);
  const ownerPath = path.resolve(process.argv[3] || DEFAULT_OWNER);
  const w0Path = path.resolve(process.argv[4] || DEFAULT_W0);
  const capsuleRaw = fs.readFileSync(capsulePath);
  assert.equal(sha256(capsuleRaw), CAPSULE_SHA256);
  const capsule = JSON.parse(zlib.gunzipSync(capsuleRaw));
  const auth = require("./prepared_nf_authentication.cjs");
  const preparedData = auth.normalizePreparedBundle(capsule);
  const authority = auth.authenticatePreparedBundle(capsule);
  const childPayload = { prepared: { authoritySha256: authority.sha256, data: preparedData },
    rootOwner: { path: ownerPath, plainSha256: OWNER_SHA256,
      compressedSha256: COMPRESSED_OWNER_SHA256 } };
  const run = spawnSync("prlimit", ["--as=4294967296", "--cpu=600", "--",
    process.execPath, __filename, "--worker"], { cwd: ROOT, encoding: "utf8",
    input: JSON.stringify(childPayload), timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" } });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const result = JSON.parse(run.stdout);
  assert(result.ownerBytesUpperBound < 4 * 1024 ** 3);
  assert(result.maxRssKiB < 4 * 1024 * 1024);
  assert.deepEqual(result.passTrace, EXPECTED_TRACE);

  // The frozen trace is admitted only after the capped connected worker has
  // exited. It is a differential oracle, never an input to Gate C.
  const w0Raw = fs.readFileSync(w0Path);
  assert.equal(sha256(w0Raw), W0_SHA256);
  const events = JSON.parse(w0Raw).events.filter(event => event.event === "hnf");
  assert.deepEqual(events.map(event => event.relations), [802, 804, 805, 806]);
  const oracleHashes = events.map(event => ({ columns: event.relations,
    state: EXPECTED_STATES[events.indexOf(event)], hashes: {
      relations: hash(event.relationRecords.flatMap(record => record.R.values.map(String))),
      logs: hash(logMatrix(event.exactEmbeddings)), h: hash(integerMatrix(event.exactW)),
      dep: hash(integerMatrix(event.exactDep)), b: hash(integerMatrix(event.exactB)),
      c: hash(logMatrix(event.exactC)), perm: hash(event.perm.values.map(String)),
    } }));
  assert.deepEqual(result.checkpointHashes, oracleHashes);

  const finalRecords = events.at(-1).relationRecords;
  const expectedIdentities = {
    generators: hash(finalRecords.flatMap(record => record.m.kind === "integer" ?
      [record.m.value, "0", "0", "0"] : record.m.values.map(integer))),
    hashes: hash(finalRecords.map(record => String(record.nz))),
    metadata: hash(finalRecords.flatMap((record, index) =>
      [String(index + 1), String(record.origin), String(record.automorphism)])),
  };
  assert.deepEqual(result.identities, expectedIdentities);

  const forbidden = structuredClone(capsule);
  forbidden.factorBaseDescriptors[0].values[0].value = "3";
  forbidden.initialRelations[0].multiplier = "3";
  forbidden.sourceSchedule.factorBase.C1 = 1;
  forbidden.sourceSchedule.factorBase.rng[0] = "0";
  assert.equal(hash(auth.normalizePreparedBundle(forbidden)), hash(preparedData));
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/row14-prepared-gate-c-check-v1",
    preparedAuthoritySha256: authority.sha256, rootOwnerSha256: OWNER_SHA256,
    relationState: result.relationState, collectionPasses: result.collectionPasses,
    passTrace: result.passTrace, checkpoints: result.checkpointHashes,
    relationIdentityHashes: result.identities,
    preparedRngSha256: result.preparedRngSha256,
    elapsedNs: result.elapsedNs, maxRssKiB: result.maxRssKiB,
    ownerBytesUpperBound: result.ownerBytesUpperBound,
    limits: { addressSpaceBytes: 4 * 1024 ** 3, cpuSeconds: 600,
      wallTimeoutSeconds: 600, nodeOldSpaceMiB: 3072 },
    runtimeInputs: ["neutral prepared-nf projection", "immutable prepared-root owner"],
    postExitOracle: { path: w0Path, sha256: W0_SHA256 },
    excludedRuntimeInputs: ["capsule", "W0", "factor metadata", "accepted relation owner"],
    forbiddenMutationProjectionUnchanged: true,
  }, null, 2));
}

if (process.argv[2] === "--worker") worker().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
else main();
