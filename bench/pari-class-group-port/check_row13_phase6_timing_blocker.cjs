#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const probe = require("./row13_phase6_timing_blocker_probe.cjs");
const result = probe.inspect(process.argv[2]);
assert.equal(result.freshInputAuthenticated, true);
assert.equal(result.changedPreparedInputRejected, true);
assert.equal(result.residentPreparedKernelTimingReady, true);
assert.equal(result.sourceCut.length, 4);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
