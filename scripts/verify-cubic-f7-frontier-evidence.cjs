#!/usr/bin/env node
"use strict";

// Read-only verification of retained evidence; never runs Sage.js or PARI.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const schema = require("../bench/class-unit-groups/complex-cubic-frontier-schema.cjs");
const runner = require("../bench/class-unit-groups/run-complex-cubic-frontier.cjs");
const { loadFrozenSurveyCorpus } = require(
  "../bench/class-unit-groups/load-complex-cubic-frontier-survey.cjs",
);

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = "bench/optimization-engine/cubic-frontier-f7f00552-evidence.json";
const CORPUS_MANIFEST = "bench/optimization-engine/complex-cubic-frontier-manifest-" +
  "sha256-6704032b98b7c2ec353ab5e5435fac62682ccd8d2fb14ab467e58aa1f655fbb6.json";
const COMMIT = "f7f00552dd4178993ceef4522cc2897622cdf2c6";
const BOUNDARIES = ["scalar-prepared", "fresh-complete"];
const SYSTEMS = ["sagejs", "pari"];

function verifyRetained(census, timing, corpus) {
  assert.equal(census.schema, schema.CENSUS_SCHEMA);
  assert.equal(timing.schema, schema.TIMING_SCHEMA);
  assert.deepEqual(census.source, timing.source);
  assert.deepEqual(census.corpus, timing.corpus);
  assert.deepEqual(census.tools, timing.tools);
  assert.deepEqual(census.systems, SYSTEMS);
  assert.equal(census.source.candidate_commit, COMMIT);
  assert.equal(census.source.clean, true);
  assert.equal(census.source.promotion_eligible, true);
  assert.equal(census.source.build_receipt.current, true);
  assert.equal(census.corpus.records_sha256, corpus.digests.records_sha256);
  assert.equal(census.corpus.labels_sha256, corpus.digests.labels_sha256);
  assert.equal(census.corpus.identity_sha256,
    schema.canonicalDigest(runner.portableCorpusIdentity(corpus)));
  runner.validateRuntimeWarmupAttestation(census.source.candidate_runtime_warmup,
    census.source.candidate_runtime_closure, corpus.records);
  // Recreates every census program and response from the frozen corpus and
  // observations, validates proof contracts/transcripts, and checks CPU topology.
  runner.validateCensusProcessTopology(census, corpus, census.tools);
  assert.deepEqual(census.summary.counts, { "native-pass": 1000 });
  for (const record of census.records) {
    const observed = record.observations.sagejs;
    assert.equal(observed.native_receipt_authenticated, true);
    assert.equal(observed.independent_exact_replay, true);
  }

  const protocol = timing.protocol;
  assert.equal(protocol.retained_rounds, 11);
  assert.equal(protocol.shard_count, 20);
  assert.equal(protocol.fields_per_shard, 50);
  assert.equal(protocol.excluded_warmup_fields, 12);
  assert.equal(protocol.minimum_retained_root_nanoseconds, "1200000000");
  assert.equal(protocol.root_source, "one-contiguous-monotonic-timer");
  assert.equal(protocol.phase_sum_used, false);
  assert.equal(protocol.digest_inside_root, false);
  assert.equal(protocol.process_scope,
    "one fresh pinned single-threaded process per system and round");
  assert.deepEqual(Object.keys(protocol.boundaries).sort(), [...BOUNDARIES].sort());
  assert.deepEqual(timing.host, census.host);
  assert.equal(timing.host.selected_logical_cpu, 0);
  assert.equal(timing.host.selected_cpu_model, "AMD EPYC 7B13");
  assert.deepEqual(timing.host.thread_environment, runner.THREAD_ENV);
  const environment = census.source.candidate_runtime_closure.direct_process_environment;
  assert.equal(environment.exact_integer_backend.requested, "auto");
  assert.equal(environment.exact_integer_backend.selected, "per-function-qualified-policy");
  assert.equal(environment.environment.SAGEJS_NATIVE_REQUIRED, "1");

  const shards = runner.shardRecords(corpus);
  const keys = new Set();
  assert.equal(timing.events.length, 880);
  for (const event of timing.events) {
    schema.validateTimingEvent(event);
    assert.equal(event.status, "ok");
    assert(event.round >= 0 && event.round < 11);
    assert(event.shard >= 0 && event.shard < 20);
    assert(SYSTEMS.includes(event.system));
    assert.equal(event.record_count, 50);
    assert.equal(event.order_position,
      runner.systemOrder(event.round, SYSTEMS).indexOf(event.system));
    const key = [event.round, event.system, event.boundary, event.shard].join(":");
    assert(!keys.has(key), `duplicate retained event ${key}`);
    keys.add(key);
    const answers = shards[event.shard].map((record) => event.system === "sagejs"
      ? { class_number: record.class_number }
      : { class_number: record.class_number,
          class_group_invariants: record.class_group_invariants });
    assert.equal(event.answer_digest, schema.canonicalDigest(answers));
  }

  assert.equal(timing.processes.length, 22);
  for (let index = 0; index < timing.processes.length; index += 1) {
    const process = timing.processes[index];
    const round = Math.floor(index / 2);
    assert.equal(process.round, round);
    assert.equal(process.system, runner.systemOrder(round, SYSTEMS)[index % 2]);
    assert.equal(process.mode, "timing");
    assert.equal(process.status, "ok");
    assert.equal(process.response_validation_error, null);
    assert.deepEqual(process.affinity_logical_cpus, [0]);
    assert.equal(process.timeout_seconds, 3600);
    assert.equal(process.runtime_closure_sha256,
      process.system === "sagejs" ? environment.sha256 : null);
    const program = process.system === "sagejs"
      ? runner.sageTimingSource(corpus, BOUNDARIES, round)
      : runner.pariTimingSource(corpus, BOUNDARIES, round);
    assert.equal(process.generated_program_sha256, schema.sha256(program));
    const started = BigInt(process.launched_monotonic_nanoseconds);
    const ended = BigInt(process.ended_monotonic_nanoseconds);
    assert.equal(ended - started, BigInt(process.process_wall_nanoseconds));
    assert(BigInt(process.launch_to_ready_nanoseconds) < ended - started);
    assert(ended - started < 3600_000_000_000n);
    if (index > 0) {
      assert(BigInt(timing.processes[index - 1].ended_monotonic_nanoseconds) <= started,
        "retained timing processes must not overlap");
    }
  }
  const metrics = runner.timingMetrics(timing.events, corpus, census);
  const candidate = runner.selectFrontierCandidate(corpus, census, timing.events);
  assert.deepEqual(timing.metrics, { ...metrics, frontier_candidate: candidate });
  assert.equal(candidate.label, "3.1.12716.2");
  return { metrics, candidate, shards };
}

function main() {
  const directory = process.argv[2];
  assert(directory, "usage: node scripts/verify-cubic-f7-frontier-evidence.cjs ASSET_DIRECTORY [--self-test]");
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST)));
  const assets = new Map();
  for (const asset of manifest.assets) {
    const compressed = fs.readFileSync(path.join(directory, asset.filename));
    assert.equal(compressed.length, asset.gzip_bytes);
    assert.equal(schema.sha256(compressed), asset.gzip_sha256);
    const raw = zlib.gunzipSync(compressed);
    assert.equal(raw.length, asset.bytes);
    assert.equal(schema.sha256(raw), asset.sha256);
    assets.set(asset.role, raw);
  }
  const census = JSON.parse(assets.get("census"));
  const timing = JSON.parse(assets.get("timing"));
  assert.equal(manifest.candidate_commit, census.source.candidate_commit);
  assert.equal(manifest.recorded_at, timing.recorded_at);
  assert.equal(manifest.full_runtime_closure_sha256,
    census.source.candidate_runtime_closure.sha256);
  assert.equal(manifest.direct_environment_closure_sha256,
    census.source.candidate_runtime_closure.direct_process_environment.sha256);
  assert.equal(timing.census.sha256, schema.sha256(assets.get("census")));
  const corpus = loadFrozenSurveyCorpus(path.join(ROOT, CORPUS_MANIFEST), directory);
  const result = verifyRetained(census, timing, corpus);

  const index = JSON.parse(assets.get("native-index"));
  const family = index.logicalSources["sagejs/number_fields/cubic_class_number_native.py"];
  assert.equal(family.cacheKey, census.source.candidate_runtime_closure.native_cache_key);
  const pack = index.packs.find((entry) => entry.packKey === family.packKey);
  assert(pack.kernels.includes(family.cacheKey));
  assert.equal(pack.sha256, census.source.candidate_runtime_closure.production_native_pack.sha256);
  // Inspect bytes only: do not execute the downloaded generated adapter.
  const adapter = assets.get("cubic-kernel-index").toString("utf8");
  const start = adapter.indexOf("function backend_certified_complex_cubic_class_group_v1(");
  assert(start >= 0);
  const dispatch = adapter.slice(start, adapter.indexOf("\n}\n", start));
  assert(dispatch.includes('if (nativeAddon === null) return "bigint";'));
  assert(dispatch.includes('if (integerBackendOverride !== "auto") return integerBackendOverride;'));
  assert(dispatch.endsWith('\n  return "fmpz";'));

  if (process.argv.includes("--self-test")) {
    for (const mutate of [
      (value) => { value.events[0].root_nanoseconds = "1199999999"; },
      (value) => { value.events[0].answer_digest = "0".repeat(64); },
      (value) => { value.events[0].order_position = 1; },
      (value) => { value.processes[1].affinity_logical_cpus = [1]; },
      (value) => { value.source.clean = false; },
      (value) => { value.metrics["scalar-prepared"].paired_shards.geometric_mean = 1; },
    ]) {
      const changed = structuredClone(timing);
      mutate(changed);
      assert.throws(() => verifyRetained(census, changed, corpus));
    }
  }
  const selected = corpus.records.find((record) => record.label === result.candidate.label);
  const shard = selected.selection.shard;
  const offset = result.shards[shard].findIndex((record) => record.label === selected.label);
  const targetRounds = Array.from({ length: 11 }, (_, round) => {
    const record = { round };
    for (const boundary of BOUNDARIES) {
      const values = Object.fromEntries(SYSTEMS.map((system) => [system, Number(
        timing.events.find((event) => event.round === round && event.shard === shard &&
          event.boundary === boundary && event.system === system).per_field_nanoseconds[offset],
      )]));
      record[boundary] = { ...values, ratio: values.sagejs / values.pari };
    }
    return record;
  });
  console.log(JSON.stringify({
    verified: true,
    mathematical_replay: "authenticated census attestation checked; not rerun by this verifier",
    backend: "fmpz, inferred from frozen generated dispatch under native-required auto",
    full_runtime_closure: census.source.candidate_runtime_closure.sha256,
    direct_environment_closure: census.source.candidate_runtime_closure.direct_process_environment.sha256,
    paired_shards: Object.fromEntries(BOUNDARIES.map((boundary) => [boundary,
      result.metrics[boundary].paired_shards])),
    frontier_candidate: result.candidate,
    target_diagnostic_nanoseconds_by_round: targetRounds,
  }, null, 2));
}

if (require.main === module) main();
module.exports = { verifyRetained };
