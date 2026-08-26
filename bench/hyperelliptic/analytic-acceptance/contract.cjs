"use strict";

const { createHash } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const ROOT = resolve(__dirname, "../../..");
const SCHEMA = "sagejs.hyperelliptic/analytic-phase9-acceptance-v1";
const FAILURE_SCHEMA = "sagejs.hyperelliptic/analytic-phase9-failure-v1";
const IMPLEMENTATION_BASE = "b30ecbfae62760d44a24438f3fb7f99bedfe1eee";
const PINNED_GP = "/home/user/.local/pari-2.18.1-alpha/bin/gp";
const PINNED_PARi_SOURCE_SHA256 =
  "f046c222db92e3f02120e2f4e74a5b0e1e6faaa248ff90f10c51b2daa0b3599c";

const SOURCE_PATHS = Object.freeze([
  "agents/hyperelliptic-magma-pari-performance-plan.md",
  "bench/hyperelliptic/benchmark-analytic-competitive.cjs",
  "bench/hyperelliptic/analytic-acceptance/README.md",
  "bench/hyperelliptic/analytic-acceptance/contract.cjs",
  "bench/hyperelliptic/analytic-acceptance/evidence.cjs",
  "bench/hyperelliptic/analytic-acceptance/run.cjs",
  "bench/hyperelliptic/analytic-acceptance/validate-receipt.cjs",
  "packages/flint/src/addon.c",
  "packages/flint/src/elliptic_lfunction.c",
  "packages/flint/src/elliptic_lfunction.h",
  "src/lib/sagejs/hyperelliptic_curves/family_cpu.py",
  "src/lib/sagejs/hyperelliptic_curves/frobenius.py",
  "src/lib/sagejs/hyperelliptic_curves/global_arithmetic.py",
  "src/lib/sagejs/hyperelliptic_curves/lseries.py",
  "src/lib/sagejs/hyperelliptic_curves/twists.py",
  "test/hyperelliptic-analytic-acceptance.cjs",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceIdentity(root = ROOT) {
  return SOURCE_PATHS.map((path) => {
    const filename = resolve(root, path);
    if (!existsSync(filename)) throw new Error(`required source is missing: ${path}`);
    const contents = readFileSync(filename);
    return { path, bytes: contents.length, sha256: sha256(contents) };
  });
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].map(Number).sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(values) {
  const center = median(values);
  if (center === null) return null;
  const numbers = values.map(Number);
  return {
    samples_ms: numbers.map((value) => Number(value.toFixed(3))),
    minimum_ms: Number(Math.min(...numbers).toFixed(3)),
    median_ms: Number(center.toFixed(3)),
    maximum_ms: Number(Math.max(...numbers).toFixed(3)),
    mad_ms: Number(
      median(numbers.map((value) => Math.abs(value - center))).toFixed(3),
    ),
  };
}

function row(rows, stage) {
  return rows?.find((value) => value.stage === stage) ?? null;
}

function finitePositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function ratio(numerator, denominator) {
  if (!finitePositive(denominator) || !Number.isFinite(Number(numerator))) return null;
  return Number((Number(numerator) / Number(denominator)).toFixed(6));
}

function amortizationCount(construction, direct, warm) {
  if (!finitePositive(construction) || !finitePositive(direct) || !finitePositive(warm)) {
    return null;
  }
  if (Number(direct) <= Number(warm)) return null;
  return Math.ceil(Number(construction) / (Number(direct) - Number(warm)));
}

function bracketedPariRows(receipts) {
  const grouped = new Map();
  for (const receipt of receipts) {
    for (const value of receipt?.pari?.rows ?? []) {
      if (!grouped.has(value.stage)) grouped.set(value.stage, []);
      grouped.get(value.stage).push(...(value.samples_ms ?? []));
    }
  }
  return [...grouped].map(([stage, samples]) => ({
    system: "pari-gp",
    stage,
    ...summarize(samples),
    bracketed_resident_processes: receipts.length,
  }));
}

function acceptanceGates(competitive, bracketedRows, evidence, precisionBits) {
  const sageRows = competitive?.sagejs?.rows ?? [];
  const stage = `lfunction_init_order4_${precisionBits}bit_fresh_plan_coefficients_warm_100`;
  const sageInitBatch = row(sageRows, stage)?.median_ms ?? null;
  const pariInitBatch = row(bracketedRows, stage)?.median_ms ?? null;
  const sagePerItem = sageInitBatch === null ? null : sageInitBatch / 100;
  const pariPerItem = pariInitBatch === null ? null : pariInitBatch / 100;
  const initializationRatio = ratio(sagePerItem, pariPerItem);
  const inherited = competitive?.performance_gates ?? {};
  const directPassed =
    Array.isArray(evidence?.direct_arb_differentials) &&
    evidence.direct_arb_differentials.length === 2 &&
    evidence.direct_arb_differentials.every((value) => value.passed === true);
  const family = evidence?.family_scan ?? {};
  const cold = evidence?.cold_table_timing ?? {};
  const coldAmortization = {
    observations: cold.observations ?? null,
    cold_table_construction_ms: cold.cold_table_construction_ms ?? null,
    cold_table_cache_miss_call_ms: cold.cold_table_cache_miss_call_ms ?? null,
    warm_universal_evaluation_ms: cold.warm_table_cache_hit_call_ms ?? null,
    direct_one_worker_ms: cold.direct_one_worker_call_ms ?? null,
    direct_bounded4_ms: cold.direct_bounded4_call_ms ?? null,
    calls_to_amortize_against_one_worker: amortizationCount(
      cold.cold_table_construction_ms,
      cold.direct_one_worker_call_ms,
      cold.warm_table_cache_hit_call_ms,
    ),
    calls_to_amortize_against_bounded4: amortizationCount(
      cold.cold_table_construction_ms,
      cold.direct_bounded4_call_ms,
      cold.warm_table_cache_hit_call_ms,
    ),
    exact_coefficients_prewarmed: true,
    single_observation_not_a_median: true,
    pass_fail_gate: false,
  };
  return {
    small_conductor_initialization: {
      sagejs_median_ms_per_item: sagePerItem,
      pari_median_ms_per_item: pariPerItem,
      sagejs_over_pari: initializationRatio,
      target_maximum_ratio: 2,
      passed: initializationRatio !== null && initializationRatio <= 2,
      comparison:
        "true-fresh-isolated-plan-misses-vs-bracketed-resident-single-thread-pari",
      cache_contract:
        "coefficients and the curve-independent universal table are warm; every Sage.js item has a new prefix-owned plan state and LFunctionInit",
    },
    prepared_central_value_over_fresh_plan:
      inherited.prepared_central_value_over_fresh_plan ?? null,
    genus2_native_derivatives_over_inverse_mellin:
      inherited.genus2_native_derivatives_over_inverse_mellin ?? null,
    genus3_native_derivatives_over_inverse_mellin:
      inherited.genus3_native_derivatives_over_inverse_mellin ?? null,
    universal_table_cold_amortization: coldAmortization,
    direct_arb_differential: {
      models: evidence?.direct_arb_differentials?.length ?? 0,
      passed: directPassed,
    },
    family_exact_coefficient_sign_and_cpu_refinement: {
      exact_coefficients: family.exact_coefficients === true,
      exact_signs: family.exact_signs === true,
      sequential_parallel_equal: family.sequential_parallel_equal === true,
      candidates: family.candidate_count ?? null,
      numerical_candidates: family.numerical_candidate_count ?? null,
      all_candidates_cpu_refined:
        family.all_numerical_candidates_cpu_refined === true,
      passed:
        family.exact_coefficients === true &&
        family.exact_signs === true &&
        family.sequential_parallel_equal === true &&
        family.all_status_ok === true &&
        family.candidate_count > 0 &&
        family.numerical_candidate_count > 0 &&
        family.all_numerical_candidates_cpu_refined === true,
    },
  };
}

function validateReceipt(receipt, { currentSources = null } = {}) {
  const failures = [];
  const requireValue = (condition, message) => {
    if (!condition) failures.push(message);
  };
  requireValue(receipt?.schema === SCHEMA, `schema must be ${SCHEMA}`);
  requireValue(
    receipt?.source?.implementation_base_commit === IMPLEMENTATION_BASE,
    "implementation base commit is not the audited Phase-9 base",
  );
  requireValue(receipt?.source?.implementation_base_is_ancestor === true,
    "implementation base is not an ancestor of the measured source");
  requireValue(receipt?.source?.status === "", "measured source worktree was dirty");
  requireValue(receipt?.source?.build_receipt_preflight?.current === true,
    "the measured build was not current before timing");
  requireValue(
    receipt?.competitive?.schema ===
      "sagejs.hyperelliptic/analytic-competitive-benchmark-v1",
    "embedded competitive receipt is missing or has the wrong schema",
  );
  requireValue(
    receipt?.competitive?.commit === receipt?.source?.commit,
    "embedded competitive receipt used a different source commit",
  );
  requireValue(receipt?.configuration?.precision_bits === 64,
    "acceptance precision must be 64 bits");
  requireValue(receipt?.configuration?.lseries_only === true,
    "the competitive run must be L-series only");
  requireValue(receipt?.pari_bracket?.order === "PARI-Sage.js-PARI",
    "resident PARI measurements do not bracket Sage.js");
  requireValue((receipt?.pari_bracket?.rows ?? []).length > 0,
    "bracketed PARI rows are missing");
  for (const name of [
    "small_conductor_initialization",
    "prepared_central_value_over_fresh_plan",
    "genus2_native_derivatives_over_inverse_mellin",
    "genus3_native_derivatives_over_inverse_mellin",
    "direct_arb_differential",
    "family_exact_coefficient_sign_and_cpu_refinement",
  ]) {
    requireValue(receipt?.gates?.[name]?.passed === true, `${name} did not pass`);
  }
  const cold = receipt?.gates?.universal_table_cold_amortization;
  requireValue(cold?.observations === 1 && cold?.single_observation_not_a_median === true,
    "cold universal-table timing is not an explicit single cold observation");
  requireValue(finitePositive(cold?.cold_table_construction_ms),
    "cold universal-table construction is not separately timed");
  requireValue(finitePositive(cold?.cold_table_cache_miss_call_ms),
    "the full cold universal-table call is not separately timed");
  requireValue(finitePositive(cold?.warm_universal_evaluation_ms),
    "warm universal-table evaluation is not separately timed");
  requireValue(finitePositive(cold?.direct_one_worker_ms),
    "the direct one-worker Arb fallback is not separately timed");
  requireValue(
    cold?.calls_to_amortize_against_one_worker === null ||
      Number.isInteger(cold?.calls_to_amortize_against_one_worker),
    "cold-table amortization count is malformed",
  );
  for (const differential of receipt?.evidence?.direct_arb_differentials ?? []) {
    requireValue(differential.arithmetic_balls_rigorous === true,
      `genus-${differential.genus} direct differential lost Arb arithmetic rigor`);
    requireValue(differential.universal_refinement_stable === true,
      `genus-${differential.genus} universal path did not refine stably`);
    requireValue(differential.direct_refinement_stable === true,
      `genus-${differential.genus} direct path did not refine stably`);
    requireValue(Array.isArray(differential.universal_raw_derivatives) &&
      differential.universal_raw_derivatives.length === 5,
    `genus-${differential.genus} universal decimal oracle is incomplete`);
    requireValue(Array.isArray(differential.direct_raw_derivatives) &&
      differential.direct_raw_derivatives.length === 5,
    `genus-${differential.genus} direct decimal oracle is incomplete`);
    requireValue(
      differential.universal_algorithm ===
        "native-arb-universal-central-taylor-weights",
      `genus-${differential.genus} universal algorithm label is wrong`,
    );
    requireValue(
      differential.direct_algorithm === "native-arb-central-mellin-weights",
      `genus-${differential.genus} direct algorithm label is wrong`,
    );
    if (
      Array.isArray(differential.universal_raw_derivatives) &&
      Array.isArray(differential.direct_raw_derivatives) &&
      differential.universal_raw_derivatives.length ===
        differential.direct_raw_derivatives.length
    ) {
      let maximum = 0;
      for (let index = 0; index < differential.universal_raw_derivatives.length; index += 1) {
        const left = differential.universal_raw_derivatives[index].map(Number);
        const right = differential.direct_raw_derivatives[index].map(Number);
        const difference = Math.hypot(left[0] - right[0], left[1] - right[1]);
        const scale = Math.max(1, Math.hypot(right[0], right[1]));
        maximum = Math.max(maximum, difference / scale);
      }
      requireValue(maximum <= Number(differential.tolerance),
        `genus-${differential.genus} stored decimal oracles exceed tolerance`);
    }
  }
  const family = receipt?.evidence?.family_scan;
  requireValue(family?.records > 0, "family evidence contains no records");
  requireValue(Array.isArray(family?.rows) && family.rows.length === family.records,
    "family exact rows are incomplete");
  requireValue(family?.all_status_ok === true, "family scan contains a non-ok row");
  requireValue(
    family?.numerical_candidate_count > 0 &&
      family?.all_numerical_candidates_cpu_refined === true,
    "family scan did not CPU-refine every numerical candidate",
  );
  requireValue(
    family?.rows?.every(
      (value) =>
        value.status === "ok" &&
        value.conductor === value.expected_conductor &&
        value.root_number === value.expected_root_number &&
        value.candidate === true &&
        value.screening_backend === "cpu" &&
        value.refinement_stable === true &&
        value.arithmetic_balls_rigorous === true,
    ) === true,
    "family exact/sign/refinement row evidence is inconsistent",
  );
  requireValue(typeof family?.coefficient_digest_sha256 === "string" &&
    /^[0-9a-f]{64}$/u.test(family.coefficient_digest_sha256),
  "family coefficient digest is missing");
  requireValue(
    Array.isArray(family?.coefficient_rows) &&
      family.coefficient_rows.length === family.records &&
      family.coefficient_rows.every((value) => /^[0-9a-f]{64}$/u.test(value.sha256)),
    "per-discriminant exact coefficient digests are incomplete",
  );
  if (receipt?.mode === "acceptance") {
    requireValue(receipt?.configuration?.samples >= 5,
      "an acceptance receipt requires at least five Sage.js samples");
    requireValue(receipt?.host?.declared_host === "bench-1",
      "acceptance was not explicitly run on bench-1");
    requireValue(receipt?.host?.platform === "linux" && receipt?.host?.architecture === "x64",
      "acceptance host is not Linux x64");
    requireValue(receipt?.host?.node === "v22.22.2",
      "acceptance Node version is not the pinned v22.22.2");
    requireValue(receipt?.host?.noise_policy?.passed === true,
      "bench-1 noise preflight did not pass");
    requireValue(receipt?.provisioning?.pari?.version === "2.18.1 (alpha)",
      "PARI version is not the pinned 2.18.1 alpha");
    requireValue(
      Number(receipt?.harness_wall_ms) <=
        Number(receipt?.configuration?.maximum_wall_seconds) * 1000,
      "acceptance exceeded its total wall-time bound",
    );
  }
  if (currentSources !== null) {
    const recorded = new Map(
      (receipt?.source?.inputs ?? []).map((value) => [value.path, value]),
    );
    for (const value of currentSources) {
      const prior = recorded.get(value.path);
      requireValue(prior?.sha256 === value.sha256 && prior?.bytes === value.bytes,
        `source-current digest mismatch: ${value.path}`);
    }
    requireValue(recorded.size === currentSources.length,
      "receipt and current source input sets differ");
  }
  return { passed: failures.length === 0, failures };
}

function validateFailureReceipt(receipt, { currentSources = null } = {}) {
  const failures = [];
  const requireValue = (condition, message) => {
    if (!condition) failures.push(message);
  };
  requireValue(receipt?.schema === FAILURE_SCHEMA, `schema must be ${FAILURE_SCHEMA}`);
  requireValue(receipt?.status === "failed", "failure receipt status must be failed");
  requireValue(receipt?.mode === "acceptance", "failure receipt must record acceptance mode");
  requireValue(receipt?.source?.status === "", "measured source worktree was dirty");
  requireValue(
    receipt?.source?.implementation_base_commit === IMPLEMENTATION_BASE,
    "implementation base commit is not the audited Phase-9 base",
  );
  requireValue(
    receipt?.source?.implementation_base_is_ancestor === true,
    "implementation base is not an ancestor of the measured source",
  );
  requireValue(
    receipt?.source?.build_receipt_preflight?.current === true,
    "the measured build was not current before timing",
  );
  requireValue(
    receipt?.host?.declared_host === "bench-1" &&
      receipt?.host?.platform === "linux" &&
      receipt?.host?.architecture === "x64" &&
      receipt?.host?.node === "v22.22.2",
    "failure receipt did not use the pinned bench-1 runtime",
  );
  requireValue(
    receipt?.host?.noise_policy?.passed === true,
    "failure receipt host did not satisfy the noise policy",
  );
  requireValue(
    receipt?.provisioning?.pari?.version === "2.18.1 (alpha)",
    "failure receipt did not use pinned PARI 2.18.1-alpha",
  );
  requireValue(
    Number.isInteger(receipt?.configuration?.samples) &&
      receipt.configuration.samples >= 5,
    "failure receipt must retain the five-sample acceptance contract",
  );
  requireValue(
    receipt?.configuration?.precision_bits === 64 &&
      receipt?.configuration?.lseries_only === true,
    "failure receipt changed the 64-bit L-series-only contract",
  );
  requireValue(
    typeof receipt?.failure?.name === "string" && receipt.failure.name.length > 0,
    "failure receipt error name is missing",
  );
  requireValue(
    typeof receipt?.failure?.message === "string" && receipt.failure.message.length > 0,
    "failure receipt error message is missing",
  );
  requireValue(
    typeof receipt?.failure?.stack === "string" && receipt.failure.stack.length > 0,
    "failure receipt error stack is missing",
  );
  requireValue(
    Number.isFinite(receipt?.harness_wall_ms) && receipt.harness_wall_ms > 0,
    "failure receipt wall time is missing",
  );
  if (currentSources !== null) {
    const recorded = new Map(
      (receipt?.source?.inputs ?? []).map((value) => [value.path, value]),
    );
    for (const value of currentSources) {
      const prior = recorded.get(value.path);
      requireValue(
        prior?.sha256 === value.sha256 && prior?.bytes === value.bytes,
        `source-current digest mismatch: ${value.path}`,
      );
    }
    requireValue(
      recorded.size === currentSources.length,
      "receipt and current source input sets differ",
    );
  }
  return { passed: failures.length === 0, failures };
}

module.exports = {
  FAILURE_SCHEMA,
  IMPLEMENTATION_BASE,
  PINNED_GP,
  PINNED_PARi_SOURCE_SHA256,
  ROOT,
  SCHEMA,
  SOURCE_PATHS,
  acceptanceGates,
  bracketedPariRows,
  median,
  sha256,
  sourceIdentity,
  summarize,
  validateFailureReceipt,
  validateReceipt,
};
