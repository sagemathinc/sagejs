#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const api = require("./mixed_cubic_c7_coordinator.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const ROOT = path.resolve(__dirname, "../..");
const directory = __dirname;
const unitCoordinator = path.join(directory, "mixed_cubic_rank1_unit_coordinator.cjs");
const c7Coordinator = path.join(directory, "mixed_cubic_c7_coordinator.cjs");
const cases = [
  { row: 16, w0: "/scratch/sagejs-pari-development-panel-a998/panel-16-aabb93f0d6139f93.json",
    sha: "8ec0387525e4e3f34eb6431ede35b7438b19c4a8f208dc76da682821a14756ce",
    presentation: path.join(directory, "row16_mixed_cubic_owner_coordinator.cjs"),
    classWitness: path.join(directory, "row16_mixed_cubic_class_witness_coordinator.cjs") },
  { row: 18, w0: "/scratch/sagejs-pari-development-panel-a998/panel-18-d48b43b95d82e5e1.json",
    sha: "6e872fc1cf4765b30782ac32f2a0d7db5fc21c8b22721a976276708ddb084d92",
    presentation: path.join(directory, "row18_mixed_cubic_retry_coordinator.cjs"),
    classWitness: path.join(directory, "row18_mixed_cubic_class_witness_coordinator.cjs") },
];
function run(argv) {
  const result = spawnSync(process.execPath, argv, { cwd: ROOT, encoding: "utf8",
    timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || String(result.error)); return JSON.parse(result.stdout);
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-mixed-cubic-c7-"));
const summaries = [];
try {
  for (const entry of cases) {
    const presentation = run([entry.presentation, "--pristine-w0", entry.w0,
      "--pristine-sha256", entry.sha, "--output-dir", path.join(temporary, `p${entry.row}`)]);
    const classWitness = run([entry.classWitness, "--presentation-owner", presentation.path,
      "--presentation-sha256", presentation.sha256, "--output-dir", path.join(temporary, `c${entry.row}`)]);
    const unit = run([unitCoordinator, "--presentation-owner", presentation.path,
      "--presentation-sha256", presentation.sha256, "--output-dir", path.join(temporary, `u${entry.row}`)]);
    const args = [c7Coordinator, "--presentation-owner", presentation.path,
      "--presentation-sha256", presentation.sha256, "--class-owner", classWitness.path,
      "--class-sha256", classWitness.sha256, "--unit-owner", unit.path,
      "--unit-sha256", unit.sha256, "--output-dir", path.join(temporary, `r${entry.row}`)];
    const first = run(args); const second = run(args); assert.deepEqual(second, first);
    assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
    const raw = fs.readFileSync(first.path); assert.equal(neutral.sha256Bytes(raw), first.sha256);
    const envelope = JSON.parse(raw); neutral.validatePayload(envelope.payload);
    assert.equal(envelope.payload.terminal.correspondence_complete, true);
    assert.equal(envelope.payload.terminal.public_complete, false);
    assert.equal(envelope.payload.unitGroup.materialization.tag, "exact_units");
    const p = JSON.parse(fs.readFileSync(presentation.path));
    const c = JSON.parse(fs.readFileSync(classWitness.path));
    const u = JSON.parse(fs.readFileSync(unit.path));
    let mutations = 0;
    const reject = (which, mutation) => {
      const values = [structuredClone(p), structuredClone(c), structuredClone(u)];
      mutation(values[which]); assert.throws(() => api.composePayload(...values)); mutations += 1;
    };
    reject(0, value => { value.presentation.classNumber = "1"; });
    reject(1, value => {
      if (entry.row === 16) value.witnesses[0].exactIdealReplay.powerEqualsPrincipal = false;
      else value.exactIdealReplay.powerEqualsPrincipal = false;
    });
    reject(2, value => { value.factorback.unitNorm = "2"; });
    summaries.push({ row: entry.row, envelopeSha256: first.sha256,
      payloadSha256: first.payloadSha256, bytes: first.bytes,
      classNumber: envelope.payload.classGroup.classNumber,
      invariants: envelope.payload.classGroup.invariantFactors,
      unitRank: envelope.payload.unitGroup.rank, exactUnits: true,
      correspondenceComplete: true, publicComplete: false, mutations });
  }
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/mixed-cubic-c7-check-v1", fields: summaries,
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
