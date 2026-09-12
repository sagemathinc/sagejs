"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const samples = require("./samples.json");
const identity = require("./identity.json");
const profile = require("./profile-summary.json");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

assert.equal(sha256(fs.readFileSync(path.join(__dirname, "driver.cjs"))), identity.driver_sha256);
assert.equal(sha256(fs.readFileSync(path.join(__dirname, "samples.json"))), identity.samples_file_sha256);
assert.equal(sha256(fs.readFileSync(path.join(__dirname, "profile-summary.json"))), identity.profile_summary_file_sha256);
assert.equal(samples.warmups_per_process, 3);
assert.equal(samples.samples_per_process, 7);
assert.deepEqual(samples.process_order, ["A", "B", "B", "A"]);
for (const series of [samples.controlled_bench1, samples.preceding_local_sanity]) {
  assert.equal(series.length, 12);
  assert.equal(series.reduce((sum, row) => sum + row.samples.length, 0), 84);
  for (const [index, scenario] of ["plain_create", "owned_expose", "owned_write"].entries()) {
    const rows = series.slice(index * 4, index * 4 + 4);
    assert.deepEqual(rows.map(row => row.variant), samples.process_order);
    for (const row of rows) {
      assert.equal(row.scenario, scenario);
      assert.equal(row.node, "v" + identity.node);
      assert.equal(row.samples.length, 7);
      assert.ok(row.samples.every(value => Number.isFinite(value) && value > 0));
    }
  }
}
assert.equal(profile.guard_installer.self + profile.guard_installer_direct_children
  .reduce((sum, entry) => sum + entry.inclusive, 0), profile.guard_installer.inclusive);
assert.ok(profile.registration.inclusive >= profile.guard_installer.inclusive);
assert.ok(profile.worker_total_self_samples > profile.registration.inclusive);
assert.equal(profile.profiled_run_samples_ms.length, 7);

const artifactRoot = process.argv[2];
if (artifactRoot) {
  assert.equal(sha256(fs.readFileSync(path.join(artifactRoot, "src/lib/sagejs/_namespace.py"))),
    identity.namespace_source_sha256);
  assert.equal(sha256(fs.readFileSync(path.join(artifactRoot, "dist/build-receipt.json"))),
    identity.build_receipt_file_sha256);
  assert.equal(sha256(fs.readFileSync(path.join(artifactRoot,
    "dist/guard-diagnostics/frozen-owned-cost-qualification.cjs"))), identity.driver_sha256);
}

for (const scenario of ["plain_create", "owned_expose", "owned_write"]) {
  const rows = samples.controlled_bench1.filter(row => row.scenario === scenario);
  const medians = rows.map(row => median(row.samples));
  console.log(JSON.stringify({ scenario, medians_ms_abba: medians,
    paired_ratios: [medians[1] / medians[0], medians[2] / medians[3]],
    paired_delta_ms: [medians[1] - medians[0], medians[2] - medians[3]] }));
}
console.log("Verified 84 controlled samples, 84 separate local samples, driver identity, and profile arithmetic.");
