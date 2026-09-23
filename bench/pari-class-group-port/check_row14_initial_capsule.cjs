#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const zlib = require("node:zlib");
const coordinator = require("./row14_initial_capsule_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = "/scratch/sagejs-pari-development-panel-a998/panel-14-aa0aa6152d8cf26c.json";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row14-capsule-"));

function run(args) {
  const result = spawnSync(process.execPath,
    [path.join(__dirname, "row14_initial_capsule_coordinator.cjs"), ...args],
    { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout);
}

try {
  const args = ["--pristine-w0", SOURCE, "--pristine-sha256", coordinator.W0_SHA256,
    "--output-dir", temporary];
  const first = run(args);
  assert.deepEqual(run(args), first, "publication is idempotent");
  const bytes = fs.readFileSync(first.path);
  assert.equal(sha(bytes), first.sha256);
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  const capsule = JSON.parse(zlib.gunzipSync(bytes));
  assert.equal(capsule.schema, coordinator.SCHEMA);
  assert.equal(capsule.ancestry.pristineW0Sha256, coordinator.W0_SHA256);
  assert.equal(capsule.factorBaseDescriptors.length, 799);
  assert.equal(capsule.initialRelations.length, 42);
  assert.equal(capsule.sourceSchedule.initialization.target, 806);
  assert.equal(capsule.capacityEvidence.ownerScalarCells, 7_207_387);
  assert.equal(capsule.capacityEvidence.packedOwnerBytes, 57_659_096);
  assert.equal(capsule.capacityEvidence.signedWordFit, true);
  assert.equal(capsule.capacityEvidence.rngWordFit, true);
  assert.equal(capsule.capacityEvidence.sourceParseCoResidentWithNativeRoot, false);
  assert(capsule.capacityEvidence.sourceAndPackedOwnerBytes < coordinator.FOUR_GIB);
  assert(first.compressedBytes < 8 * 1024 * 1024, "capsule exceeds the 8 MiB contract");
  assert(first.compressedBytes < first.uncompressedBytes / 3, "capsule is not compact");
  assert.equal(capsule.sourceSchedule.basis, undefined, "dense initialization basis leaked");
  const forbidden = JSON.stringify(capsule);
  for (const word of ["class_group_output", "fundamental_units", "regulator_multiple",
    "exactW", "exactB", "exactC", "exactDep", "classNumber", "invariantFactors"])
    assert(!forbidden.includes(`\"${word}\"`), `terminal authority leaked: ${word}`);

  // Source-only mutations are rejected before publication. These exercise the
  // selected boundary without allocating any native owner.
  const mutationScript = String.raw`
const c=require(process.argv[1]);
(async()=>{const x=await c.streamSelected(process.argv[2],c.W0_SHA256), base=x.selected;
 const cp=require('node:child_process'),a=require('node:assert/strict');
 const direct=cp.spawnSync('jq',['-c','{w0Schema:.schema,field,prepared,factorBase:.events[2],initialized:(.events[3]|del(.basis)),initialSearch:.events[6]}',process.argv[2]],{encoding:'utf8',maxBuffer:8*1024*1024});
 a.equal(direct.status,0,direct.stderr);a.deepEqual(base,JSON.parse(direct.stdout));
 const copy=()=>structuredClone(base);let rejected=0;
 const reject=change=>{const value=copy();change(value);try{c.validateSelected(value,x.sourceSha256,x.sourceBytes)}catch{rejected++;return}throw Error('mutation accepted')};
 reject(v=>v.field.id='generated-sha256-'+ '0'.repeat(64));
 reject(v=>v.factorBase.LP.values.pop());
 reject(v=>v.initialized.relationRecords[0].R.values[0]='0');
 reject(v=>v.initialized.target=805);
 reject(v=>v.initialSearch.rng[0]='0');
 reject(v=>v.initialSearch.search.values.pop());
 process.stdout.write(String(rejected));
})().catch(e=>{console.error(e);process.exitCode=1});`;
  const mutations = spawnSync(process.execPath, ["-e", mutationScript,
    path.join(__dirname, "row14_initial_capsule_coordinator.cjs"), SOURCE],
  { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 1024 * 1024 });
  assert.equal(mutations.status, 0, mutations.stderr);
  assert.equal(mutations.stdout, "6");

  const badDigest = spawnSync(process.execPath,
    [path.join(__dirname, "row14_initial_capsule_coordinator.cjs"),
      "--pristine-w0", SOURCE, "--pristine-sha256", "0".repeat(64),
      "--output-dir", temporary], { cwd: ROOT, encoding: "utf8", timeout: 30_000 });
  assert.notEqual(badDigest.status, 0);
  assert.match(badDigest.stderr, /frozen row-14 digest/);
  assert.deepEqual(fs.readdirSync(temporary), [path.basename(first.path)]);
  console.log(JSON.stringify({ schema: "row14-initial-capsule-check-v1",
    sourceSha256: coordinator.W0_SHA256, capsuleSha256: first.sha256,
    descriptorCount: 799, initialRelations: 42, liveTarget: 806,
    compressedBytes: first.compressedBytes, uncompressedBytes: first.uncompressedBytes,
    packedOwnerBytes: capsule.capacityEvidence.packedOwnerBytes,
    mutationsRejected: 6, publication: "atomic-idempotent-0444", heavy806Run: false }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
