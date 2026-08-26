"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

test("exact cubic and direct-Minkowski projections are isolated zero-algebra views", () => {
  const executable =
    process.platform === "win32"
      ? process.execPath
      : join(root, "bin", "sagejs");
  const arguments_ =
    process.platform === "win32"
      ? [
          join(root, "bin", "sagejs-source.cjs"),
          "--python",
          join(root, "test", "number-field-class-unit-exact-public-projection.py"),
        ]
      : [
          "--python",
          join(root, "test", "number-field-class-unit-exact-public-projection.py"),
        ];
  const result = spawnSync(executable, arguments_, {
    cwd: root,
    encoding: "utf8",
    timeout: 900_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split("\n").at(-1));
  assert.equal(payload.status, "ok");
  assert.equal(payload.rows.length, 6);
  for (const row of payload.rows) {
    assert.ok(row.repeat_median_seconds <= 0.025, JSON.stringify(row));
    assert.ok(row.verify_seconds > row.repeat_median_seconds, JSON.stringify(row));
    assert.deepEqual(row.counters, {
      engine_discrete_logs: 0,
      principal_ideal_builds: 0,
      proof_record_rebuilds: 0,
      representative_ideals: 0,
      representative_reconstructions: 0,
      witness_verifications: 0,
    });
  }
});
