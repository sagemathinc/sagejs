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
const coordinatorApi = require("./panel1_presentation_authority_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const coordinator = path.join(__dirname, "panel1_presentation_authority_coordinator.cjs");
const w0 = "/scratch/sagejs-pari-development-panel-a998/panel-01-394cce5d99f0e9f8.json";
const w0Sha = "f043f34a7c732269791a3c8c16cb3b30767b84ecec3c340659433d53f05aeb72";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function args(output, overrides = {}) {
  const values = { w0, w0Sha, ...overrides };
  return [coordinator, "--pristine-w0", values.w0, "--pristine-sha256", values.w0Sha,
    "--output-dir", output];
}
function run(arguments_, expected = 0) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(result.status, expected, result.stderr || String(result.error));
  return result;
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-panel1-presentation-"));
const output = path.join(temporary, "owners");
try {
  assert.equal(sha(fs.readFileSync(w0)), w0Sha);
  const first = JSON.parse(run(args(output)).stdout);
  const second = JSON.parse(run(args(output)).stdout);
  assert.deepEqual(second, first, "cold replay publication is not idempotent");
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  assert.equal(sha(fs.readFileSync(first.path)), first.sha256);
  assert.deepEqual(fs.readdirSync(output), [path.basename(first.path)]);
  const owner = JSON.parse(fs.readFileSync(first.path));
  assert(coordinatorApi.verifyOwner(owner, owner.ancestry));

  const R = owner.relations.matrix.map(BigInt);
  const T = owner.presentation.rawToKernel.map(BigInt);
  const V = owner.presentation.relationToPresentation.map(BigInt);
  const P = owner.presentation.matrix.map(BigInt);
  for (let column = 0; column < 7; column += 1)
    for (let row = 0; row < 51; row += 1) {
      let value = 0n;
      for (let source = 0; source < 58; source += 1)
        value += R[51 * source + row] * T[58 * column + source];
      assert.equal(value, 0n, `RT[${row},${column}]`);
    }
  for (let column = 0; column < 51; column += 1)
    for (let row = 0; row < 51; row += 1) {
      let value = 0n;
      for (let source = 0; source < 58; source += 1)
        value += R[51 * source + row] * V[58 * column + source];
      assert.equal(value, P[51 * column + row], `RV[${row},${column}]`);
    }

  let ownerMutations = 0;
  const rejectOwner = mutation => {
    const changed = structuredClone(owner);
    mutation(changed);
    assert.throws(() => coordinatorApi.verifyOwner(changed, owner.ancestry));
    ownerMutations += 1;
  };
  rejectOwner(value => { value.relations.matrix[0] = String(BigInt(value.relations.matrix[0]) + 1n); });
  rejectOwner(value => { value.relations.principalGenerators[0] = String(BigInt(value.relations.principalGenerators[0]) + 1n); });
  rejectOwner(value => { value.factorBase.ideals[0] = String(BigInt(value.factorBase.ideals[0]) + 1n); });
  rejectOwner(value => { value.presentation.rawToKernel[0] = String(BigInt(value.presentation.rawToKernel[0]) + 1n); });
  rejectOwner(value => { value.presentation.relationToPresentation[0] = String(BigInt(value.presentation.relationToPresentation[0]) + 1n); });
  rejectOwner(value => { value.replay.cleanupTransform[0] = String(BigInt(value.replay.cleanupTransform[0]) + 1n); });
  rejectOwner(value => { value.field.rootIntervals[0][0] = "-143"; });

  const badDigest = run(args(output, { w0Sha: "0".repeat(64) }), 1);
  assert.match(badDigest.stderr, /wrong pristine W0 digest/);
  assert.deepEqual(fs.readdirSync(output), [path.basename(first.path)]);

  const changedW0 = path.join(temporary, "changed-w0.json");
  const changed = JSON.parse(fs.readFileSync(w0));
  changed.events.find(event => event.event === "hnf").relationRecords[0].R.values[0] = "4";
  fs.writeFileSync(changedW0, `${JSON.stringify(changed)}\n`);
  const rejectedW0 = run(args(output, { w0: changedW0 }), 1);
  assert.match(rejectedW0.stderr, /digest changed/);
  assert.deepEqual(fs.readdirSync(output), [path.basename(first.path)]);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/panel1-presentation-authority-check-v1",
    ownerSha256: first.sha256, ownerBytes: first.bytes,
    factorBaseSize: 51, principalRelations: 58,
    rawToKernelShape: [58, 7], presentationShape: [51, 51],
    equations: ["R*T=0", "R*V=P"], classNumber: "3", invariants: ["3"],
    ownerMutations, authenticatedMutations: 2,
    publication: "atomic-idempotent-0444",
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
