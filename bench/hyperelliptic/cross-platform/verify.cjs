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
  assert.equal(
    value.repository.commit,
    reference.repository.commit,
    `${path}: repository commit`,
  );
  assert.match(
    value.repository.harness_sha256,
    /^[0-9a-f]{64}$/,
    `${path}: runner digest`,
  );
  assert.equal(
    value.repository.harness_sha256,
    reference.repository.harness_sha256,
    `${path}: runner digest`,
  );
  assert.deepEqual(
    value.repository.source_sha256,
    reference.repository.source_sha256,
    `${path}: mathematical source hashes`,
  );
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
  for (const name of [
    "cantor_add_batch",
    "cantor_scalar_batch",
    "cantor_scalar_bits",
    "cantor_progression_batch",
    "cantor_scalar_repeat",
  ]) {
    assert.equal(
      value.configuration[name],
      reference.configuration[name],
      `${path}: ${name}`,
    );
  }
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
  assert.match(
    value.modes.dynamic.cantor.capability,
    /^\(False,/,
    `${path}: forced dynamic Cantor capability`,
  );
  assert.match(
    value.modes.native.cantor.capability,
    /^\(True,/,
    `${path}: required native Cantor capability`,
  );
  assert.equal(
    value.modes.dynamic.cantor.tiny_exact_sha256,
    value.modes.native.cantor.tiny_exact_sha256,
    `${path}: tiny Cantor dynamic/native digest`,
  );
  assert.deepEqual(
    value.modes.dynamic.cantor.cases.map((entry) => ({
      add: entry.add_exact_sha256,
      scalar: entry.scalar_exact_sha256,
      progression: entry.progression_exact_sha256,
    })),
    value.modes.native.cantor.cases.map((entry) => ({
      add: entry.add_exact_sha256,
      scalar: entry.scalar_exact_sha256,
      progression: entry.progression_exact_sha256,
    })),
    `${path}: Cantor dynamic/native digests`,
  );
  for (const mode of ["dynamic", "native"]) {
    for (const entry of value.modes[mode].cantor.cases) {
      assert.equal(
        entry.add_exact_sha256,
        entry.add_materialized_exact_sha256,
        `${path}: genus-${entry.genus} ${mode} retained/materialized add digest`,
      );
      assert.equal(
        entry.scalar_exact_sha256,
        entry.scalar_materialized_exact_sha256,
        `${path}: genus-${entry.genus} ${mode} retained/materialized scalar digest`,
      );
      assert.equal(
        entry.progression_exact_sha256,
        entry.progression_retained_exact_sha256,
        `${path}: genus-${entry.genus} ${mode} packed/retained progression digest`,
      );
      assert.equal(
        entry.progression_exact_sha256,
        entry.progression_materialized_exact_sha256,
        `${path}: genus-${entry.genus} ${mode} packed/materialized progression digest`,
      );
      if (mode === "native") {
        assert.equal(
          entry.materialization_comparison,
          "retained-packed-versus-forced-polynomials",
          `${path}: genus-${entry.genus} native materialization comparison`,
        );
        assert.notEqual(entry.add_materialized_batch, null);
        assert.notEqual(entry.scalar_materialized_batch, null);
        assert.notEqual(entry.progression_materialized_batch, null);
        assert.equal(
          entry.representation_state,
          `(0, 1000, 0, ${entry.scalar_batch_items}, 0, 1000)`,
          `${path}: genus-${entry.genus} native representation retention`,
        );
      } else {
        assert.equal(
          entry.materialization_comparison,
          "not-applicable-reference-is-already-materialized",
          `${path}: genus-${entry.genus} dynamic materialization capability`,
        );
        assert.equal(entry.add_materialized_batch, null);
        assert.equal(entry.scalar_materialized_batch, null);
        assert.equal(entry.progression_materialized_batch, null);
      }
    }
  }
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
  cantor: value.modes.native.cantor.cases.map((nativeCase, index) => {
    const dynamicCase = value.modes.dynamic.cantor.cases[index];
    return {
      genus: nativeCase.genus,
      add_1000_dynamic_ms: dynamicCase.add_batch.arithmetic_ms.median,
      add_1000_native_ms: nativeCase.add_batch.arithmetic_ms.median,
      add_speedup:
        dynamicCase.add_batch.arithmetic_ms.median /
        nativeCase.add_batch.arithmetic_ms.median,
      add_1000_materialized_dynamic_ms:
        dynamicCase.add_materialized_batch?.arithmetic_ms.median ?? null,
      add_1000_materialized_native_ms:
        nativeCase.add_materialized_batch.arithmetic_ms.median,
      native_add_materialization_overhead:
        nativeCase.add_materialized_batch.arithmetic_ms.median /
        nativeCase.add_batch.arithmetic_ms.median,
      scalar_batch_items: nativeCase.scalar_batch_items,
      scalar_dynamic_ms: dynamicCase.scalar_batch.arithmetic_ms.median,
      scalar_native_ms: nativeCase.scalar_batch.arithmetic_ms.median,
      scalar_speedup:
        dynamicCase.scalar_batch.arithmetic_ms.median /
        nativeCase.scalar_batch.arithmetic_ms.median,
      scalar_materialized_dynamic_ms:
        dynamicCase.scalar_materialized_batch?.arithmetic_ms.median ?? null,
      scalar_materialized_native_ms:
        nativeCase.scalar_materialized_batch.arithmetic_ms.median,
      native_scalar_materialization_overhead:
        nativeCase.scalar_materialized_batch.arithmetic_ms.median /
        nativeCase.scalar_batch.arithmetic_ms.median,
      progression_1000_dynamic_ms:
        dynamicCase.progression_batch.arithmetic_ms.median,
      progression_1000_native_ms:
        nativeCase.progression_batch.arithmetic_ms.median,
      progression_speedup:
        dynamicCase.progression_batch.arithmetic_ms.median /
        nativeCase.progression_batch.arithmetic_ms.median,
      progression_1000_retained_dynamic_ms:
        dynamicCase.progression_retained_batch.arithmetic_ms.median,
      progression_1000_retained_native_ms:
        nativeCase.progression_retained_batch.arithmetic_ms.median,
      progression_1000_materialized_dynamic_ms:
        dynamicCase.progression_materialized_batch?.arithmetic_ms.median ??
        null,
      progression_1000_materialized_native_ms:
        nativeCase.progression_materialized_batch.arithmetic_ms.median,
      native_materialization_overhead:
        nativeCase.progression_materialized_batch.arithmetic_ms.median /
        nativeCase.progression_batch.arithmetic_ms.median,
    };
  }),
}));

process.stdout.write(`${JSON.stringify({ exact: reference.cross_mode_exact, rows }, null, 2)}\n`);
