#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const FACTOR_CHECK = path.join(__dirname, "check_row6_prepared_factor_base_root.cjs");
const INITIAL_CHECK = path.join(__dirname, "check_row6_prepared_initial_relations.cjs");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-06-26fed17015f6479f.json";
const W0_SHA256 = "2736e19b166c11a5997a6825cd99b612ae23cf6740d2248ac3dd91bc883286a5";
const ROWS = 1130, DEGREE = 3, PLACES = 3;
const EXPECTED_STATES = [
  [2, 9, 1124, 4, 7, 145, 0, 1133, 0],
  [2, 9, 1127, 1, 7, 3, 0, 1136, 0],
  [2, 9, 1128, 0, 7, 1, 0, 1137, 0],
];
const EXPECTED_TRACE = [
  [1,4,4,0,1133,1133], [2,4,4,0,1133,1136],
  [3,1,1,0,1136,1136], [4,1,1,0,1136,1136],
  [5,1,1,0,1136,1136], [6,1,1,0,1136,1136],
  [7,1,1,0,1136,1136], [8,1,1,0,1136,1136],
  [9,1,1,0,1136,1136], [10,1,1,0,1136,1136],
  [11,1,1,0,1136,1136], [12,1,1,0,1136,1136],
  [13,1,1,0,1136,1137],
];

const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const canonical = value => JSON.stringify(value);
const hash = value => sha(Buffer.from(canonical(value)));

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
  return matrix.values.flatMap(column => column.values.flatMap(value =>
    value.kind === "complex" ?
      ["2", ...realTriple(value.real), ...realTriple(value.imag)] :
      ["1", ...realTriple(value), "0", "-1", "0"]));
}

function readOwner(descriptor) {
  const compressed = fs.readFileSync(descriptor.path);
  assert.equal(sha(compressed), descriptor.compressedSha256);
  assert.equal(fs.statSync(descriptor.path).mode & 0o222, 0);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha(plain), descriptor.ownerSha256);
  return JSON.parse(plain);
}

function writeOwner(directory, owner) {
  fs.mkdirSync(directory, { recursive: true });
  const plain = Buffer.from(`${canonical(owner)}\n`), ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const compressedSha256 = sha(compressed);
  const destination = path.join(directory, `row6-prepared-gate-c-${ownerSha256}.json.gz`);
  fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 });
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256, compressedSha256,
    bytes: plain.length, compressedBytes: compressed.length };
}

function traceProjection(trace) {
  return trace.map(row => [row.pass, row.need, row.searchCount, row.squash,
    row.before, row.after]);
}

async function worker() {
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  assert.deepEqual(Object.keys(payload).sort(),
    ["factorOwner", "initialOwner", "outputDirectory", "prepared"]);
  const factor = readOwner(payload.factorOwner);
  factor.ownerSha256 = payload.factorOwner.ownerSha256;
  const initial = readOwner(payload.initialOwner);
  const host = require("./row6_prepared_gate_c_host.cjs");
  const started = process.hrtime.bigint();
  const live = await host.runPreparedGateC(payload.prepared, factor, initial);
  const elapsedNs = process.hrtime.bigint() - started;
  assert.deepEqual(live.checkpoints.map(checkpoint => checkpoint.state), EXPECTED_STATES);
  assert.deepEqual(traceProjection(live.passTrace), EXPECTED_TRACE);
  assert.equal(live.collectionPasses, 14);
  assert.deepEqual(live.collectorValues.relation_state.toArray().map(String),
    ["1137", "11420", "0", "0", "1137", "1137"]);

  const columns = 1137;
  const records = live.collectorValues.relation_records.toArray()
    .slice(0, ROWS * columns).map(String);
  const logs = live.collectorValues.log_embeddings.toArray()
    .slice(0, 7 * PLACES * columns).map(String);
  const checkpoints = live.checkpoints.map(checkpoint => ({
    columns: checkpoint.columns, state: checkpoint.state,
    hashes: { relations: hash(records.slice(0, ROWS * checkpoint.columns)),
      logs: hash(logs.slice(0, 7 * PLACES * checkpoint.columns)),
      h: hash(checkpoint.h), dep: hash(checkpoint.dep), b: hash(checkpoint.b),
      c: hash(checkpoint.c), perm: hash(checkpoint.perm) },
  }));
  const relationHashes = live.collectorValues.relation_hashes.toArray()
    .slice(0, columns).map(String);
  const metadata = live.collectorValues.relation_metadata.toArray()
    .slice(0, 3 * columns).map(String);
  const generators = live.collectorValues.generators.toArray()
    .slice(0, DEGREE * columns).map(String);

  let boundaryMutationsRejected = 0;
  for (const [which, mutate] of [
    ["prepared", value => { value.data.prep_polynomial[0] = "2000000000019"; }],
    ["factor", value => { value.factor.subfactor[0] = "1"; }],
    ["initial", value => { value.relations.state[0] = "202"; }],
  ]) {
    const changedPrepared = structuredClone(payload.prepared);
    const changedFactor = structuredClone(factor);
    const changedInitial = structuredClone(initial);
    mutate(which === "prepared" ? changedPrepared :
      (which === "factor" ? changedFactor : changedInitial));
    assert.throws(() => host.validateBoundary(changedPrepared, changedFactor, changedInitial));
    boundaryMutationsRejected += 1;
  }

  const final = live.checkpoints.at(-1);
  const owner = {
    schema: "sagejs.pari-class-group/row6-prepared-gate-c-owner-v1",
    authority: { preparedAuthoritySha256: payload.prepared.authoritySha256,
      factorOwnerSha256: payload.factorOwner.ownerSha256,
      initialOwnerSha256: payload.initialOwner.ownerSha256 },
    field: factor.field,
    execution: { elapsedNs: String(elapsedNs), maxRssKiB: process.resourceUsage().maxRSS,
      addressSpaceCeilingBytes: "4294967296", cpuLimitSeconds: 600,
      wallTimeoutSeconds: 600, nodeOldSpaceMiB: 512 },
    relationState: ["1137", "11420", "0", "0", "1137", "1137"],
    collectionPasses: live.collectionPasses, passTrace: live.passTrace,
    checkpoints, relationIdentity: { hashes: relationHashes, metadata, generators },
    final: { state: final.state, h: final.h, dep: final.dep, b: final.b,
      c: final.c, perm: final.perm, relations: records, logs },
    capacity: { logicalRows: ROWS, logicalColumns: columns,
      retainedRelationCells: records.length, retainedLogCells: logs.length,
      retainedSelectedHnfCells: final.h.length + final.dep.length + final.b.length,
      fullGlobalTransformCells: 0, historicalCheckpointMatricesRetained: 0,
      ownerBytesUpperBound: live.ownerBytesUpperBound },
    publication: { relationCollectionComplete: true, hnfComplete: true,
      acceptanceExecuted: false, classGroupConstructed: false,
      boundaryMutationsRejected },
  };
  const receipt = writeOwner(payload.outputDirectory, owner);
  const before = fs.readFileSync(receipt.path);
  assert.throws(() => writeOwner(payload.outputDirectory, owner), /EEXIST/);
  assert.deepEqual(fs.readFileSync(receipt.path), before);
  process.stdout.write(`${canonical({ ...receipt, elapsedNs: String(elapsedNs),
    maxRssKiB: owner.execution.maxRssKiB, checkpoints,
    relationIdentityHashes: { hashes: hash(relationHashes), metadata: hash(metadata),
      generators: hash(generators) }, passTrace: live.passTrace,
    ownerBytesUpperBound: live.ownerBytesUpperBound,
    boundaryMutationsRejected, publicationReplayRejectedWithoutMutation: true })}\n`);
}

function jq(filter, file, maxBuffer = 8 * 1024 * 1024) {
  const run = spawnSync("jq", ["-c", filter, file], { cwd: ROOT, encoding: "utf8",
    timeout: 600_000, maxBuffer });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function main() {
  if (process.argv[2] === "--worker") return worker();
  const digest = spawnSync("sha256sum", [W0], { encoding: "utf8", timeout: 600_000 });
  assert.equal(digest.status, 0, digest.stderr || String(digest.error));
  assert.equal(digest.stdout.split(/\s+/)[0], W0_SHA256);

  const preparedEvent = jq(".prepared", W0, 2 * 1024 * 1024);
  const auth = require("./prepared_nf_authentication.cjs");
  const preparedData = auth.normalizePreparedBundle(preparedEvent);
  const authority = auth.authenticatePreparedNf(preparedData);
  const prepared = { authoritySha256: authority.sha256, data: preparedData };

  const factorRun = spawnSync(process.execPath, [FACTOR_CHECK], { cwd: ROOT,
    encoding: "utf8", timeout: 600_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(factorRun.status, 0, factorRun.stderr || String(factorRun.error));
  const factorReceipt = JSON.parse(factorRun.stdout);

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row6-gate-c-"));
  const initialRun = spawnSync("prlimit", ["--as=4294967296", "--cpu=600", "--",
    process.execPath, INITIAL_CHECK, "--root"], { cwd: ROOT, encoding: "utf8",
    input: canonical({ prepared: preparedData, preparedAuthoritySha256: authority.sha256,
      factorOwner: factorReceipt.owner, factorOwnerSha256: factorReceipt.ownerSha256,
      outputDirectory: path.join(temporary, "initial") }), timeout: 600_000,
    maxBuffer: 4 * 1024 * 1024 });
  assert.equal(initialRun.status, 0, initialRun.stderr || String(initialRun.error));
  const initialReceipt = JSON.parse(initialRun.stdout);

  const payload = { prepared,
    factorOwner: { path: factorReceipt.owner, ownerSha256: factorReceipt.ownerSha256,
      compressedSha256: factorReceipt.compressedSha256 },
    initialOwner: { path: initialReceipt.path, ownerSha256: initialReceipt.ownerSha256,
      compressedSha256: initialReceipt.compressedSha256 },
    outputDirectory: path.join(temporary, "owner") };
  const run = spawnSync("prlimit", ["--as=4294967296", "--cpu=600", "--",
    process.execPath, "--expose-gc", "--max-old-space-size=512", __filename, "--worker"],
  { cwd: ROOT, encoding: "utf8", input: canonical(payload), timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const result = JSON.parse(run.stdout);
  assert(result.maxRssKiB < 4 * 1024 * 1024);
  assert(result.ownerBytesUpperBound < 4 * 1024 ** 3);
  assert.deepEqual(traceProjection(result.passTrace), EXPECTED_TRACE);

  // Answer-bearing W0 events are admitted only after the capped live worker
  // has exited.  The immutable W0 digest binds the complete differential
  // below; no W0 checkpoint or final relation is a Gate-C runtime input.
  const w0Raw = fs.readFileSync(W0);
  assert.equal(sha(w0Raw), W0_SHA256);
  const events = JSON.parse(w0Raw).events.filter(event => event.event === "hnf");
  assert.deepEqual(events.map(event => event.relations), [1133, 1136, 1137]);
  const oracle = events.map((event, index) => ({
    columns: event.relations, state: EXPECTED_STATES[index], hashes: {
      relations: hash(event.relationRecords.flatMap(record =>
        record.R.values.map(String))),
      logs: hash(logMatrix(event.exactEmbeddings)),
      h: hash(integerMatrix(event.exactW)),
      dep: hash(integerMatrix(event.exactDep)),
      b: hash(integerMatrix(event.exactB)),
      c: hash(logMatrix(event.exactC)),
      perm: hash(event.perm.values.map(String)),
    },
  }));
  assert.deepEqual(result.checkpoints, oracle);
  const finalRecords = events.at(-1).relationRecords;
  const oracleIdentities = {
    generators: hash(finalRecords.flatMap(record => record.m.kind === "integer" ?
      [record.m.value, "0", "0"] : record.m.values.map(integer))),
    hashes: hash(finalRecords.map(record => String(record.nz))),
    metadata: hash(finalRecords.flatMap((record, index) =>
      [String(index + 1), String(record.origin), String(record.automorphism)])),
  };
  assert.deepEqual(result.relationIdentityHashes, oracleIdentities);

  const owner = readOwner({ path: result.path, ownerSha256: result.ownerSha256,
    compressedSha256: result.compressedSha256 });
  assert.equal(owner.schema, "sagejs.pari-class-group/row6-prepared-gate-c-owner-v1");
  assert.deepEqual(owner.checkpoints.map(row => row.state), EXPECTED_STATES);
  assert.deepEqual(owner.relationState, ["1137", "11420", "0", "0", "1137", "1137"]);
  assert.equal(owner.collectionPasses, 14);
  assert.equal(owner.capacity.fullGlobalTransformCells, 0);
  assert.equal(owner.capacity.historicalCheckpointMatricesRetained, 0);

  let ownerMutationsRejected = 0;
  for (const mutate of [
    value => { value.authority.initialOwnerSha256 = "0".repeat(64); },
    value => { value.relationState[0] = "1136"; },
    value => { value.final.state[2] = 1127; },
    value => { value.final.relations[0] = "1"; },
    value => { value.publication.classGroupConstructed = true; },
  ]) {
    const changed = structuredClone(owner); mutate(changed);
    assert.notEqual(sha(Buffer.from(`${canonical(changed)}\n`)), result.ownerSha256);
    ownerMutationsRejected += 1;
  }
  assert.deepEqual(readOwner({ path: result.path, ownerSha256: result.ownerSha256,
    compressedSha256: result.compressedSha256 }), owner);

  process.stdout.write(`${canonical({
    schema: "sagejs.pari-class-group/row6-prepared-gate-c-check-v1",
    owner: result.path, ownerSha256: result.ownerSha256,
    compressedSha256: result.compressedSha256, bytes: result.bytes,
    compressedBytes: result.compressedBytes,
    preparedAuthoritySha256: authority.sha256,
    factorOwnerSha256: factorReceipt.ownerSha256,
    initialOwnerSha256: initialReceipt.ownerSha256,
    relationState: owner.relationState, collectionPasses: owner.collectionPasses,
    states: owner.checkpoints.map(row => row.state), passTrace: owner.passTrace,
    checkpointHashes: result.checkpoints,
    relationIdentityHashes: result.relationIdentityHashes,
    elapsedNs: result.elapsedNs, maxRssKiB: result.maxRssKiB,
    ownerBytesUpperBound: result.ownerBytesUpperBound,
    boundaryMutationsRejected: result.boundaryMutationsRejected,
    ownerMutationsRejected, publicationReplayRejectedWithoutMutation: true,
    immutableOwnerSecondReadIdentical: true,
    postExitOracle: { path: W0, sha256: W0_SHA256,
      hnfColumns: events.map(event => event.relations),
      checkpointHashesExact: true, relationIdentityHashesExact: true },
    runtimeInputs: ["authenticated prepared-nf projection",
      "immutable row6 factor-base owner", "immutable row6 initial-relations owner"],
    excludedRuntimeInputs: ["answer-bearing W0 events", "HNF checkpoints",
      "class group", "units", "regulator"],
    limits: { addressSpaceBytes: 4 * 1024 ** 3, cpuSeconds: 600,
      wallTimeoutSeconds: 600, nodeOldSpaceMiB: 512 },
  })}\n`);
}

Promise.resolve(main()).catch(error => {
  process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1;
});
