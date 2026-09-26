#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-19-0aab4dadcd4bc7c7.json";
const W0_SHA256 = "0be835c418ce9b2055cf79051db7220248299c6d53e56a84ae47b0d1ec747ad9";
const ROWS = 424, DEGREE = 3, PLACES = 2, INITIAL = 71, COLUMNS = 423;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => sha(Buffer.from(JSON.stringify(value)));

function exactInteger(value, label) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  assert.equal(value.kind, "integer", `${label} is not integral`);
  return String(value.value);
}

function exactLogs(matrix) {
  assert.equal(matrix.kind, "matrix");
  return matrix.values.flatMap(column => column.values.flatMap(value => {
    const triple = entry => entry.kind === "integer" ?
      [String(entry.value), "-1", "0"] :
      [String(entry.mantissa), String(entry.precision), String(entry.exponent)];
    return value.kind === "complex" ?
      ["2", ...triple(value.real), ...triple(value.imag)] :
      ["1", ...triple(value), "0", "-1", "0"];
  }));
}

function prefixProcess(prepared) {
  const run = spawnSync("python3", ["-c", String.raw`
import runpy,sys
sys.path.extend(['src/lib','src/baselib','.'])
runpy.run_module('bench.pari-class-group-port.row19_prepared_prefix_probe',run_name='__main__')`], {
    cwd: ROOT, input: JSON.stringify(prepared), encoding: "utf8",
    timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

async function worker() {
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  assert.deepEqual(Object.keys(payload).sort(), ["prefix", "prepared"]);
  const host = require("./row19_first_collection_host.cjs");
  const started = process.hrtime.bigint();
  const live = await host.runFirstCollection(payload.prepared, payload.prefix);
  const elapsedNs = process.hrtime.bigint() - started, values = live.values;
  const records = values.relation_records.toArray()
    .slice(0, COLUMNS * ROWS).map(String);
  const logs = values.log_embeddings.toArray()
    .slice(0, COLUMNS * 7 * PLACES).map(String);
  const hashes = values.relation_hashes.toArray().slice(0, COLUMNS).map(String);
  const metadata = values.relation_metadata.toArray().slice(0, COLUMNS * 3).map(String);
  const generators = values.generators.toArray().slice(0, COLUMNS * DEGREE).map(String);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-first-collection-worker-v1",
    relationState: values.relation_state.toArray().map(String),
    logCompleted: values.log_completed.toArray().map(String),
    hashes: { records: hash(records), logs: hash(logs), hashes: hash(hashes),
      metadata: hash(metadata), generators: hash(generators),
      initialRecords: hash(records.slice(0, INITIAL * ROWS)),
      initialLogs: hash(logs.slice(0, INITIAL * 7 * PLACES)) },
    elapsedNs: String(elapsedNs), maxRssKiB: process.resourceUsage().maxRSS,
    ownerBytesUpperBound: live.ownerBytesUpperBound,
    nativeCoreBytes: fs.statSync(live.built.coreSourcePath).size,
    oracleDataConsumed: false, prefixPreserved: true,
  })}\n`);
}

function jq(filter, file) {
  const run = spawnSync("jq", ["-c", filter, file], { cwd: ROOT,
    encoding: "utf8", timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function main() {
  if (process.argv[2] === "--worker") return worker();
  const digest = spawnSync("sha256sum", [W0], { encoding: "utf8", timeout: 600_000 });
  assert.equal(digest.status, 0, digest.stderr || String(digest.error));
  assert.equal(digest.stdout.split(/\s+/)[0], W0_SHA256);

  // Extract only the prepared authority before either mathematical process is
  // started.  No answer-bearing event is parsed or sent across either boundary.
  const preparedEvent = jq(".prepared", W0);
  const auth = require("./prepared_nf_authentication.cjs");
  const prepared = auth.normalizePreparedBundle(preparedEvent);
  const authority = auth.authenticatePreparedBundle(preparedEvent);
  const prefix = prefixProcess(prepared);
  const prefixHash = hash(prefix);

  let boundaryMutationsRejected = 0;
  const host = require("./row19_first_collection_host.cjs");
  for (const [which, mutate] of [
    ["prepared", value => { value.prep_index = "254540"; }],
    ["prefix", value => { value.factor.subfactor[0] = 1; }],
    ["prefix", value => { value.relations.state[0] = 70; }],
  ]) {
    const changedPrepared = structuredClone(prepared);
    const changedPrefix = structuredClone(prefix);
    mutate(which === "prepared" ? changedPrepared : changedPrefix);
    assert.throws(() => host.validateBoundary(changedPrepared, changedPrefix));
    boundaryMutationsRejected += 1;
  }

  const run = spawnSync("prlimit", ["--as=4294967296", "--cpu=600", "--",
    process.execPath, "--max-old-space-size=384", __filename, "--worker"], {
    cwd: ROOT, encoding: "utf8", input: JSON.stringify({ prepared, prefix }),
    timeout: 600_000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const result = JSON.parse(run.stdout);
  assert.deepEqual(result.relationState, ["423", "4350", "7", "0", "0", "423"]);
  assert.deepEqual(result.logCompleted, ["423"]);
  assert(result.maxRssKiB < 4 * 1024 * 1024);
  assert(result.ownerBytesUpperBound < 4 * 1024 ** 3);
  assert.equal(result.oracleDataConsumed, false);

  // W0 answer events are first parsed here, after the capped worker exits.
  const raw = JSON.parse(fs.readFileSync(W0));
  const checkpoint = raw.events.find(event => event.event === "hnf" &&
    event.relations === COLUMNS);
  assert(checkpoint, "row-19 first HNF oracle disappeared");
  assert.equal(checkpoint.relationRecords.length, COLUMNS);
  const records = checkpoint.relationRecords.flatMap(record => record.R.values.map(String));
  const logs = exactLogs(checkpoint.exactEmbeddings);
  const hashes = checkpoint.relationRecords.map(record => String(record.nz));
  const metadata = checkpoint.relationRecords.flatMap((record, index) =>
    [String(index + 1), String(record.origin), String(record.automorphism)]);
  const generators = checkpoint.relationRecords.flatMap((record, index) => {
    if (record.m.kind === "integer") return [exactInteger(record.m, `m${index}`), "0", "0"];
    assert.equal(record.m.kind, "column");
    return record.m.values.map((entry, row) => exactInteger(entry, `m${index},${row}`));
  });
  const oracleHashes = { records: hash(records), logs: hash(logs), hashes: hash(hashes),
    metadata: hash(metadata), generators: hash(generators),
    initialRecords: hash(records.slice(0, INITIAL * ROWS)),
    initialLogs: hash(logs.slice(0, INITIAL * 7 * PLACES)) };
  assert.deepEqual(result.hashes, oracleHashes);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-first-collection-check-v1",
    preparedAuthoritySha256: authority.sha256, prefixSha256: prefixHash,
    relationState: result.relationState, relations: COLUMNS,
    newlyCollectedRelations: COLUMNS - INITIAL,
    exactOracleHashes: oracleHashes, prefixPreserved: result.prefixPreserved,
    elapsedNs: result.elapsedNs, maxRssKiB: result.maxRssKiB,
    ownerBytesUpperBound: result.ownerBytesUpperBound,
    nativeCoreBytes: result.nativeCoreBytes,
    boundaryMutationsRejected, smallNormCollectionExecuted: true,
    firstHnfExecuted: false, postcomputeW0Oracle: true,
    runtimeInputs: ["authenticated prepared-nf projection",
      "prepared-only row19 factor/relation prefix"],
    excludedRuntimeInputs: ["W0 answer events", "HNF state", "class group",
      "units", "regulator"],
    limits: { addressSpaceBytes: 4 * 1024 ** 3, cpuSeconds: 600,
      wallTimeoutSeconds: 600, nodeOldSpaceMiB: 384 },
  })}\n`);
}

Promise.resolve(main()).catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
