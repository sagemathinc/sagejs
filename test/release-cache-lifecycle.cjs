"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const root = resolve(__dirname, "..");
const script = resolve(root, "scripts", "release-cache-smoke.cjs");

test("release cache smoke is hermetic, bounded, recoverable, and safe", () => {
  assert.equal(
    existsSync(resolve(root, "dist", "tools", "cli.js")),
    true,
    "release cache smoke requires a built Sage.js tree; run pnpm build",
  );
  const result = spawnSync(process.execPath, [script, "--json"], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema, "sagejs.release-cache-smoke/v1");
  assert.equal(report.failed, 0);
  assert.equal(report.passed, 6);
  assert.equal(report.temporary_root, null);
  assert.equal(report.temporary_root_removed, true);
  assert.deepEqual(
    report.scenarios.map(({ name, status }) => [name, status]),
    [
      ["public-user-cache-bounds", "pass"],
      ["native-cold-warm-corrupt-interrupted", "pass"],
      ["native-bounded-cleanup-and-path-safety", "pass"],
      ["unusable-cache-location", "pass"],
      ["missing-compiler-recovery", "pass"],
      ["concurrent-native-publication", "pass"],
    ],
  );
  const publicCache = report.scenarios[0].details;
  assert.equal(publicCache.dry_run_candidates, 4);
  assert.equal(publicCache.removed_versions, 4);
  assert.equal(publicCache.preserved_live_leases, 1);
  const nativeCleanup = report.scenarios[2].details;
  assert.equal(nativeCleanup.per_pass_limit, 1);
  assert.equal(nativeCleanup.remaining_generations, 3);
  const concurrent = report.scenarios[5].details;
  assert.equal(concurrent.builds, 1);
  assert.deepEqual(concurrent.statuses, ["built", "restored"]);
});

test("release cache smoke rejects caller-owned scratch roots", () => {
  const result = spawnSync(
    process.execPath,
    [script, "--root", resolve(root, "must-not-be-touched")],
    { cwd: root, encoding: "utf8", timeout: 10_000 },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown option --root/);
});
