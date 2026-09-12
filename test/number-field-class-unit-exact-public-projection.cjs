// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");

test("conditional cubic maps retain exact isolation without granting unconditional units", () => {
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
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
  const payload = JSON.parse(result.stdout.trim().split("\n").at(-1));
  assert.equal(payload.status, "ok");
  assert.equal(payload.rows.length, 3);
  assert.deepEqual(payload.scalar_controls, [
    { label: "3.1.588.1", proof: true, class_number: 3 },
    { label: "3.1.5448.1", proof: true, scalar_declined: true },
    { label: "3.1.4027.2", proof: true, scalar_declined: true },
  ]);
  assert.deepEqual(payload.fresh_declines, payload.scalar_controls.map(({ label }) =>
    ({ label, proof: true, combined_declined: true })));
  for (const row of payload.rows) {
    assert.equal(row.proof, false);
    assert.equal(row.proof_status, "exact-relations-conditional-grh");
    assert.equal(row.cached_unconditional_combined_declined, true);
    // Absolute latency is measured by the dedicated class-unit benchmark.
    // This integration test runs alongside independent files, so wall-clock
    // microbenchmarks here would turn test-runner contention into failures.
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
