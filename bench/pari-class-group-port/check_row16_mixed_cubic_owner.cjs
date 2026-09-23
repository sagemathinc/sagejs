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
const api = require("./row16_mixed_cubic_owner_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const coordinator = path.join(__dirname, "row16_mixed_cubic_owner_coordinator.cjs");
const w0 = "/scratch/sagejs-pari-development-panel-a998/panel-16-aabb93f0d6139f93.json";
const w0Sha = "8ec0387525e4e3f34eb6431ede35b7438b19c4a8f208dc76da682821a14756ce";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function args(output, overrides = {}) {
  const values = { w0, w0Sha, ...overrides };
  return [coordinator, "--pristine-w0", values.w0, "--pristine-sha256", values.w0Sha,
    "--output-dir", output];
}
function run(argv, expected = 0) {
  const result = spawnSync(process.execPath, argv, {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, expected, result.stderr || String(result.error));
  return result;
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row16-mixed-cubic-"));
const output = path.join(temporary, "owners");
try {
  assert.equal(sha(fs.readFileSync(w0)), w0Sha);
  const first = JSON.parse(run(args(output)).stdout);
  const second = JSON.parse(run(args(output)).stdout);
  assert.deepEqual(second, first);
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  assert.equal(sha(fs.readFileSync(first.path)), first.sha256);
  assert.deepEqual(fs.readdirSync(output), [path.basename(first.path)]);
  const owner = JSON.parse(fs.readFileSync(first.path));
  assert(api.verifyOwner(owner, owner.ancestry));

  let mutations = 0;
  const reject = mutation => {
    const changed = structuredClone(owner);
    mutation(changed);
    assert.throws(() => api.verifyOwner(changed, owner.ancestry));
    mutations += 1;
  };
  reject(value => { value.relations.matrix[0] = String(BigInt(value.relations.matrix[0]) + 1n); });
  reject(value => { value.factorBase.ideals[0] = String(BigInt(value.factorBase.ideals[0]) + 1n); });
  reject(value => { value.presentation.rawToKernel[0] = String(BigInt(value.presentation.rawToKernel[0]) + 1n); });
  reject(value => { value.presentation.relationToPresentation[0] = String(BigInt(value.presentation.relationToPresentation[0]) + 1n); });
  reject(value => { value.completion.publicComplete = true; });

  const badDigest = run(args(output, { w0Sha: "0".repeat(64) }), 1);
  assert.match(badDigest.stderr, /wrong pristine row-16 digest/);
  const changedPath = path.join(temporary, "changed.json");
  const changed = JSON.parse(fs.readFileSync(w0));
  changed.events.find(event => event.event === "hnf").relationRecords[0].R.values[0] = "2";
  fs.writeFileSync(changedPath, `${JSON.stringify(changed)}\n`);
  const changedRun = run(args(output, { w0: changedPath }), 1);
  assert.match(changedRun.stderr, /detached from the frozen manifest/);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row16-mixed-cubic-owner-check-v1",
    ownerSha256: first.sha256, ownerBytes: first.bytes,
    factorBaseSize: 48, principalRelations: 54, kernelRank: 6,
    classNumber: "27", invariants: ["3", "3", "3"],
    equations: ["R*T=0", "R*V=P"], mutations,
    publication: "atomic-idempotent-0444", publicComplete: false,
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
