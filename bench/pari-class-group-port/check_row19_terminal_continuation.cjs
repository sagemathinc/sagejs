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
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-19-0aab4dadcd4bc7c7.json";
const W0_SHA256 = "0be835c418ce9b2055cf79051db7220248299c6d53e56a84ae47b0d1ec747ad9";
const FIRST_OWNER = "/scratch/sagejs-row19-first-hnf/row19-first-hnf-076d334e302d880b2a7da80366fe492d62b118e2a495f15c422908137aa66258.json.gz";
const FIRST_OWNER_SHA256 = "076d334e302d880b2a7da80366fe492d62b118e2a495f15c422908137aa66258";
const FIRST_COMPRESSED_SHA256 = "5145db1a710eb5e08618a73c741f3218a37c5b7c93d2cd2b94a8c19a4fd601e5";
const OUTPUT = "/scratch/sagejs-row19-terminal-continuation";
const ROWS = 424, COLUMNS = 430, DEGREE = 3, PLACES = 2;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => sha(Buffer.from(JSON.stringify(value)));

function integer(value) {
  assert.equal(value.kind, "integer");
  return String(value.value);
}

function integerMatrix(matrix) {
  assert.equal(matrix.kind, "matrix");
  return matrix.values.flatMap(column => column.values.map(integer));
}

function realTriple(value) {
  if (value.kind === "integer") return [String(value.value), "-1", "0"];
  assert.equal(value.kind, "real");
  return [String(value.mantissa), String(value.precision), String(value.exponent)];
}

function logMatrix(matrix) {
  assert.equal(matrix.kind, "matrix");
  return matrix.values.flatMap(column => column.values.flatMap(value =>
    value.kind === "complex" ?
      ["2", ...realTriple(value.real), ...realTriple(value.imag)] :
      ["1", ...realTriple(value), "0", "-1", "0"]));
}

function runPython(module, prepared) {
  const run = spawnSync("python3", ["-c", `
import runpy,sys
sys.path.extend(['src/lib','src/baselib','.'])
runpy.run_module(${JSON.stringify(module)},run_name='__main__')`], {
    cwd: ROOT, input: JSON.stringify(prepared), encoding: "utf8",
    timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function writeOwner(owner) {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const plain = Buffer.from(`${JSON.stringify(owner)}\n`), ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const compressedSha256 = sha(compressed);
  const destination = path.join(OUTPUT,
    `row19-terminal-continuation-${ownerSha256}.json.gz`);
  try { fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(fs.readFileSync(destination), compressed);
  }
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256, compressedSha256,
    bytes: plain.length, compressedBytes: compressed.length };
}

async function worker() {
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const host = require("./row19_terminal_continuation_host.cjs");
  const started = process.hrtime.bigint();
  const live = await host.runTerminalContinuation(payload.prepared, payload.prefix,
    payload.catalog, payload.firstOwner);
  const elapsedNs = process.hrtime.bigint() - started;
  const owner = { schema: "sagejs.pari-class-group/row19-terminal-continuation-owner-v1",
    authority: { preparedAuthoritySha256: payload.prepared.authoritySha256,
      firstHnfOwnerSha256: live.firstOwnerSha256,
      prefixSha256: hash(payload.prefix), analyticCatalogSha256: hash(payload.catalog) },
    ...live.exact, nextControl: live.nextControl,
    execution: { elapsedNs: String(elapsedNs), maxRssKiB: process.resourceUsage().maxRSS,
      ownerBytesUpperBound: live.ownerBytesUpperBound,
      nativeCoreBytes: live.nativeCoreBytes },
    publication: { collectionComplete: true, terminalHnfComplete: true,
      acceptanceComplete: true, classWitnessesComplete: false,
      unitExpansionComplete: false, oracleDataConsumed: false } };
  const receipt = writeOwner(owner);
  const projections = { ...owner.result, records: owner.relationIdentity.records,
    logs: owner.relationIdentity.logs, hashes: owner.relationIdentity.hashes,
    metadata: owner.relationIdentity.metadata,
    generators: owner.relationIdentity.generators };
  process.stdout.write(`${JSON.stringify({ ...receipt, state: owner.state,
    attemptState: owner.attemptState, acceptanceState: owner.acceptanceState,
    multipleState: owner.multipleState, reconstructionState: owner.reconstructionState,
    classNumber: owner.classNumber, regulator: owner.regulator,
    relationState: owner.relationState, analyticState: owner.analyticState,
    inverseHr: owner.inverseHr,
    hashes: Object.fromEntries(Object.entries(projections)
      .map(([name, value]) => [name, hash(value)])),
    ancestryHashes: Object.fromEntries(Object.entries(owner.ancestry)
      .map(([name, value]) => [name, hash(value)])),
    execution: owner.execution, oracleDataConsumed: false })}\n`);
}

function main() {
  if (process.argv[2] === "--worker") return worker();
  const digest = spawnSync("sha256sum", [W0], { encoding: "utf8", timeout: 600_000 });
  assert.equal(digest.status, 0, digest.stderr || String(digest.error));
  assert.equal(digest.stdout.split(/\s+/)[0], W0_SHA256);
  const preparedRun = spawnSync("jq", ["-c", ".prepared", W0], { encoding: "utf8",
    timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(preparedRun.status, 0, preparedRun.stderr || String(preparedRun.error));
  const preparedEvent = JSON.parse(preparedRun.stdout);
  const auth = require("./prepared_nf_authentication.cjs");
  const prepared = auth.normalizePreparedBundle(preparedEvent);
  const authority = auth.authenticatePreparedBundle(preparedEvent);
  prepared.authoritySha256 = authority.sha256;
  const prefix = runPython("bench.pari-class-group-port.row19_prepared_prefix_probe", prepared);
  const catalog = runPython("bench.pari-class-group-port.row19_analytic_catalog", prepared);
  const firstOwner = { path: FIRST_OWNER, ownerSha256: FIRST_OWNER_SHA256,
    compressedSha256: FIRST_COMPRESSED_SHA256 };
  const run = spawnSync("prlimit", ["--as=4294967296", "--cpu=600", "--",
    process.execPath, "--max-old-space-size=512", __filename, "--worker"], {
    cwd: ROOT, encoding: "utf8",
    input: JSON.stringify({ prepared, prefix, catalog, firstOwner }),
    timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const result = JSON.parse(run.stdout);
  assert.equal(result.oracleDataConsumed, false);
  assert.deepEqual(result.relationState, ["430", "4350", "0", "0", "430", "430"]);
  assert.equal(result.classNumber, "39366");
  assert.deepEqual(result.acceptanceState, [2, 0, 0]);
  assert(result.execution.maxRssKiB < 4*1024*1024);
  assert(result.execution.ownerBytesUpperBound < 4*1024**3);

  // Answer-bearing terminal events are admitted only after the worker exits.
  const raw = JSON.parse(fs.readFileSync(W0));
  const hnf = raw.events.find(event => event.event === "hnf" &&
    event.relations === COLUMNS);
  const acceptance = raw.events.find(event => event.event === "acceptance");
  assert(hnf && acceptance && acceptance.code === 0);
  const records = hnf.relationRecords.flatMap(record => record.R.values.map(String));
  const expected = { W: integerMatrix(hnf.exactW), dep: integerMatrix(hnf.exactDep),
    B: integerMatrix(hnf.exactB), C: logMatrix(hnf.exactC),
    perm: hnf.perm.values.map(String), records,
    logs: logMatrix(hnf.exactEmbeddings),
    hashes: hnf.relationRecords.map(record => String(record.nz)),
    metadata: hnf.relationRecords.flatMap((record, index) =>
      [String(index+1), String(record.origin), String(record.automorphism)]),
    generators: hnf.relationRecords.flatMap(record => record.m.kind === "integer" ?
      [integer(record.m), "0", "0"] : record.m.values.map(integer)) };
  const oracleHashes = Object.fromEntries(Object.entries(expected)
    .map(([name, value]) => [name, hash(value)]));
  assert.deepEqual(result.hashes, oracleHashes);
  assert.equal(result.classNumber, String(acceptance.h));
  assert.deepEqual(result.regulator, [String(acceptance.R.mantissa),
    String(acceptance.R.precision), String(acceptance.R.exponent)]);

  const compressed = fs.readFileSync(result.path);
  assert.equal(sha(compressed), result.compressedSha256);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha(plain), result.ownerSha256);
  const owner = JSON.parse(plain);
  assert.equal(owner.authority.firstHnfOwnerSha256, FIRST_OWNER_SHA256);
  assert.equal(owner.publication.oracleDataConsumed, false);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-terminal-continuation-check-v1",
    owner: result.path, ownerSha256: result.ownerSha256,
    compressedSha256: result.compressedSha256, bytes: result.bytes,
    compressedBytes: result.compressedBytes,
    firstHnfOwnerSha256: FIRST_OWNER_SHA256,
    preparedAuthoritySha256: authority.sha256, relationState: result.relationState,
    state: result.state, attemptState: result.attemptState,
    acceptanceState: result.acceptanceState, multipleState: result.multipleState,
    reconstructionState: result.reconstructionState, classNumber: result.classNumber,
    regulator: result.regulator, exactOracleHashes: oracleHashes,
    ancestryHashes: result.ancestryHashes, analyticState: result.analyticState,
    inverseHr: result.inverseHr, execution: result.execution,
    postcomputeW0Oracle: true })}\n`);
}

Promise.resolve(main()).catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
