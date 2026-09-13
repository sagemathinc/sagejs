"use strict";

// This verifies the experiment, not a statistical speedup threshold.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const prefix = process.argv[2];
assert.ok(prefix, "usage: node compare-blocks.cjs <raw-file-prefix>");
const order = ["A1", "B1", "B2", "A2"];
const baseline = "5b307b65fc350763abd52062e57f1c7a3666f925";
const candidate = "b0c532cfb9b0295ae444b536027231c403214bea";
const cases = ["root-brent", "bounded-minimum", "dense-solve-16", "fft-256", "describe-20000"];
const levels = ["none", "summary"];
const blocks = order.map((label) => {
  const bytes = readFileSync(resolve(`${prefix}-${label}.json`));
  return { label, sha256: createHash("sha256").update(bytes).digest("hex"), data: JSON.parse(bytes) };
});
const first = blocks[0].data;
for (const { label, data } of blocks) {
  assert.equal(data.schema, "sagejs.numerics.performance/v1");
  assert.equal(data.complete, true);
  assert.equal(data.source.repository.clean, true);
  assert.equal(data.source.repository.commit, label[0] === "A" ? baseline : candidate);
  assert.deepEqual(data.source.compiler_runtime, first.source.compiler_runtime);
  assert.equal(data.collector_sha256, first.collector_sha256);
  assert.equal(data.workload_sha256, first.workload_sha256);
  assert.deepEqual(data.policy, first.policy);
  assert.deepEqual(data.policy.cases, cases);
  assert.deepEqual(data.policy.levels, levels);
  assert.equal(data.policy.native_disabled, true);
  assert.equal(data.policy.samples, 7);
  assert.equal(data.policy.warmups, 3);
  for (const key of ["platform", "architecture", "cpu", "node"]) {
    assert.equal(data.host[key], first.host[key]);
  }
  assert.equal(data.records.length, cases.length * levels.length);
  const sameSource = blocks.find((block) => block.label[0] === label[0]).data;
  assert.deepEqual(data.source, sameSource.source);
  assert.deepEqual(data.build, sameSource.build);
  for (const row of data.records) {
    assert.equal(row.samples, 7);
    assert.equal(row.warmups, 3);
    assert.equal(row.durations_ms.length, 7);
    assert.ok(row.durations_ms.every((value) => Number.isFinite(value) && value > 0));
    assert.equal(row.median_ms, [...row.durations_ms].sort((a, b) => a - b)[3]);
  }
}
const rows = cases.flatMap((name) => levels.map((trace) => {
  const records = blocks.map(({ data }) => {
    const matches = data.records.filter((row) => row.case === name && row.trace === trace);
    assert.equal(matches.length, 1);
    return matches[0];
  });
  for (const row of records) assert.deepEqual(row.observation, records[0].observation);
  return { case: name, trace,
    baseline_block_medians_ms: [records[0].median_ms, records[3].median_ms],
    candidate_block_medians_ms: [records[1].median_ms, records[2].median_ms],
    observations_equal: true };
}));
console.log(JSON.stringify({
  schema: "sagejs.numerics.result-binding-block-check/v1",
  baseline, candidate, order, warmups: 3, samples_per_block: 7,
  checked_observations: 40,
  files: blocks.map(({ label, sha256 }) => ({ label, sha256 })),
  host: { ...first.host, load_average: undefined },
  host_load_at_block_start: blocks.map(({ data }) => data.host.load_average),
  rows,
}, null, 2));
