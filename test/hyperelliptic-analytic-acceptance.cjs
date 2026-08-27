// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  IMPLEMENTATION_BASE,
  ROOT,
  SCHEMA,
  acceptanceGates,
  bracketedPariRows,
  sourceIdentity,
  validateReceipt,
} = require("../bench/hyperelliptic/analytic-acceptance/contract.cjs");

function differential(genus) {
  return {
    genus,
    passed: true,
    universal_algorithm: "native-arb-universal-central-taylor-weights",
    direct_algorithm: "native-arb-central-mellin-weights",
    tolerance: "0.000001",
    arithmetic_balls_rigorous: true,
    universal_refinement_stable: true,
    direct_refinement_stable: true,
    universal_raw_derivatives: Array.from({ length: 5 }, () => ["1", "0"]),
    direct_raw_derivatives: Array.from({ length: 5 }, () => ["1", "0"]),
  };
}

function inheritedGates() {
  return {
    prepared_central_value_over_fresh_plan: { passed: true, speedup: 25 },
    genus2_native_derivatives_over_inverse_mellin: {
      passed: true,
      minimum_speedup: 9,
    },
    genus3_native_derivatives_over_inverse_mellin: {
      passed: true,
      minimum_speedup: 6,
    },
  };
}

function fixture() {
  const stage = "lfunction_init_order4_64bit_fresh_plan_coefficients_warm_100";
  const competitive = {
    schema: "sagejs.hyperelliptic/analytic-competitive-benchmark-v1",
    commit: "f".repeat(40),
    sagejs: { rows: [{ stage, median_ms: 1500 }] },
    pari: { rows: [{ stage, samples_ms: [995, 1000, 1005] }] },
    performance_gates: inheritedGates(),
  };
  const before = {
    pari: { rows: [{ stage, samples_ms: [990, 1000, 1010] }] },
  };
  const bracketed = bracketedPariRows([before, competitive]);
  const evidence = {
    direct_arb_differentials: [differential(2), differential(3)],
    cold_table_timing: {
      observations: 1,
      cold_table_construction_ms: 2000,
      cold_table_cache_miss_call_ms: 2010,
      warm_table_cache_hit_call_ms: 10,
      direct_one_worker_call_ms: 80,
      direct_bounded4_call_ms: 30,
    },
    family_scan: {
      exact_coefficients: true,
      exact_signs: true,
      sequential_parallel_equal: true,
      candidate_count: 3,
      numerical_candidate_count: 3,
      all_candidates_cpu_refined: true,
      all_numerical_candidates_cpu_refined: true,
      all_status_ok: true,
      records: 3,
      coefficient_digest_sha256: "a".repeat(64),
      coefficient_rows: [
        { discriminant: -3, sha256: "b".repeat(64) },
        { discriminant: 1, sha256: "c".repeat(64) },
        { discriminant: 5, sha256: "d".repeat(64) },
      ],
      rows: [-3, 1, 5].map((discriminant) => ({
        status: "ok",
        discriminant,
        conductor: 7 * Math.abs(discriminant) ** 4,
        expected_conductor: 7 * Math.abs(discriminant) ** 4,
        root_number: 1,
        expected_root_number: 1,
        candidate: true,
        screening_backend: "cpu",
        refinement_stable: true,
        arithmetic_balls_rigorous: true,
      })),
    },
  };
  const gates = acceptanceGates(competitive, bracketed, evidence, 64);
  return {
    schema: SCHEMA,
    mode: "acceptance",
    source: {
      commit: competitive.commit,
      status: "",
      implementation_base_commit: IMPLEMENTATION_BASE,
      implementation_base_is_ancestor: true,
      build_receipt_preflight: { current: true },
      inputs: sourceIdentity(ROOT),
    },
    configuration: {
      samples: 5,
      precision_bits: 64,
      lseries_only: true,
      maximum_wall_seconds: 1200,
    },
    host: {
      declared_host: "bench-1",
      platform: "linux",
      architecture: "x64",
      node: "v22.22.2",
      noise_policy: { passed: true },
    },
    provisioning: { pari: { version: "2.18.1 (alpha)" } },
    pari_bracket: { order: "PARI-Sage.js-PARI", rows: bracketed },
    competitive,
    evidence,
    gates,
    harness_wall_ms: 1000,
  };
}

test("Phase-9 acceptance contract uses true fresh misses and bracketed PARI", () => {
  const receipt = fixture();
  assert.equal(receipt.gates.small_conductor_initialization.sagejs_over_pari, 1.5);
  assert.equal(receipt.gates.small_conductor_initialization.passed, true);
  assert.equal(receipt.pari_bracket.rows[0].samples_ms.length, 6);
  assert.deepEqual(validateReceipt(receipt, { currentSources: sourceIdentity(ROOT) }), {
    passed: true,
    failures: [],
  });
});

test("acceptance validation rejects cache relabeling and source drift", () => {
  const cacheRelabeled = fixture();
  cacheRelabeled.gates.small_conductor_initialization.passed = false;
  let result = validateReceipt(cacheRelabeled);
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((value) => value.includes("small_conductor")));

  const drifted = fixture();
  drifted.source.inputs[0] = { ...drifted.source.inputs[0], sha256: "0".repeat(64) };
  result = validateReceipt(drifted, { currentSources: sourceIdentity(ROOT) });
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((value) => value.includes("source-current")));
});

test("diagnostic receipts cannot masquerade as five-sample bench-1 acceptance", () => {
  const receipt = fixture();
  receipt.configuration.samples = 1;
  let result = validateReceipt(receipt);
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((value) => value.includes("five Sage.js samples")));

  receipt.mode = "diagnostic";
  result = validateReceipt(receipt);
  assert.equal(result.passed, true);
});
