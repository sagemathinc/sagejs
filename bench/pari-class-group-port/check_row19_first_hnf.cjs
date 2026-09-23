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
const OUTPUT = "/scratch/sagejs-row19-first-hnf";
const ROWS = 424, COLUMNS = 423, PLACES = 2;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => sha(Buffer.from(JSON.stringify(value)));

function integer(value) {
  assert.equal(value.kind, "integer");
  return String(value.value);
}

function integerMatrix(matrix) {
  assert.equal(matrix.kind, "matrix");
  return matrix.values.flatMap(column => {
    assert.equal(column.kind, "column");
    return column.values.map(integer);
  });
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

function writeOwner(owner) {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const plain = Buffer.from(`${JSON.stringify(owner)}\n`);
  const ownerSha256 = sha(plain), compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const compressedSha256 = sha(compressed);
  const destination = path.join(OUTPUT, `row19-first-hnf-${ownerSha256}.json.gz`);
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
  assert.deepEqual(Object.keys(payload).sort(), ["prefix", "prepared"]);
  const host = require("./row19_first_hnf_host.cjs");
  const started = process.hrtime.bigint();
  const live = await host.runFirstHnf(payload.prepared, payload.prefix);
  const elapsedNs = process.hrtime.bigint() - started;
  const exact = live.exact;
  const owner = {
    schema: "sagejs.pari-class-group/row19-first-hnf-owner-v1",
    authority: { preparedAuthoritySha256: payload.prepared.authoritySha256 || null,
      prefixSha256: hash(payload.prefix) },
    relationState: live.collected.values.relation_state.toArray().map(String),
    ...exact,
    execution: { elapsedNs: String(elapsedNs), maxRssKiB: process.resourceUsage().maxRSS,
      ownerBytesUpperBound: live.ownerBytesUpperBound,
      nativeCoreBytes: fs.statSync(live.built.coreSourcePath).size },
    publication: { firstHnfComplete: true, continuationExecuted: false,
      classGroupConstructed: false, unitsConstructed: false,
      oracleDataConsumed: false },
  };
  const receipt = writeOwner(owner);
  const projections = { W: exact.result.W, dep: exact.result.dep,
    B: exact.result.B, C: exact.result.C, perm: exact.result.perm };
  process.stdout.write(`${JSON.stringify({ ...receipt,
    state: exact.state, dimensions: exact.dimensions,
    hashes: Object.fromEntries(Object.entries(projections)
      .map(([name, value]) => [name, hash(value)])),
    ancestryHashes: { relation: hash(exact.ancestry.relation),
      H: hash(exact.ancestry.H), transform: hash(exact.ancestry.transform),
      cleanupTransform: hash(exact.ancestry.cleanupTransform) },
    execution: owner.execution, relationState: owner.relationState,
    oracleDataConsumed: false })}\n`);
}

function jq(filter) {
  const run = spawnSync("jq", ["-c", filter, W0], { cwd: ROOT,
    encoding: "utf8", timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function main() {
  if (process.argv[2] === "--worker") return worker();
  const digest = spawnSync("sha256sum", [W0], { encoding: "utf8", timeout: 600_000 });
  assert.equal(digest.status, 0, digest.stderr || String(digest.error));
  assert.equal(digest.stdout.split(/\s+/)[0], W0_SHA256);
  const preparedEvent = jq(".prepared");
  const auth = require("./prepared_nf_authentication.cjs");
  const prepared = auth.normalizePreparedBundle(preparedEvent);
  const authority = auth.authenticatePreparedBundle(preparedEvent);
  // Add only the non-answer-bearing authority string for durable ownership.
  prepared.authoritySha256 = authority.sha256;
  const prefix = prefixProcess(prepared);
  const run = spawnSync("prlimit", ["--as=4294967296", "--cpu=600", "--",
    process.execPath, "--max-old-space-size=384", __filename, "--worker"], {
    cwd: ROOT, encoding: "utf8", input: JSON.stringify({ prepared, prefix }),
    timeout: 600_000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const result = JSON.parse(run.stdout);
  assert.equal(result.oracleDataConsumed, false);
  assert.deepEqual(result.state, [9, 15, 408, 7, 6, 69, 0, 423, 0]);
  assert(result.execution.maxRssKiB < 4 * 1024 * 1024);
  assert(result.execution.ownerBytesUpperBound < 4 * 1024 ** 3);

  // Admit the first-HNF answer only after the bounded worker has exited.
  const raw = JSON.parse(fs.readFileSync(W0));
  const oracle = raw.events.find(event => event.event === "hnf" &&
    event.relations === COLUMNS);
  assert(oracle, "row-19 first HNF oracle disappeared");
  const expected = { W: integerMatrix(oracle.exactW),
    dep: integerMatrix(oracle.exactDep), B: integerMatrix(oracle.exactB),
    C: logMatrix(oracle.exactC), perm: oracle.perm.values.map(String) };
  const oracleHashes = Object.fromEntries(Object.entries(expected)
    .map(([name, value]) => [name, hash(value)]));
  assert.deepEqual(result.hashes, oracleHashes);

  const compressed = fs.readFileSync(result.path);
  assert.equal(sha(compressed), result.compressedSha256);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha(plain), result.ownerSha256);
  const owner = JSON.parse(plain);
  assert.equal(owner.publication.oracleDataConsumed, false);
  assert.equal(owner.ancestry.cleanupTransform.length, COLUMNS * COLUMNS);
  assert.equal(owner.ancestry.transform.length,
    owner.dimensions.activeColumns ** 2);
  assert.deepEqual(Object.fromEntries(Object.entries({ W: owner.result.W,
    dep: owner.result.dep, B: owner.result.B, C: owner.result.C,
    perm: owner.result.perm }).map(([name, value]) => [name, hash(value)])),
  oracleHashes);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-first-hnf-check-v1",
    preparedAuthoritySha256: authority.sha256,
    owner: result.path, ownerSha256: result.ownerSha256,
    compressedSha256: result.compressedSha256, bytes: result.bytes,
    compressedBytes: result.compressedBytes, relationState: result.relationState,
    state: result.state, dimensions: result.dimensions,
    exactOracleHashes: oracleHashes, ancestryHashes: result.ancestryHashes,
    execution: result.execution, firstHnfComplete: true,
    continuationExecuted: false, postcomputeW0Oracle: true,
    runtimeInputs: ["authenticated prepared-nf projection",
      "prepared-only row19 prefix", "live 423-relation collector output"],
    excludedRuntimeInputs: ["W0 answer events", "HNF checkpoint",
      "class group", "units", "regulator"],
  })}\n`);
}

Promise.resolve(main()).catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
