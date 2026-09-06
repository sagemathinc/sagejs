"use strict";

// Diagnostic equivalence census, NOT the authenticated public frontier census.
// Each closed invocation is fresh internally; outer buffers are reused. Exact
// ordinary-object replay and public timing remain separate qualification gates.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { gunzipSync } = require("node:zlib");

function main(argv) {
  assert.equal(argv.length, 3, "usage: BASELINE_INDEX CANDIDATE_INDEX FROZEN_SURVEY_GZIP");
  const bytes = gunzipSync(readFileSync(argv[2]));
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest, "81f94ea6e43023b75fd060b04072f0cf089d1bbc045fc7e5f0c97585396dd3fd");
  const fields = bytes.toString("utf8").trim().split("\n").map(JSON.parse);
  assert.equal(fields.length, 1012);
  const implementations = argv.slice(0, 2).map(filename => {
    const module = require(resolve(filename));
    assert.equal(module.nativeAvailable, true, "a native artifact is required");
    const kernel = module.certified_complex_cubic_class_group_v1;
    return { kernel, cacheKey: module.cacheKey, sourceHash: module.sourceHash,
      output: kernel.createIntegerBuffer(64, 256),
      buffers: [kernel.createUInt64Buffer(4161),
        ...[512, 4, 9, 16, 16, 144, 48, 109, 1, 1, 1].map(n => kernel.createIntegerBuffer(n, 64))] };
  });
  const observations = [];
  for (const field of fields) {
    const results = implementations.map(({ kernel, output, buffers }) => {
      try {
        const accepted = kernel(output, kernel.packIntegerBuffer(field.coefficients.map(BigInt)),
          ...buffers, 0, 5, 1048576, 3145728);
        return { accepted, output: output.toArray().map(String) };
      } catch (error) {
        return { error: error.message };
      }
    });
    assert.equal(results[0].accepted, results[1].accepted, field.label);
    assert.equal(results[0].error, results[1].error, field.label);
    if (results[0].accepted) {
      assert.deepEqual(results[0].output, results[1].output, field.label);
      const output = results[1].output;
      assert.equal(output[1], field.class_number, field.label);
      const invariants = output.slice(3, 3 + Number(output[2]));
      const ordered = values => [...values].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
      assert.deepEqual(ordered(invariants), ordered(field.class_group), field.label);
    } else if (!results[0].error) {
      assert.equal(results[0].output[63], results[1].output[63], field.label);
    }
    observations.push({ label: field.label, role: field.selection.role, ...results[1] });
    if (observations.length % 100 === 0) console.error(`compared ${observations.length}/${fields.length}`);
  }
  console.log(JSON.stringify({
    schema: "sagejs.diagnostic/cubic-native-candidate-equivalence-v1",
    public_census: false, independent_exact_replay: false, timing_claim: false,
    corpus_sha256: digest, node: process.version,
    implementations: implementations.map(({ cacheKey, sourceHash }) => ({ cacheKey, sourceHash })),
    effort: 5, memory_limit: 1048576, temporary_limit: 3145728,
    accepted: observations.filter(row => row.accepted).length,
    declined: observations.filter(row => row.accepted === false).length,
    errors: observations.filter(row => row.error).length,
    observations,
  }, null, 2));
}

if (require.main === module) main(process.argv.slice(2));
