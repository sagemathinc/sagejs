#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const W0_SHA256 = "45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const readGzip = filename => JSON.parse(zlib.gunzipSync(fs.readFileSync(filename)));

async function main() {
  const [preparedPath, acceptancePath, w0Path] = process.argv.slice(2);
  assert(preparedPath && acceptancePath && w0Path,
    "usage: check_row21_live_unit.cjs PREPARED.json ACCEPTANCE.json.gz W0.json");
  process.env.SAGEJS_NATIVE_CACHE_DIR ||= "/scratch/sagejs-row21-unit-native-cache";
  const prepared = JSON.parse(fs.readFileSync(preparedPath));
  const acceptanceOwner = readGzip(acceptancePath);
  const coordinator = require("./row21_live_unit_coordinator.cjs");
  const first = await coordinator.run({ prepared, acceptanceOwner,
    outputDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "row21-unit-a-")) });
  const second = await coordinator.run({ prepared, acceptanceOwner,
    outputDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "row21-unit-b-")) });
  assert.equal(first.ownerSha256, second.ownerSha256);
  assert.deepEqual(first.owner, second.owner);
  assert.equal(first.owner.provenance.frozenAnswerInputs, false);

  const badOwner = structuredClone(first.owner);
  badOwner.units.exactIntegralBasis[0][0] =
    String(BigInt(badOwner.units.exactIntegralBasis[0][0]) + 1n);
  assert.throws(() => coordinator.verifyOwnerAgainstResult(badOwner, first.result));

  const rejected = [];
  for (const [label, mutate] of [
    ["prepared", value => { value.prepared.prep_polynomial[0] = "37"; }],
    ["acceptance", value => { value.acceptanceOwner.acceptance.classNumber = "2"; }],
  ]) {
    const bad = { prepared: structuredClone(prepared),
      acceptanceOwner: structuredClone(acceptanceOwner),
      outputDirectory: fs.mkdtempSync(path.join(os.tmpdir(), `row21-unit-bad-${label}-`)) };
    mutate(bad);
    await assert.rejects(coordinator.run(bad));
    assert.deepEqual(fs.readdirSync(bad.outputDirectory), []);
    rejected.push(label);
  }

  // W0 remains unopened until two live publications and all mutation replay.
  const w0Bytes = fs.readFileSync(w0Path);
  assert.equal(sha(w0Bytes), W0_SHA256);
  const script = String.raw`
import importlib,json,sys
sys.path.extend([sys.argv[1],sys.argv[1]+'/src/lib'])
m=importlib.import_module('bench.pari-class-group-port.row21_rank3_getfu')
json.dump(m.probe_row21_rank3_getfu(json.load(sys.stdin),sys.argv[2]),sys.stdout,separators=(',',':'))
`;
  const oracle = spawnSync("python3", ["-c", script, ROOT, W0_SHA256], {
    cwd: ROOT, input: w0Bytes, encoding: "utf8", timeout: 300_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(oracle.status, 0, oracle.stderr || String(oracle.error));
  const differential = JSON.parse(oracle.stdout);
  const computed = first.owner.units.exactIntegralBasis
    .map(column => column.join(",")).sort();
  const reference = Array.from({ length: 3 }, (_, column) =>
    differential.exactUnitBasis.slice(5 * column, 5 * column + 5).join(",")).sort();
  assert.deepEqual(computed, reference);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row21-live-unit-check-v1",
    ownerPath: first.path, ownerSha256: first.ownerSha256,
    compressedSha256: first.compressedSha256,
    getfuState: first.owner.replay.getfuState,
    exactNorms: first.owner.units.norms,
    exactRealSigns: first.owner.units.realSigns,
    byteIdenticalReplay: true, ownerMutationRejected: true,
    inputMutationsRejected: rejected,
    postcomputeOracle: { readAfterPublication: true, unitSetMatches: true },
  })}\n`);
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
