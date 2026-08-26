// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const receipt = JSON.parse(
  readFileSync(
    join(
      root,
      "bench",
      "results",
      "number-field-maximal-order-parallel-public-final.json",
    ),
    "utf8",
  ),
);

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
}

test("the production-parallel public receipt is exact, fresh, and green", () => {
  assert.equal(
    receipt.schema,
    "sagejs.benchmark/number-field-maximal-order-parallel-public-final-v1",
  );
  assert.equal(receipt.case.cached_calls, false);
  assert.equal(receipt.result.exact_equivalent, true);
  assert.equal(receipt.result.fresh_sample_count_per_mode, 3);
  assert.equal(receipt.sequential.samples.length, 3);
  assert.equal(receipt.parallel.samples.length, 3);

  const sequentialMedian = median(
    receipt.sequential.samples.map((sample) => sample.total_micros),
  );
  const parallelMedian = median(
    receipt.parallel.samples.map((sample) => sample.total_micros),
  );
  assert.equal(sequentialMedian, receipt.sequential.median_total_micros);
  assert.equal(parallelMedian, receipt.parallel.median_total_micros);
  assert.equal(
    sequentialMedian / parallelMedian,
    receipt.result.median_speedup,
  );
  assert.ok(
    receipt.result.median_speedup >= receipt.result.minimum_required_speedup,
  );
  assert.ok(
    Math.max(...receipt.parallel.samples.map((sample) => sample.total_micros)) <
      Math.min(...receipt.sequential.samples.map((sample) => sample.total_micros)),
  );

  for (const sample of receipt.sequential.samples) {
    assert.equal(sample.mode, "sequential");
    assert.equal(sample.workers, 1);
    assert.equal(sample.gate_selected, false);
    assert.equal(sample.runtime_worker_capability, true);
  }
  for (const sample of receipt.parallel.samples) {
    assert.equal(sample.mode, "parallel");
    assert.equal(sample.workers, 4);
    assert.equal(sample.gate_selected, true);
    assert.equal(sample.gate_reason, "measured-native-fallback-crossover");
    assert.equal(sample.runtime_worker_capability, true);
    assert.ok(sample.peak_rss_bytes <= receipt.parallel.memory_budget_bytes);
  }
  assert.ok(receipt.parallel.useful_job_count >= 2);
  assert.equal(receipt.parallel.after_native_fallback, true);
  assert.ok(
    receipt.parallel.predicted_peak_rss_bytes <=
      receipt.parallel.memory_budget_bytes,
  );
  assert.equal(receipt.result.native_state, "unavailable");
  assert.equal(
    receipt.capability_and_cancellation.worker_module_available_in_every_sample,
    true,
  );
  assert.equal(
    receipt.capability_and_cancellation.randomized_completion_exact_equivalence,
    "passed",
  );
  assert.equal(
    receipt.capability_and_cancellation.native_first_boundary_test,
    "passed",
  );
  assert.ok(
    receipt.capability_and_cancellation
      .sleeping_process_sibling_cancelled_under_millis <= 3000,
  );

  for (const [path, expected] of Object.entries(
    receipt.measurement_source.scoped_source_identity,
  )) {
    assert.equal(sha256(path), expected, path);
  }
});
