#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const paths = process.argv.slice(2).map((path) => resolve(path));
if (paths.length === 0) {
  process.stderr.write(
    "Usage: node bench/hyperelliptic/cross-platform/verify.cjs RECEIPT...\n",
  );
  process.exit(2);
}

const receipts = paths.map((path) => ({
  path,
  value: JSON.parse(readFileSync(path, "utf8")),
}));
const reference = receipts[0].value;

for (const { path, value } of receipts) {
  assert.equal(
    value.schema,
    "sagejs.hyperelliptic-cross-platform-acceptance.v1",
    `${path}: schema`,
  );
  assert.equal(value.repository.status, "", `${path}: repository is dirty`);
  assert.deepEqual(
    value.configuration.limits,
    reference.configuration.limits,
    `${path}: local-factor limits`,
  );
  assert.equal(
    value.configuration.kummer_batch,
    reference.configuration.kummer_batch,
    `${path}: Kummer batch size`,
  );
  assert.equal(
    value.configuration.repeat,
    reference.configuration.repeat,
    `${path}: repetition count`,
  );
  assert.deepEqual(
    value.cross_mode_exact,
    reference.cross_mode_exact,
    `${path}: cross-host exact digests`,
  );
  assert.deepEqual(
    value.modes.dynamic.local_factors.map((entry) =>
      entry.packed_exact_sha256
    ),
    value.modes.native.local_factors.map((entry) =>
      entry.packed_exact_sha256
    ),
    `${path}: local packed dynamic/native digests`,
  );
  assert.deepEqual(
    value.modes.dynamic.local_factors.map((entry) =>
      entry.coefficient_rows_exact_sha256
    ),
    value.modes.native.local_factors.map((entry) =>
      entry.coefficient_rows_exact_sha256
    ),
    `${path}: local coefficient dynamic/native digests`,
  );
  assert.equal(
    value.modes.dynamic.kummer.exact_result_sha256,
    value.modes.native.kummer.exact_result_sha256,
    `${path}: Kummer dynamic/native digest`,
  );
  assert.match(
    value.modes.dynamic.kummer.capability,
    /^\(False, 'dynamic'/,
    `${path}: forced dynamic capability`,
  );
  assert.match(
    value.modes.native.kummer.capability,
    /^\(True, 'native/,
    `${path}: required native capability`,
  );
}

const rows = receipts.map(({ path, value }) => ({
  receipt: path,
  host: value.host.hostname,
  platform: `${value.host.platform}-${value.host.architecture}`,
  commit: value.repository.commit,
  node: value.host.node,
  local_100k_packed_ms:
    value.modes.native.local_factors.find((entry) => entry.stop === 100_000)
      ?.packed.wall_ms.median ?? null,
  local_100k_coefficients_ms:
    value.modes.native.local_factors.find((entry) => entry.stop === 100_000)
      ?.coefficients.arithmetic_ms.median ?? null,
  kummer_dynamic_ms: value.modes.dynamic.kummer.doubling.arithmetic_ms.median,
  kummer_native_ms: value.modes.native.kummer.doubling.arithmetic_ms.median,
  kummer_native_speedup:
    value.modes.dynamic.kummer.doubling.arithmetic_ms.median /
    value.modes.native.kummer.doubling.arithmetic_ms.median,
  peak_rss_bytes: Math.max(
    value.modes.dynamic.process_end_rss_bytes,
    value.modes.native.process_end_rss_bytes,
  ),
}));

process.stdout.write(`${JSON.stringify({ exact: reference.cross_mode_exact, rows }, null, 2)}\n`);
