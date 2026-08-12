"use strict";

const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const test = require("node:test");

const {
  BENCHMARK_SCHEMA,
  ingestBenchmarkReports,
  proposeIntegerThreshold,
  validateBenchmarkReport,
} = require("../tools/math-dispatch/evidence.cjs");
const { loadRegistry } = require("../tools/math-dispatch/registry.cjs");

const root = resolve(__dirname, "..");
let registry;

test.before(async () => {
  registry = await loadRegistry({ root });
});

function report(overrides = {}) {
  const family = registry.families.get("dense-prime-matrix");
  return {
    schema: BENCHMARK_SCHEMA,
    suite_version: "dense-prime-crossover-v1",
    source: { commit: "1".repeat(40), dirty: false },
    dispatch: {
      declaration_generation: family.document.generation,
      family_fingerprint: family.fingerprint,
      profile_set_fingerprint: registry.identity.profile_set_fingerprint,
    },
    native_math: {
      build_fingerprint: "2".repeat(64),
      capabilities: ["fflas", "flint-prime-matrix"],
      libraries: { fflas: "2.5.0", flint: "3.6.0" },
    },
    host: {
      os: "linux",
      arch: "x64",
      cpu_family: "x86-avx2",
      physical_cpus: 8,
      logical_cpus: 16,
      memory_bytes: 34359738368,
      blas_provider: "openblas",
      threading: "single",
    },
    case: {
      family: "dense-prime-matrix",
      operation: "multiply",
      candidate: "fflas-float",
      grid: "training",
      representation: "packed-u64",
      features: {
        canonical_output: true,
        inner: 64,
        left_rows: 64,
        modulus: 97,
        right_columns: 64,
      },
      semantic_options: { canonical_output: true },
    },
    timed_scope: {
      conversion: true,
      allocation: true,
      result_construction: true,
      cleanup: true,
      lazy_load_excluded: true,
    },
    measurements: {
      cold_ms: 12.5,
      initialization_ms: 8.0,
      peak_memory_bytes: 1048576,
      warm: {
        warmups: 4,
        samples: 5,
        statistic: "median",
        values_ms: [1.0, 1.1, 1.05, 1.02, 1.03],
        dispersion: 0.05,
        outliers: 0,
        timeout_ms: 10000,
      },
    },
    correctness: {
      digest: "sha256:result",
      oracle: "FLINT differential",
      matched: true,
    },
    ...overrides,
  };
}

test("complete correctness-stamped evidence is accepted and fingerprinted", () => {
  const accepted = validateBenchmarkReport(report(), registry, {
    commit: "1".repeat(40),
    buildFingerprint: "2".repeat(64),
  });
  assert.ok(accepted.fingerprint.match(/^[a-f0-9]{64}$/));
  assert.equal(accepted.report.case.features.modulus, 97);
});

test("restricted fitting emits an inert reviewable adjacent threshold proposal", () => {
  const reports = [];
  for (const grid of ["training", "validation"]) {
    for (const value of [31, 32, 64]) {
      for (const candidate of ["fflas-float", "flint"]) {
        const base = report();
        reports.push(report({
          case: {
            ...base.case,
            grid,
            candidate,
            features: {
              ...base.case.features,
              inner: value,
              left_rows: value,
              right_columns: value,
            },
          },
          measurements: {
            ...base.measurements,
            warm: {
              ...base.measurements.warm,
              values_ms: Array(5).fill(
                candidate === "fflas-float"
                  ? (value >= 32 ? 1 : 2)
                  : (value >= 32 ? 1.5 : 1),
              ),
            },
          },
        }));
      }
    }
  }
  const evidence = ingestBenchmarkReports(reports, registry);
  const proposal = proposeIntegerThreshold(evidence, {
    family: "dense-prime-matrix",
    operation: "multiply",
    feature: "inner",
    specialized: "fflas-float",
    fallback: "flint",
  });
  assert.equal(proposal.threshold.value, 32);
  assert.equal(proposal.authority_unchanged, true);
  assert.equal(proposal.evidence.training.length, 3);
  assert.equal(proposal.evidence.validation.length, 3);
});

test("ingestion requires every requested comparison candidate", () => {
  assert.throws(() => ingestBenchmarkReports([report()], registry, {
    expectedCandidates: ["fflas-float", "flint"],
  }), /missing candidate flint/);
});

test("stale, dirty, incorrect, noisy, and cold-as-warm reports fail closed", () => {
  const cases = [
    [report({ source: { commit: "1".repeat(40), dirty: true } }), /clean/],
    [report({ correctness: { digest: "bad", oracle: "FLINT", matched: false } }), /did not match/],
    [report({ timed_scope: { conversion: true, allocation: true, result_construction: true, cleanup: true, lazy_load_excluded: false } }), /first lazy load/],
    [report({ dispatch: { ...report().dispatch, family_fingerprint: "3".repeat(64) } }), /stale/],
    [report({ measurements: { ...report().measurements, warm: { ...report().measurements.warm, dispersion: 0.5 } } }), /excessively noisy/],
  ];
  for (const [candidate, pattern] of cases) {
    assert.throws(() => validateBenchmarkReport(candidate, registry), pattern);
  }
});

test("declared conversion cost cannot be hidden", () => {
  const candidate = report({
    timed_scope: {
      conversion: false,
      allocation: true,
      result_construction: true,
      cleanup: true,
      lazy_load_excluded: true,
    },
  });
  assert.throws(() => validateBenchmarkReport(candidate, registry), /hides a declared representation conversion/);
});
