#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const api = require("./row11_rank2_c5_c6_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-11-ce2bfa61425aa681.json";
const LANE_COORDINATOR = path.join(__dirname, "row11_terminal_class_closure_coordinator.cjs");
const COORDINATOR = path.join(__dirname, "row11_rank2_c5_c6_coordinator.cjs");
const EXPECTED_OWNER_SHA256 = "7419b9fa7245fd1f7d0d25d2160e0b4b815552aa40b397b17543236bc7bc53ac";
function runNode(args, expected = 0) {
  const result = spawnSync("timeout", ["600", "prlimit", "--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", process.execPath, ...args], { cwd: ROOT, encoding: "utf8",
    timeout: 610_000, maxBuffer: 256 * 1024 * 1024 });
  assert.equal(result.status, expected, result.stderr || result.stdout || String(result.error));
  return result;
}
function clone(value) { return structuredClone(value); }

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row11-rank2-check-"));
try {
  const totalStarted = Date.now();
  const laneStarted = Date.now();
  const laneReceipt = JSON.parse(runNode([LANE_COORDINATOR, "--pristine-w0", W0,
    "--pristine-sha256", api.W0_SHA256, "--output-dir", path.join(temporary, "lane-a")]).stdout);
  const laneElapsedMs = Date.now() - laneStarted;
  assert.equal(laneReceipt.sha256, api.LANE_A_SHA256);
  const lane = JSON.parse(fs.readFileSync(laneReceipt.path));
  const output = path.join(temporary, "owners");
  const args = [COORDINATOR, "--lane-a-owner", laneReceipt.path, "--pristine-w0", W0,
    "--output-dir", output];
  const firstStarted = Date.now(), first = JSON.parse(runNode(args).stdout);
  const firstElapsedMs = Date.now() - firstStarted;
  const secondStarted = Date.now(), second = JSON.parse(runNode(args).stdout);
  const secondElapsedMs = Date.now() - secondStarted;
  assert.equal(first.sha256, EXPECTED_OWNER_SHA256);
  assert.equal(second.sha256, first.sha256);
  assert.equal(second.path, first.path);
  assert.deepEqual(fs.readdirSync(output), [path.basename(first.path)]);
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  const owner = JSON.parse(fs.readFileSync(first.path));
  assert.equal(api.verifyOwner(owner, owner.ancestry), true);
  assert.equal(owner.c6.reason, "LARGE");
  assert.deepEqual(owner.c6.state, [2, 21, 0, 0, 0, 0, 0, 1]);
  assert.equal(owner.c6.expandedUnitsPublished, false);

  const records = lane.exactRelations.relationRecords.map(BigInt);
  const generators = lane.exactRelations.principalGenerators;
  const relationNorms = lane.exactRelations.relationNorms.map(BigInt);
  const provenance = owner.units.rawUnitProvenance.map(BigInt);
  for (let unit = 0; unit < 2; unit += 1) {
    const compact = owner.units.compactFactoredUnits[unit];
    const expanded = Array(430).fill(0n);
    let normSign = 1;
    for (let factor = 0; factor < compact.factorCount; factor += 1) {
      const relation = Number(compact.relationIndices[factor]);
      const exponent = BigInt(compact.relationExponents[factor]);
      expanded[relation] = exponent;
      assert.deepEqual(compact.principalGenerators.slice(4 * factor, 4 * factor + 4),
        generators.slice(4 * relation, 4 * relation + 4));
      if (relationNorms[relation] < 0n && (exponent & 1n) !== 0n) normSign = -normSign;
    }
    assert.deepEqual(expanded, provenance.slice(430 * unit, 430 * (unit + 1)));
    assert.equal(String(normSign), compact.norm);
    for (let row = 0; row < 421; row += 1) {
      let value = 0n;
      for (let relation = 0; relation < 430; relation += 1)
        value += records[relation * 421 + row] * expanded[relation];
      assert.equal(value, 0n, `R*Wraw[${row},${unit}]`);
    }
  }

  let mutations = 0;
  function reject(change) {
    const changed = clone(owner); change(changed);
    assert.throws(() => api.verifyOwner(changed, owner.ancestry)); mutations += 1;
  }
  reject(value => { value.ancestry.laneAOwnerSha256 = "0".repeat(64); });
  reject(value => { value.sourceLogs.kernelLogs[0] = String(BigInt(value.sourceLogs.kernelLogs[0]) + 1n); });
  reject(value => { value.units.unitKernelTransform[0] = "2"; });
  reject(value => { value.units.rawUnitProvenance[0] = "0"; });
  reject(value => { value.units.compactFactoredUnits[0].relationExponents[0] = "0"; });
  reject(value => { value.units.compactFactoredUnits[1].principalGenerators[0] = "0"; });
  reject(value => { value.units.unitNorms[0] = "-1"; });
  reject(value => { value.c5.privateGetfuFactor[0] = "2"; });
  reject(value => { value.c6.reason = "PRECI"; });
  reject(value => { value.c6.state[1] = 20; });
  reject(value => { value.c6.expandedUnitsPublished = true; });
  reject(value => { value.completion.correspondenceComplete = false; });

  const changedLane = path.join(temporary, "changed-lane.json");
  const changed = Buffer.from(fs.readFileSync(laneReceipt.path));
  changed[changed.length - 2] = changed[changed.length - 2] === 0x7d ? 0x20 : 0x7d;
  fs.writeFileSync(changedLane, changed);
  const changedArgs = [...args]; changedArgs[changedArgs.indexOf("--lane-a-owner") + 1] = changedLane;
  assert.match(runNode(changedArgs, 1).stderr, /Lane A owner identity changed/);

  // The frozen terminal event is opened only after the source-derived owner exists.
  const w0 = JSON.parse(fs.readFileSync(W0));
  const references = w0.events.filter(event => event.event === "fundamental_units");
  assert.equal(references.length, 1);
  const reference = references[0];
  assert.equal(reference.fu, null);
  assert.deepEqual(owner.regulator.acceptedPacked,
    [reference.regulator.mantissa, String(reference.regulator.precision), String(reference.regulator.exponent)]);
  const realExponents = reference.A.values.flatMap(column => column.values.map(value =>
    value.kind === "complex" ? value.real.exponent : (value.kind === "real" ? value.exponent : 0)));
  assert.equal(Math.max(...realExponents), 20);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row11-rank2-c5-c6-check-v1",
    ownerSha256: first.sha256, ownerBytes: first.bytes, laneAOwnerSha256: laneReceipt.sha256,
    result: owner.c6.reason, c5State: owner.c5.state, c6State: owner.c6.state,
    compactFactorCounts: owner.units.compactFactoredUnits.map(value => value.factorCount),
    unitNorms: owner.units.unitNorms, unitRealSigns: owner.units.unitRealSigns,
    equationsChecked: 842, mutationsRejected: mutations + 1,
    timingsMs: { laneA: laneElapsedMs, firstSuffix: firstElapsedMs,
      secondSuffix: secondElapsedMs, total: Date.now() - totalStarted },
    postcomputeDifferential: { fu: null, regulator: true, maximumPublicAExponent: 20,
      privateGetfuMaximumExponent: 21, sourceThreshold: 20, inferredReason: "LARGE" },
    limits: { timeoutSeconds: 600, addressSpaceGiB: 4, rssGiB: 4, cpuSeconds: 600 },
    correspondenceComplete: true, publicComplete: false,
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
