#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const host = require("./row6_phase6_whole_prepared_host.cjs");

function sha256File(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function integerAt(owner, index) {
  const signedWords = owner.sizes[index], words = Math.abs(signedWords);
  let value = 0n;
  for (let word = words - 1; word >= 0; word -= 1)
    value = (value << 64n) + owner.limbs[index * owner.wordCapacity + word];
  return signedWords < 0 ? -value : value;
}

function digestOwner(owner, count, start = 0) {
  const hash = crypto.createHash("sha256");
  hash.update("[");
  for (let index = 0; index < count; index += 1) {
    if (index) hash.update(",");
    hash.update(JSON.stringify(integerAt(owner, start + index).toString()));
  }
  hash.update("]");
  return hash.digest("hex");
}

async function main() {
  const [payloadPath, addonPath, expectedAddonSha256] = process.argv.slice(2);
  assert(payloadPath && addonPath && expectedAddonSha256,
    "usage: row6_phase6_reduced_artifact_check.cjs PAYLOAD ADDON ADDON_SHA256");
  assert.equal(sha256File(addonPath), expectedAddonSha256,
    "reduced artifact digest changed");
  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  const addon = require(addonPath);
  const exportName = `${host.EXPORT}$gmp`;
  const directNative = addon[exportName];
  assert.equal(typeof directNative, "function", `missing reduced export ${exportName}`);
  const outputPath = path.dirname(path.dirname(path.dirname(addonPath)));
  const modulePath = path.join(outputPath, "index.cjs");
  const wrappedNative = require(modulePath)[host.EXPORT];
  assert.equal(typeof wrappedNative?.gmp, "function",
    `missing generated wrapper ${host.EXPORT}.gmp`);
  // Use the generated wrapper so the diagnostic trace accessor remains
  // reachable.  Artifact authentication above still hashes the exact addon,
  // and `.gmp` is the direct GMP-only entry point rather than a fallback.
  const invoke = wrappedNative;
  assert.equal(invoke.nativeAvailable, true);
  const built = Object.freeze({ cacheKey: path.basename(outputPath),
    coreSourcePath: path.join(outputPath, "kernel_core.c"), modulePath, outputPath });
  const resident = host.prepareWithKernel(payload.prepared, built, invoke);
  const reduced = Object.freeze({ ...resident, fn: invoke });
  const before = process.hrtime.bigint();
  let result;
  try {
    result = host.run(reduced);
  } catch (error) {
    const failureState = {
      factor: resident.gate.prefix.factor.root_state.toArray().map(String),
      relation: resident.gate.prefix.initial.relation_state.toArray().map(String),
      hnf: Array.from(resident.gate.hnf.state).map(String),
      assembly: Array.from(resident.gate.hnf.assembly_state).map(String),
    };
    process.stderr.write(`post-call failure state=${JSON.stringify(failureState)}\n`);
    throw error;
  }
  const elapsedNs = process.hrtime.bigint() - before;
  const diagnosticStageTrace = invoke.diagnosticStageTrace?.() || null;
  if (diagnosticStageTrace !== null) {
    assert.equal(diagnosticStageTrace.failed, false);
    assert.equal(diagnosticStageTrace.clockFailed, false);
    assert.equal(diagnosticStageTrace.rootNanoseconds,
      Object.values(diagnosticStageTrace.totalsNanoseconds)
        .reduce((total, value) => total + value, 0n));
  }
  const replay = Object.freeze({
    relations: digestOwner(resident.gate.prefix.initial.relation_records, 1130 * 1137),
    logs: digestOwner(resident.gate.collector.log_embeddings, 21 * 1137),
    h: digestOwner(resident.gate.append2.result_h, 4),
    c: digestOwner(resident.gate.append2.result_c, 21 * 1137),
    rawToUnitKernel: digestOwner(resident.gate.ancestry.raw_to_all, 7 * 1137),
    rawToPresentation: digestOwner(
      resident.gate.ancestry.raw_to_all, 2 * 1137, 7 * 1137),
  });
  assert.deepEqual(replay, {
    relations: "2e3b35e24e74052a74c07ef69ae880ae5851225f87a31b7c97f32ea102d944df",
    logs: "7621bb00dbec3637ca1fd64aa07a82a604a95292e9e04e96fed9ef2a7b5bf03a",
    h: "8eceed23fcee317f80fa7ab35446e7729865c88de6e99653edfc54f8c5ed4737",
    c: "7e5425fd516a7cf7f4d8c8cb0704ad1a674c07be40cad482d25a0167134727a2",
    rawToUnitKernel:
      "80c6f56bbd1b46bd99efa54bd438229571d40295e9c1493c1545f338c12ff0f4",
    rawToPresentation:
      "bb82abc1ef9212e640c019b3ef9106b332881d89cff88b5ad599029522da7014",
  });
  assert.equal(result.terminalProjection.classNumber, "4");
  assert.deepEqual(result.terminalProjection.invariants, ["2", "2"]);
  assert.deepEqual(result.terminalProjection.unitState, [0, 0, 0, 2, 0, 7, 2, 192]);
  assert.deepEqual(result.terminalProjection.classState,
    [0, 1130, 0, 1137, 7116, 7819, 5, 1092, 1094, 3, 7, 2]);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row6-reduced-artifact-check-v1",
    addonPath,
    addonSha256: expectedAddonSha256,
    elapsedNs: elapsedNs.toString(),
    elapsedMilliseconds: Number(elapsedNs) / 1e6,
    diagnosticStageTrace,
    exactReplaySha256: replay,
    exactGateProjection: result.gateProjection,
    exactTerminalProjection: result.terminalProjection,
    completeClassAndUnits: true,
    nativeCalls: 1,
  }, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
