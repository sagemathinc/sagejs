#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const api = require("./mixed_cubic_rank1_unit_coordinator.cjs");
const ROOT = path.resolve(__dirname, "../..");
const directory = __dirname;
const unitCoordinator = path.join(directory, "mixed_cubic_rank1_unit_coordinator.cjs");
const cases = [
  { row: 16, w0: "/scratch/sagejs-pari-development-panel-a998/panel-16-aabb93f0d6139f93.json",
    sha: "8ec0387525e4e3f34eb6431ede35b7438b19c4a8f208dc76da682821a14756ce",
    coordinator: path.join(directory, "row16_mixed_cubic_owner_coordinator.cjs"),
    bits: [23890, 23881, 23880] },
  { row: 18, w0: "/scratch/sagejs-pari-development-panel-a998/panel-18-d48b43b95d82e5e1.json",
    sha: "6e872fc1cf4765b30782ac32f2a0d7db5fc21c8b22721a976276708ddb084d92",
    coordinator: path.join(directory, "row18_mixed_cubic_retry_coordinator.cjs"),
    bits: [39377, 39367, 39368] },
];
function run(argv, expected = 0) {
  const result = spawnSync(process.execPath, argv, { cwd: ROOT, encoding: "utf8",
    timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, expected, result.stderr || String(result.error)); return result;
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-mixed-cubic-unit-"));
const summaries = [];
try {
  for (const entry of cases) {
    const presentation = JSON.parse(run([entry.coordinator, "--pristine-w0", entry.w0,
      "--pristine-sha256", entry.sha, "--output-dir", path.join(temporary, `p${entry.row}`)]).stdout);
    const args = [unitCoordinator, "--presentation-owner", presentation.path,
      "--presentation-sha256", presentation.sha256, "--output-dir", path.join(temporary, `u${entry.row}`)];
    const first = JSON.parse(run(args).stdout);
    const second = JSON.parse(run(args).stdout);
    assert.deepEqual(second, first);
    assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
    const owner = JSON.parse(fs.readFileSync(first.path));
    assert(api.verifyOwner(owner, owner.ancestry));
    assert.deepEqual(owner.factorback.exactUnitBits, entry.bits);
    assert.equal(owner.factorback.unitNorm, "1");
    let mutations = 0;
    const reject = mutation => {
      const changed = structuredClone(owner); mutation(changed);
      assert.throws(() => api.verifyOwner(changed, owner.ancestry)); mutations += 1;
    };
    reject(value => { value.cleanarch.gcd = "2"; });
    reject(value => { value.cleanarch.kernelLogMultiples[0] = "1"; });
    reject(value => { value.factorback.unitNorm = "2"; });
    reject(value => { value.outcome.usedFrozenFundamentalUnit = true; });
    const bad = [...args]; bad[bad.indexOf("--presentation-sha256") + 1] = "0".repeat(64);
    assert.match(run(bad, 1).stderr, /presentation owner digest or mode changed/);
    summaries.push({ row: entry.row, presentationSha256: presentation.sha256,
      unitSha256: first.sha256, ownerBytes: first.bytes,
      kernelLogMultiples: owner.cleanarch.kernelLogMultiples,
      bezoutTransform: owner.cleanarch.bezoutTransform,
      exactUnitBits: owner.factorback.exactUnitBits, norm: owner.factorback.unitNorm,
      status: owner.outcome.status, precisionRetry: owner.outcome.precisionRetry,
      mutations });
  }
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/mixed-cubic-rank1-unit-check-v1",
    fields: summaries, usedFrozenFundamentalUnit: false,
    limits: { timeoutSeconds: 600, addressSpaceGiB: 4 },
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
