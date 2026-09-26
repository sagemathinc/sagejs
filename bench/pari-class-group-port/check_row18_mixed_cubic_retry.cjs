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
const api = require("./row18_mixed_cubic_retry_coordinator.cjs");
const ROOT = path.resolve(__dirname, "../..");
const coordinator = path.join(__dirname, "row18_mixed_cubic_retry_coordinator.cjs");
const w0 = "/scratch/sagejs-pari-development-panel-a998/panel-18-d48b43b95d82e5e1.json";
const w0Sha = "6e872fc1cf4765b30782ac32f2a0d7db5fc21c8b22721a976276708ddb084d92";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function args(output, overrides = {}) {
  const values = { w0, w0Sha, ...overrides };
  return [coordinator, "--pristine-w0", values.w0, "--pristine-sha256", values.w0Sha,
    "--output-dir", output];
}
function run(argv, expected = 0) {
  const result = spawnSync(process.execPath, argv, { cwd: ROOT, encoding: "utf8",
    timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, expected, result.stderr || String(result.error));
  return result;
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row18-retry-"));
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
    const changed = structuredClone(owner); mutation(changed);
    assert.throws(() => api.verifyOwner(changed, owner.ancestry)); mutations += 1;
  };
  reject(value => { value.retryPasses[0].acceptanceCode = 0; });
  reject(value => { value.retryPasses[1].newRelations = 2; });
  reject(value => { value.relations.matrix[0] = String(BigInt(value.relations.matrix[0]) + 1n); });
  reject(value => { value.presentation.rawToKernel[0] = String(BigInt(value.presentation.rawToKernel[0]) + 1n); });
  reject(value => { value.presentation.relationToPresentation[0] = String(BigInt(value.presentation.relationToPresentation[0]) + 1n); });
  reject(value => { value.completion.publicComplete = true; });
  assert.match(run(args(output, { w0Sha: "0".repeat(64) }), 1).stderr,
    /wrong pristine row-18 digest/);
  const changedPath = path.join(temporary, "changed.json");
  const changed = JSON.parse(fs.readFileSync(w0));
  changed.events.find(event => event.event === "hnf").relationRecords[0].R.values[0] = "2";
  fs.writeFileSync(changedPath, `${JSON.stringify(changed)}\n`);
  assert.match(run(args(output, { w0: changedPath }), 1).stderr,
    /detached from the frozen manifest/);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row18-mixed-cubic-retry-check-v1",
    ownerSha256: first.sha256, ownerBytes: first.bytes,
    relationSchedule: [47, 50], acceptanceCodes: [1, 0], appendedRelations: 3,
    factorBaseSize: 41, principalRelations: 50, kernelRank: 9,
    classNumber: "18", invariants: ["18"], equations: ["R*T=0", "R*V=P"],
    mutations, publication: "atomic-idempotent-0444", publicComplete: false,
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
