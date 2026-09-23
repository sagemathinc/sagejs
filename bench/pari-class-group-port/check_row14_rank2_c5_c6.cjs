#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const api = require("./row14_rank2_c5_c6_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const ACCEPTED = "/tmp/row14-accepted-owner/row14-accepted-9a24358fc2846778c7940df1be206a18048780375a60f6e9edf039b36c770b65.json.gz";
const METADATA = "/tmp/row14-factor-metadata-latest.json";
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-14-aa0aa6152d8cf26c.json";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row14-rank2-"));
function run(command, args, expected = 0) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, expected, result.stderr || String(result.error)); return result;
}
try {
  const post = path.join(temporary, "post806.json");
  const postRun = run(process.execPath,
    [path.join(__dirname, "check_row14_post806_terminal.cjs"), ACCEPTED, METADATA]);
  fs.writeFileSync(post, postRun.stdout);
  const output = path.join(temporary, "owners");
  const args = [path.join(__dirname, "row14_rank2_c5_c6_coordinator.cjs"),
    "--accepted-owner", ACCEPTED, "--post806-output", post, "--metadata", METADATA,
    "--output-dir", output];
  const first = JSON.parse(run(process.execPath, args).stdout);
  assert.deepEqual(JSON.parse(run(process.execPath, args).stdout), first);
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  const owner = JSON.parse(fs.readFileSync(first.path));
  assert(api.verifyOwner(owner, owner.ancestry));
  assert.equal(owner.reason, "LARGE");
  assert.deepEqual(owner.c6State, [2, 38, 0, 0, 0, 0, 0, 1]);
  assert.equal(owner.compactFactoredUnitsRetained, false);
  assert.equal(owner.correspondenceComplete, false);
  let mutations = 0;
  const reject = mutation => {
    const changed = structuredClone(owner); mutation(changed);
    assert.throws(() => api.verifyOwner(changed, owner.ancestry)); mutations += 1;
  };
  reject(value => { value.reason = "PRECI"; });
  reject(value => { value.c6State[1] = 20; });
  reject(value => { value.compactFactoredUnitsRetained = true; });
  reject(value => { value.correspondenceComplete = true; });
  reject(value => { value.compact.unitTransform.pop(); });
  reject(value => { value.compact.relationLattice.pop(); });
  reject(value => { value.provenance.frozenW0RuntimeInput = true; });
  const changedPost = JSON.parse(fs.readFileSync(post));
  changedPost.unitRelations[0] = String(BigInt(changedPost.unitRelations[0]) + 1n);
  const changedPostPath = path.join(temporary, "changed-post.json");
  fs.writeFileSync(changedPostPath, JSON.stringify(changedPost));
  const changedArgs = [...args];
  changedArgs[changedArgs.indexOf("--post806-output") + 1] = changedPostPath;
  assert.match(run(process.execPath, changedArgs, 1).stderr,
    /post806 output identity changed|unit relation digest changed/);

  // W0 is deliberately opened only after the live arithmetic owner exists.
  const pristine = JSON.parse(fs.readFileSync(W0));
  const references = pristine.events.filter(event => event.event === "fundamental_units");
  assert.equal(references.length, 1);
  const reference = references[0];
  assert.equal(reference.fu, null);
  assert.deepEqual(owner.compact.regulator,
    [reference.regulator.mantissa, String(reference.regulator.precision),
      String(reference.regulator.exponent)]);
  const realExponents = reference.A.values.flatMap(column =>
    column.values.map(value => value.real.exponent));
  assert.equal(Math.max(...realExponents), 41);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row14-rank2-c5-c6-check-v1",
    ownerSha256: first.sha256, ownerBytes: first.bytes, reason: owner.reason,
    c5State: owner.c5State, c6State: owner.c6State, mutations,
    postcomputeDifferential: { fu: null, regulator: true, maximumPublicAExponent: 41,
      sourceThreshold: 20, inferredReason: "LARGE" },
    authority: { accepted: api.ACCEPTED_SHA256, metadata: api.METADATA_SHA256,
      frozenW0RuntimeInput: false },
    limits: { addressSpaceGiB: 4, cpuSeconds: 600, timeoutSeconds: 600 },
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
