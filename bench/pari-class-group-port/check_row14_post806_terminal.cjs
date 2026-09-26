#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const owner = path.resolve(process.argv[2] ||
  "/tmp/row14-accepted-owner/row14-accepted-9a24358fc2846778c7940df1be206a18048780375a60f6e9edf039b36c770b65.json.gz");
const metadata = path.resolve(process.argv[3] || "/tmp/row14-factor-metadata-latest.json");
const child = String.raw`
const { runRow14Post806Terminal } = require(${JSON.stringify(path.join(__dirname,
  "row14_post806_terminal_host.cjs"))});
const started = Date.now();
runRow14Post806Terminal(process.argv[1], process.argv[2]).then(result => {
  result.elapsedMs = Date.now() - started;
  result.maxRssKiB = process.resourceUsage().maxRSS;
  process.stdout.write(JSON.stringify(result));
}).catch(error => { console.error(error.stack || error); process.exit(1); });
`;

function invoke(ownerPath, metadataPath) {
  return spawnSync("prlimit", ["--as=4294967296", "--cpu=600", "--", process.execPath,
    "-e", child, ownerPath, metadataPath], { cwd: root, encoding: "utf8",
    timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
}

const run = invoke(owner, metadata);
assert.equal(run.status, 0, run.stderr || String(run.error));
const result = JSON.parse(run.stdout);
assert.equal(result.status, 0);
assert.equal(result.ownerSha256,
  "9a24358fc2846778c7940df1be206a18048780375a60f6e9edf039b36c770b65");
assert.equal(result.metadataSha256,
  "cca3c14630fc91a407a052bbc7fb2799b5e95bce79f1948fc422ca39cda07684");
assert.equal(result.analyticPrimeCount, 1296);
assert.deepEqual(result.analyticState, [10626, 1295]);
assert.equal(result.fieldDiscriminant, "-43200003776000087360000787200002480");
assert.equal(result.normalizationDiscriminant, "43200003776000087360000787200002480");
assert.equal(result.logDiscriminant, 79.75114865146098);
assert.deepEqual(result.inverseHr, ["17548085723474583841", "64", "-54"]);
assert.deepEqual(result.postHnfState, [0, 7, 1]);
assert.deepEqual(result.multipleState, [0, 0, 216, 2]);
assert.deepEqual(result.acceptanceState, [2, 0, 0]);
assert.deepEqual(result.reconstructionState, [0, 5, 170, 2]);
assert.deepEqual(result.regulator, [
  "81286872183153500261162314966675306285467183490741584490233697199637458337870",
  "256", "45"]);
assert.deepEqual(result.unitRelations, ["1555304347", "0", "541804729", "0",
  "-341849614", "0", "2371925534", "0", "2286068514", "0", "3667636102",
  "0", "0", "1555304347"]);
assert.equal(result.unitRelations.length, 14);
assert.equal(result.unitRelationsSha256,
  "ac3b40e1d95edee9b8af61f2689a32a937945ed43b2a6112ec97f0783497aef8");
assert.deepEqual(result.smithState, [0, 2, 1, 3, 0, 0]);
assert.deepEqual(result.invariants, ["24", "8"]);
assert.equal(result.classNumber, "192");
assert.deepEqual(result.terminalState, [0, 0, 7, 0, 2, 806, 0, 0, 2, 0]);
assert.deepEqual(result.completeness, { fullSmithTransform: false,
  idealGeneratorWitnesses: false, principalRelationWitnesses: false });
assert.deepEqual(result.inputOwners, ["liveAcceptedRelationOwner", "factorMetadata"]);
assert(result.maxRssKiB < 4 * 1024 * 1024);

const mutationDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row14-post806-"));
try {
  const changedOwner = JSON.parse(zlib.gunzipSync(fs.readFileSync(owner)));
  changedOwner.final.h[0] = "23";
  const changedOwnerPath = path.join(mutationDirectory, "changed-owner.json.gz");
  fs.writeFileSync(changedOwnerPath, zlib.gzipSync(JSON.stringify(changedOwner)));
  const ownerMutation = invoke(changedOwnerPath, metadata);
  assert.notEqual(ownerMutation.status, 0);
  assert.match(ownerMutation.stderr, /live owner identity drift/);

  const changedMetadata = JSON.parse(fs.readFileSync(metadata, "utf8"));
  changedMetadata.metadata.prepared.analytic_discriminant = "1";
  const changedMetadataPath = path.join(mutationDirectory, "changed-metadata.json");
  fs.writeFileSync(changedMetadataPath, JSON.stringify(changedMetadata));
  const metadataMutation = invoke(owner, changedMetadataPath);
  assert.notEqual(metadataMutation.status, 0);
  assert.match(metadataMutation.stderr, /Expected values to be strictly equal/);
} finally {
  fs.rmSync(mutationDirectory, { recursive: true, force: true });
}
console.log(JSON.stringify({ schema: "sagejs.pari-class-group/row14-post806-terminal-check-v1",
  ...result, limits: { addressSpaceGiB: 4, cpuSeconds: 600, timeoutSeconds: 600 },
  inputs: { liveOwner: owner, factorMetadata: metadata },
  oracleInputs: { inverseHr: false, regulator: false, classNumber: false,
    invariants: false, frozenW0: false }, mutations: ["live-owner", "factor-metadata"] },
null, 2));
