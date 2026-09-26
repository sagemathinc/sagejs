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
const coordinatorApi = require("./panel8_terminal_closure_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const coordinator = path.join(__dirname, "panel8_terminal_closure_coordinator.cjs");
const authority = "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/panel8-authority";
const acceptedSha = "b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591";
const c5Sha = "f93fa0ff5f68531646f213d799339e87a7b2d338e18457399fe81d6b0fb1df21";
const c6Sha = "d1f4e9e2ce4ae987952cbce8e8af9d6c9ede318f5ffa89b185fbd003ab5e28df";
const w0Sha = "4f7535622072f1350787ca8caab417cce4023aea4ef68c67c3fb20ef65d01ca1";
const accepted = path.join(authority, `panel8-accepted-retry-${acceptedSha}.json`);
const c5 = path.join(authority, `panel8-c5-unit-lattice-${c5Sha}.json`);
const c6 = path.join(authority, `c6-getfu-not-given-${c6Sha}.json`);
const w0 = "/scratch/sagejs-pari-development-panel-a998/panel-08-4184b3a9e86b3cc2.json";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function args(output, overrides = {}) {
  const values = { accepted, acceptedSha, c5, c5Sha, c6, c6Sha, w0, w0Sha, ...overrides };
  return [coordinator, "--accepted-owner", values.accepted, "--accepted-sha256", values.acceptedSha,
    "--c5-owner", values.c5, "--c5-sha256", values.c5Sha,
    "--c6-owner", values.c6, "--c6-sha256", values.c6Sha,
    "--pristine-w0", values.w0, "--pristine-sha256", values.w0Sha,
    "--output-dir", output];
}
function run(arguments_, expected = 0) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(result.status, expected, result.stderr || String(result.error));
  return result;
}
function immutable(directory, name, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const digest = sha(bytes);
  const selected = path.join(directory, `${name}-${digest}.json`);
  fs.writeFileSync(selected, bytes, { mode: 0o444, flag: "wx" });
  return { path: selected, sha256: digest };
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-panel8-terminal-closure-"));
const output = path.join(temporary, "owners");
try {
  for (const selected of [accepted, c5, c6])
    assert.equal(fs.statSync(selected).mode & 0o777, 0o444, selected);
  assert.equal(sha(fs.readFileSync(accepted)), acceptedSha);
  assert.equal(sha(fs.readFileSync(c5)), c5Sha);
  assert.equal(sha(fs.readFileSync(c6)), c6Sha);
  assert.equal(sha(fs.readFileSync(w0)), w0Sha);

  const first = JSON.parse(run(args(output)).stdout);
  const second = JSON.parse(run(args(output)).stdout);
  assert.deepEqual(second, first, "cold replay publication is not idempotent");
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  assert.equal(sha(fs.readFileSync(first.path)), first.sha256);
  assert.deepEqual(fs.readdirSync(output), [path.basename(first.path)]);
  const owner = JSON.parse(fs.readFileSync(first.path));
  assert(coordinatorApi.verifyOwner(owner, owner.ancestry));

  const R = owner.exactRelations.relationRecords.map(BigInt);
  const T = owner.relationClosure.transform.map(BigInt);
  const Q = owner.relationClosure.rightInverse.map(BigInt);
  for (let column = 0; column < 9; column += 1)
    for (let row = 0; row < 143; row += 1) {
      let value = 0n;
      for (let source = 0; source < 152; source += 1)
        value += R[143 * source + row] * T[152 * column + source];
      assert.equal(value, 0n, `RT[${row},${column}]`);
    }
  for (let column = 0; column < 143; column += 1)
    for (let row = 0; row < 143; row += 1) {
      let value = 0n;
      for (let source = 0; source < 152; source += 1)
        value += R[143 * source + row] * Q[152 * column + source];
      assert.equal(value, BigInt(row === column), `RQ[${row},${column}]`);
    }

  let ownerMutations = 0;
  const rejectOwner = mutation => {
    const changed = structuredClone(owner);
    mutation(changed);
    assert.throws(() => coordinatorApi.verifyOwner(changed, owner.ancestry));
    ownerMutations += 1;
  };
  rejectOwner(value => { value.relationClosure.transform[0] = String(BigInt(value.relationClosure.transform[0]) + 1n); });
  rejectOwner(value => { value.relationClosure.rightInverse[0] = String(BigInt(value.relationClosure.rightInverse[0]) + 1n); });
  rejectOwner(value => { value.exactRelations.relationRecords[0] = String(BigInt(value.exactRelations.relationRecords[0]) + 1n); });
  rejectOwner(value => { value.exactRelations.factorBaseIdeals[0] = String(BigInt(value.exactRelations.factorBaseIdeals[0]) + 1n); });
  rejectOwner(value => { value.exactRelations.principalGenerators[0] = String(BigInt(value.exactRelations.principalGenerators[0]) + 1n); });

  const pristine = JSON.parse(fs.readFileSync(w0));
  pristine.events[0].multiplicationTensor[0] = "2";
  const badTensor = immutable(temporary, "bad-tensor", pristine);
  const before = fs.readdirSync(output);
  const tensorRejected = run(args(output, { w0: badTensor.path, w0Sha: badTensor.sha256 }), 1);
  assert.match(tensorRejected.stderr, /prepared|multiplication|factor|principal|W0/i);
  assert.deepEqual(fs.readdirSync(output), before);

  const c5Value = JSON.parse(fs.readFileSync(c5));
  c5Value.u[0] = String(BigInt(c5Value.u[0]) + 1n);
  const badC5 = immutable(temporary, "bad-c5", c5Value);
  const c5Rejected = run(args(output, { c5: badC5.path, c5Sha: badC5.sha256 }), 1);
  assert.match(c5Rejected.stderr, /C5|C6|authority|detached/i);
  assert.deepEqual(fs.readdirSync(output), before);

  const c6Value = JSON.parse(fs.readFileSync(c6));
  c6Value.ancestry.c5OwnerSha256 = "0".repeat(64);
  const badC6 = immutable(temporary, "bad-c6", c6Value);
  const c6Rejected = run(args(output, { c6: badC6.path, c6Sha: badC6.sha256 }), 1);
  assert.match(c6Rejected.stderr, /C6|C5|detached/i);
  assert.deepEqual(fs.readdirSync(output), before);

  const badDigest = run(args(output, { acceptedSha: "0".repeat(64) }), 1);
  assert.match(badDigest.stderr, /accepted owner digest changed/);
  assert.deepEqual(fs.readdirSync(output), before);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/panel8-terminal-closure-check-v1",
    ownerSha256: first.sha256, ownerBytes: first.bytes,
    sourceSchedule: [150, 151, 152], transformShape: [152, 9],
    rightInverseShape: [152, 143], exactPrincipalRelations: 152,
    equations: ["RT=0", "RQ=I"], packedLogsSourceOrderExact: true,
    ownerMutations, authenticatedMutations: 4,
    publication: "atomic-idempotent-0444", publicCompletion: false,
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
