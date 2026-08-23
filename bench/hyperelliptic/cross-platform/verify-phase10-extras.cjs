#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const paths = process.argv.slice(2).map((path) => resolve(path));
if (paths.length === 0) {
  process.stderr.write(
    "Usage: node verify-phase10-extras.cjs RECEIPT...\n",
  );
  process.exit(2);
}

const receipts = paths.map((path) => ({
  path,
  value: JSON.parse(readFileSync(path, "utf8")),
}));
const reference = receipts[0].value;
const portableHarness = receipts.find(
  ({ value }) => value.host.platform !== "darwin",
)?.value.repository.harness_sha256;

function exact(value) {
  return {
    cantor: value.wasm.cantor.map((row) => ({
      genus: row.genus,
      output: row.exact_sha256,
      status: row.status_sha256,
      rolling: row.standalone_rolling_digest,
    })),
    kummer: {
      output: value.wasm.kummer_project.exact_sha256,
      status: value.wasm.kummer_project.status_sha256,
    },
  };
}

for (const { path, value } of receipts) {
  assert.equal(
    value.schema,
    "sagejs.hyperelliptic-phase10-portable-extras.v1",
    `${path}: schema`,
  );
  assert.equal(value.repository.commit, reference.repository.commit);
  assert.equal(value.repository.status, "", `${path}: dirty source checkout`);
  assert.match(value.repository.harness_sha256, /^[0-9a-f]{64}$/);
  if (value.host.platform !== "darwin" && portableHarness !== undefined) {
    assert.equal(
      value.repository.harness_sha256,
      portableHarness,
      `${path}: portable harness digest`,
    );
  }
  assert.deepEqual(
    value.repository.package_smoke_overlay,
    reference.repository.package_smoke_overlay,
    `${path}: package-smoke test overlay`,
  );
  assert.equal(value.configuration.repeat, reference.configuration.repeat);
  assert.equal(value.wasm.status, "available", `${path}: Wasm capability`);
  assert.equal(
    value.wasm.manifest_sha256,
    reference.wasm.manifest_sha256,
    `${path}: authenticated manifest`,
  );
  assert.deepEqual(exact(value), exact(reference), `${path}: portable digests`);
  assert.equal(value.wasm.resource_bounds.result, false);
  assert.equal(value.wasm.resource_bounds.error, null);
  assert.equal(value.wasm.resource_bounds.short_output_unchanged, true);
  assert.notEqual(value.wasm.cancellation.exit_code, 0);
  assert.equal(value.wasm.cancellation.recovery_stdout, "42");
  assert.equal(
    value.wasm.package_load_test.status,
    value.wasm.package_load_test.exit_code === 0 ? "passed" : "failed",
  );
  assert.match(value.wasm.package_load_test.stdout_sha256, /^[0-9a-f]{64}$/);
  assert.equal(value.wasm.package_load_test.status, "passed");
  assert.equal(
    value.wasm.package_load_test.test_patch_commit,
    value.repository.package_smoke_overlay.test_patch_commit,
  );
  assert.equal(
    value.wasm.package_load_test.test_source_sha256,
    value.repository.package_smoke_overlay.patched_test_sha256,
  );
  if (value.host.platform === "win32") {
    assert.equal(value.standalone.status, "unavailable");
    assert.match(value.standalone.reason, /POSIX static-archive/);
  } else if (value.host.platform === "darwin") {
    assert.equal(value.standalone.status, "unavailable");
    assert.match(value.standalone.reason, /GNU\/ELF/);
  } else {
    assert.equal(value.standalone.status, "available");
    for (const row of value.wasm.cantor) {
      const standalone = value.standalone.value.standalone.rows.find(
        (candidate) => candidate.genus === row.genus,
      );
      assert(standalone, `${path}: genus-${row.genus} standalone row`);
      assert.equal(row.standalone_rolling_digest, standalone.digest);
    }
  }
}

const rows = receipts.map(({ path, value }) => ({
  receipt: path,
  host: value.host.hostname,
  platform: `${value.host.platform}-${value.host.architecture}`,
  wasm_load_ms: value.wasm.load_ms,
  wasm_rss_bytes: value.wasm.process_rss_bytes,
  wasm_cantor: value.wasm.cantor.map((row) => ({
    genus: row.genus,
    median_ms: row.wall_ms.median,
    standalone_median_ms:
      value.standalone.status === "available"
        ? value.standalone.value.standalone.rows.find(
            (candidate) => candidate.genus === row.genus,
          ).standalone_core_median_ns / 1e6
        : null,
    wasm_to_standalone_ratio: row.wasm_to_standalone_ratio ?? null,
  })),
  wasm_kummer_project_4096_ms: value.wasm.kummer_project.wall_ms.median,
  artifact_verify_ms: value.wasm.package_verification.elapsed_ms,
  cancellation_ms: value.wasm.cancellation.elapsed_ms,
  recovery_ms: value.wasm.cancellation.recovery_elapsed_ms,
}));

process.stdout.write(
  `${JSON.stringify({ exact: exact(reference), rows }, null, 2)}\n`,
);
