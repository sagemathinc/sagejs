#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const host = require("./row6_phase6_prepared_prefix_host.cjs");

async function main() {
  const envelope = JSON.parse(fs.readFileSync(
    process.argv[2] || "/tmp/row6-prepared-projection.json"));
  const resident = await host.prepare(envelope.data);
  const result = host.run(resident);
  assert.equal(result.status, 0n);
  const core = fs.readFileSync(resident.built.coreSourcePath, "utf8");
  assert(core.includes("native_pari_row6_prepared_factor_base_root"));
  assert(core.includes("native_pari_row6_prepared_initial_relations"));
  assert.throws(() => host.run(resident), /fresh (?:publication|state) owner/);
  const changed = structuredClone(envelope.data);
  changed.prep_polynomial[0] = "2000000000019";
  await assert.rejects(() => host.prepare(changed));
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row6-phase6-prepared-prefix-check-v1",
    compilerCacheKey: resident.built.cacheKey,
    oneNativeCall: true,
    subprocesses: 0,
    filesystemOwnerBoundaries: 0,
    exactProjection: result.projection,
    rejectedReplayWithoutMutation: true,
    preparedMutationRejected: true,
    timingEligible: false,
  }, null, 2)}\n`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
