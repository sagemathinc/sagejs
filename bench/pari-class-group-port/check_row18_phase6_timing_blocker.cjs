#!/usr/bin/env node
"use strict";
// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64
const assert = require("node:assert/strict");
const probe = require("./row18_phase6_timing_blocker_probe.cjs");
const result = probe.inspect(process.argv[2]);
assert.equal(result.freshInputAuthenticated, true);
assert.equal(result.changedPreparedAuthorityRejected, true);
assert.equal(result.residentPreparedKernelTimingReady, true);
assert.equal(result.aggregateAbiOwners, 415);
assert.equal(result.inclusiveNativeCalls, 1);
assert.deepEqual(result.currentMathematicalCalls,
  ["pari_resident_generated_class_attempt", "pari_prepared_class_group_resumable"]);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
