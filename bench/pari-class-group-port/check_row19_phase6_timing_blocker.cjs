#!/usr/bin/env node
"use strict";
// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64
const assert = require("node:assert/strict");
const probe = require("./row19_phase6_timing_blocker_probe.cjs");
const result = probe.inspect(process.argv[2]);
assert.equal(result.freshInputAuthenticated, true);
assert.equal(result.changedPreparedAuthorityRejected, true);
assert.equal(result.residentPreparedKernelTimingReady, false);
assert.equal(result.residentRelationKernelReady, true);
assert.equal(result.residentRelationKernelStages, 6);
assert.equal(result.forbiddenCurrentClockWork.length, 4);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
