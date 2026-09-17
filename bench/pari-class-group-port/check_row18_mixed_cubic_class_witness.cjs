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
const api = require("./row18_mixed_cubic_class_witness_coordinator.cjs");
const ROOT = path.resolve(__dirname, "../..");
const w0 = "/scratch/sagejs-pari-development-panel-a998/panel-18-d48b43b95d82e5e1.json";
const w0Sha = "6e872fc1cf4765b30782ac32f2a0d7db5fc21c8b22721a976276708ddb084d92";
const presentationCoordinator = path.join(__dirname, "row18_mixed_cubic_retry_coordinator.cjs");
const coordinator = path.join(__dirname, "row18_mixed_cubic_class_witness_coordinator.cjs");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function run(argv, expected = 0) {
  const result = spawnSync(process.execPath, argv, { cwd: ROOT, encoding: "utf8",
    timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, expected, result.stderr || String(result.error)); return result;
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row18-class-"));
try {
  const presentations = path.join(temporary, "presentations");
  const presentation = JSON.parse(run([presentationCoordinator, "--pristine-w0", w0,
    "--pristine-sha256", w0Sha, "--output-dir", presentations]).stdout);
  const output = path.join(temporary, "witnesses");
  const args = [coordinator, "--presentation-owner", presentation.path,
    "--presentation-sha256", presentation.sha256, "--output-dir", output];
  const first = JSON.parse(run(args).stdout);
  const second = JSON.parse(run(args).stdout);
  assert.deepEqual(second, first);
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  assert.equal(sha(fs.readFileSync(first.path)), first.sha256);
  const owner = JSON.parse(fs.readFileSync(first.path));
  assert(api.verifyOwner(owner, owner.ancestry));
  let mutations = 0;
  const reject = mutation => {
    const changed = structuredClone(owner); mutation(changed);
    assert.throws(() => api.verifyOwner(changed, owner.ancestry)); mutations += 1;
  };
  reject(value => { value.generator.norm = "49"; });
  reject(value => { value.quotient.generatorOrder = "9"; });
  reject(value => { value.generator.sourceIndex = 5; });
  reject(value => { value.exactIdealReplay.powerHnf[0] = "1"; });
  const bad = [...args]; bad[bad.indexOf("--presentation-sha256") + 1] = "0".repeat(64);
  assert.match(run(bad, 1).stderr, /presentation owner digest or mode changed/);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row18-cyclic-class-witness-check-v1",
    ownerSha256: first.sha256, ownerBytes: first.bytes,
    generatorSourceIndex: 4, generatorNorm: "7", exactOrder: "18",
    properDivisorsRejected: ["1", "2", "3", "6", "9"],
    powerEqualsPrincipal: true, mutations, publication: "atomic-idempotent-0444",
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
