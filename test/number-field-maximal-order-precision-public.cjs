// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");

test(
  "precision degree 12 uses the compiled authenticated public path exactly",
  { timeout: 120_000 },
  () => {
    const run = spawnSync(
      process.execPath,
      [join(root, "bench", "number-field-maximal-order-precision-public.cjs")],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 110_000,
        maxBuffer: 50 * 1024 * 1024,
        env: {
          ...process.env,
          SAGEJS_NF_PRECISION_PUBLIC_SAMPLES: "1",
          SAGEJS_NF_PRECISION_PUBLIC_TRACE_CONTROL: "0",
        },
      },
    );
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const report = JSON.parse(run.stdout);
    assert.equal(
      report.schema,
      "sagejs.number-fields/maximal-order-precision-public-v1",
    );
    assert.equal(report.case.id, "hecke-precision-degree-12");
    assert.ok(Object.values(report.native_compiled).every((value) => value === true));
    assert.equal(report.default_public.verification.verified, true);
    assert.equal(report.default_public.raw_samples.length, 1);
    const sample = report.default_public.raw_samples[0];
    assert.equal(sample.certified, true);
    assert.equal(sample.calls.authenticated_field_analysis, 1);
    assert.equal(sample.calls.native_field_analysis_projection, 1);
    // The fused authenticated projection now materializes the accepted order
    // once instead of reconstructing it at each certification boundary.
    assert.equal(sample.calls.order_materialization, 1);
    assert.equal(sample.calls.global_certification, 1);
    assert.equal(sample.trace.enabled, false);
    assert.equal(report.trace_control, null);

    if (process.env.SAGEJS_NF_PRECISION_PUBLIC_ENFORCE_PERFORMANCE === "1") {
      assert.equal(
        report.default_public.below_five_second_gate,
        true,
        `public precision-12 took ${report.default_public.median_ms} ms`,
      );
    }
  },
);
