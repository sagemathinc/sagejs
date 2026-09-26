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
const DEFAULT_PREPARED =
  "/tmp/row13-prepared-projection-8e982cf9703ced18cb815b5d18bcdf3596b28c8b455ff8c01cb1cd9f5a8aad51.json";
const DEFAULT_OWNER =
  "/tmp/sagejs-row13-prepared-root-HYdFfP/owner/row13-prepared-initial-9cf71f92330b0477388a4d7d5676d53fc02b352015dcf9cc8d0f422e5863378b.json.gz";
const DEFAULT_W0 =
  "/scratch/sagejs-pari-development-panel-a998/panel-13-a0f7253a51b3045a.json";
const PREPARED_SHA256 =
  "8e982cf9703ced18cb815b5d18bcdf3596b28c8b455ff8c01cb1cd9f5a8aad51";
const OWNER_SHA256 =
  "9cf71f92330b0477388a4d7d5676d53fc02b352015dcf9cc8d0f422e5863378b";
const COMPRESSED_OWNER_SHA256 =
  "f3c33401b8d98069c0c75299a08088c6cc7d42bcdb3b329524bd135236a92404";
const W0_SHA256 =
  "50df5fa8a7b676b5216fecf2f57f3c9c60564c420a31bd0f5524447999694589";
const ROWS = 999;
const PLACES = 3;
const EXPECTED_STATES = [
  [1, 8, 987, 11, 7, 135, 0, 995, 0],
  [1, 8, 988, 10, 7, 1, 0, 996, 0],
  [1, 8, 991, 7, 7, 3, 0, 999, 0],
  [1, 8, 992, 6, 7, 1, 0, 1000, 0],
  [1, 8, 993, 5, 7, 1, 0, 1001, 0],
  [1, 8, 994, 4, 7, 1, 0, 1002, 0],
  [1, 8, 997, 1, 7, 3, 0, 1005, 0],
  [1, 8, 998, 0, 7, 1, 0, 1006, 0],
];
const EXPECTED_TRACE = [
  [1,11,11,0,995,995,2,1,995,11,0,995,1],
  [2,11,11,0,995,996,3,0,996,10,0,995,2],
  [3,10,10,0,996,999,4,0,999,7,0,996,3],
  [4,7,7,0,999,1000,5,0,1000,6,0,999,4],
  [5,6,6,0,1000,1001,6,0,1001,5,0,1000,5],
  [6,5,5,0,1001,1002,7,0,1002,4,0,1001,6],
  [7,4,4,0,1002,1005,8,0,1005,1,0,1002,7],
  [8,1,1,0,1005,1005,9,1,1005,1,0,1005,8],
  [9,1,1,0,1005,1006,10,0,1006,0,0,1005,9],
].map(([pass, need, searchCount, squash, before, after, cursor, stall,
  columns, missing, stop, previous, attempt]) => ({
  pass, need, searchCount, squash, before, after,
  schedule: [0, 1, 1, after === 1006 ? 1 : 0],
  outer: [0,4,cursor,stall,1000,columns,columns,missing,0,stop,0,previous,
    attempt,999,0,0,1,1,0],
}));

const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const hash = (value) => sha256(Buffer.from(JSON.stringify(value)));

function integer(value) {
  assert.equal(value.kind, "integer");
  return value.value;
}

function integerMatrix(matrix) {
  assert.equal(matrix.kind, "matrix");
  return matrix.values.flatMap((column) => column.values.map(integer));
}

function realTriple(value) {
  if (value.kind === "integer") return [value.value, "-1", "0"];
  assert.equal(value.kind, "real");
  return [value.mantissa, String(value.precision), String(value.exponent)];
}

function logMatrix(matrix) {
  assert.equal(matrix.kind, "matrix");
  return matrix.values.flatMap((column) =>
    column.values.flatMap((value) => {
      if (value.kind === "complex")
        return ["2", ...realTriple(value.real), ...realTriple(value.imag)];
      return ["1", ...realTriple(value), "0", "-1", "0"];
    }),
  );
}

async function worker() {
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const preparedRaw = fs.readFileSync(payload.prepared.path);
  const ownerRaw = fs.readFileSync(payload.owner.path);
  assert.equal(sha256(preparedRaw), payload.prepared.sha256);
  assert.equal(sha256(ownerRaw), payload.owner.compressedSha256);
  assert.equal(fs.statSync(payload.prepared.path).mode & 0o222, 0);
  assert.equal(fs.statSync(payload.owner.path).mode & 0o222, 0);
  const ownerPlain = zlib.gunzipSync(ownerRaw);
  assert.equal(sha256(ownerPlain), payload.owner.plainSha256);
  const { runPreparedGateC } = require("./row13_prepared_gate_c_host.cjs");
  const started = process.hrtime.bigint();
  const live = await runPreparedGateC(
    JSON.parse(preparedRaw),
    JSON.parse(ownerPlain),
  );
  const elapsedNs = process.hrtime.bigint() - started;
  assert.deepEqual(live.checkpoints.map((checkpoint) => checkpoint.state),
    EXPECTED_STATES);
  assert.deepEqual(live.passTrace, EXPECTED_TRACE);
  assert.equal(live.collectionPasses, 10);
  assert.deepEqual(live.collectorValues.relation_state.toArray().map(String),
    ["1006", "10110", "0", "0", "1006", "1006"]);
  const records = live.collectorValues.relation_records.toArray().map(String);
  const logs = live.collectorValues.log_embeddings.toArray().map(String);
  const checkpointHashes = live.checkpoints.map((checkpoint) => ({
    columns: checkpoint.columns,
    state: checkpoint.state,
    hashes: {
      relations: hash(records.slice(0, ROWS * checkpoint.columns)),
      logs: hash(logs.slice(0, 7 * PLACES * checkpoint.columns)),
      h: hash(checkpoint.h),
      dep: hash(checkpoint.dep),
      b: hash(checkpoint.b),
      c: hash(checkpoint.c),
      perm: hash(checkpoint.perm),
    },
    permutationPartitions: {
      basis: hash(checkpoint.perm.slice(0, checkpoint.state[2]).sort((a, b) =>
        Number(a) - Number(b))),
      dependent: hash(checkpoint.perm.slice(checkpoint.state[2]).sort((a, b) =>
        Number(a) - Number(b))),
    },
  }));
  process.stdout.write(`${JSON.stringify({
    checkpointHashes,
    relationState: live.collectorValues.relation_state.toArray().map(String),
    collectionPasses: live.collectionPasses,
    passTrace: live.passTrace,
    ownerBytesUpperBound: live.ownerBytesUpperBound,
    elapsedNs: String(elapsedNs),
    maxRssKiB: process.resourceUsage().maxRSS,
    preparedRngSha256: hash(live.preparedRng),
  })}\n`);
}

function main() {
  const preparedPath = path.resolve(process.argv[2] || DEFAULT_PREPARED);
  const ownerPath = path.resolve(process.argv[3] || DEFAULT_OWNER);
  const w0Path = path.resolve(process.argv[4] || DEFAULT_W0);
  const payload = {
    prepared: { path: preparedPath, sha256: PREPARED_SHA256 },
    owner: { path: ownerPath, plainSha256: OWNER_SHA256,
      compressedSha256: COMPRESSED_OWNER_SHA256 },
  };
  const run = spawnSync("prlimit", ["--as=4294967296", "--cpu=600", "--",
    process.execPath, "--expose-gc", __filename, "--worker"], {
    cwd: ROOT,
    encoding: "utf8",
    input: JSON.stringify(payload),
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const result = JSON.parse(run.stdout);
  assert(result.ownerBytesUpperBound < 4 * 1024 ** 3);
  assert(result.maxRssKiB < 4 * 1024 * 1024);

  const gate = require("./row13_prepared_gate_c_host.cjs");
  const prepared = JSON.parse(fs.readFileSync(preparedPath));
  const owner = JSON.parse(zlib.gunzipSync(fs.readFileSync(ownerPath)));
  const mutations = [
    (p, _r) => { p.authoritySha256 = "0".repeat(64); },
    (p, _r) => { p.data.prep_polynomial[0] = "11"; },
    (_p, r) => { r.relations.state[0] = "55"; },
  ];
  for (const mutate of mutations) {
    const changedPrepared = structuredClone(prepared);
    const changedOwner = structuredClone(owner);
    mutate(changedPrepared, changedOwner);
    assert.throws(() => gate.validateBoundary(changedPrepared, changedOwner));
  }

  // The cold W0 trace is opened only after the capped live worker exits.
  const w0Raw = fs.readFileSync(w0Path);
  assert.equal(sha256(w0Raw), W0_SHA256);
  const events = JSON.parse(w0Raw).events.filter((event) => event.event === "hnf");
  assert.deepEqual(events.map((event) => event.relations),
    [995, 996, 999, 1000, 1001, 1002, 1005, 1006]);
  const oracleHashes = events.map((event, index) => ({
    columns: event.relations,
    state: EXPECTED_STATES[index],
    hashes: {
      relations: hash(event.relationRecords.flatMap((record) =>
        record.R.values.map(String))),
      logs: hash(logMatrix(event.exactEmbeddings)),
      h: hash(integerMatrix(event.exactW)),
      dep: hash(integerMatrix(event.exactDep)),
      b: hash(integerMatrix(event.exactB)),
      c: hash(logMatrix(event.exactC)),
      perm: hash(event.perm.values.map(String)),
    },
    permutationPartitions: {
      basis: hash(event.perm.values.slice(0, EXPECTED_STATES[index][2]).map(String)
        .sort((a, b) => Number(a) - Number(b))),
      dependent: hash(event.perm.values.slice(EXPECTED_STATES[index][2]).map(String)
        .sort((a, b) => Number(a) - Number(b))),
    },
  }));
  const canonical = (checkpoint) => ({
    columns: checkpoint.columns,
    state: checkpoint.state,
    relations: checkpoint.hashes.relations,
    logs: checkpoint.hashes.logs,
    h: checkpoint.hashes.h,
    dep: checkpoint.hashes.dep,
    permutationPartitions: checkpoint.permutationPartitions,
  });
  assert.deepEqual(result.checkpointHashes.map(canonical), oracleHashes.map(canonical));
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/row13-prepared-gate-c-check-v1",
    preparedSha256: PREPARED_SHA256,
    rootOwnerSha256: OWNER_SHA256,
    relationState: result.relationState,
    collectionPasses: result.collectionPasses,
    passTrace: result.passTrace,
    checkpoints: result.checkpointHashes,
    oracleResidentHashes: oracleHashes.map((checkpoint) => ({
      columns: checkpoint.columns,
      b: checkpoint.hashes.b,
      c: checkpoint.hashes.c,
      perm: checkpoint.hashes.perm,
    })),
    ownerBytesUpperBound: result.ownerBytesUpperBound,
    elapsedNs: result.elapsedNs,
    maxRssKiB: result.maxRssKiB,
    preparedRngSha256: result.preparedRngSha256,
    w0Sha256: W0_SHA256,
    mutationChecks: mutations.length,
  }));
}

if (process.argv[2] === "--worker") worker().catch((error) => {
  console.error(error.stack || error);
  if (error.states) console.error(JSON.stringify(error.states));
  process.exitCode = 1;
});
else main();
