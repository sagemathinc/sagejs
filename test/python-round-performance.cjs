// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

test("warm round performance stays within the reviewed CPython ceiling", () => {
  const benchmark = path.join(__dirname, "..", "bench", "python-round.cjs");
  const result = spawnSync(process.execPath, [benchmark, "--check"], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_ROUND_SAMPLES: "5",
      SAGEJS_ROUND_WARMUPS: "1",
      SAGEJS_ROUND_REPETITIONS: "50",
    },
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS: every round workload is at most 20x CPython/u);
});
