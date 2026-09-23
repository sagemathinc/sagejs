#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

require("./row0_phase6_matched_kernel_check.cjs").run(1, {
  freshCorrectness: !process.argv.includes("--skip-fresh-correctness"),
}).then(receipt => process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`),
  error => { console.error(error.stack || error); process.exitCode = 1; });
