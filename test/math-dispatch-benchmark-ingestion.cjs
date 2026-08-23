// sagejs-test-tier: unit
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
    [report({ measurements: { ...report().measurements, warm: { ...report().measurements.warm, values_ms: [0, 0, 0, 0, 0] } } }), /finite positive/],
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

test("evidence rejects unavailable candidates and noncanonical representations", () => {
  const unavailable = report({
    native_math: {
      ...report().native_math,
      capabilities: ["flint-prime-matrix"],
    },
  });
  assert.throws(() => validateBenchmarkReport(unavailable, registry), /does not satisfy capability/);
  const noncanonical = report({
    case: { ...report().case, representation: "flint-nmod-resource" },
  });
  assert.throws(() => validateBenchmarkReport(noncanonical, registry), /is not canonical/);
});

test("fitting rejects workload and host identity mixtures", () => {
  function evidenceWith(mutator) {
    const reports = [];
    for (const grid of ["training", "validation"]) {
      for (const value of [31, 32]) {
        for (const candidate of ["fflas-float", "flint"]) {
          const base = report();
          const item = report({
            case: {
              ...base.case,
              grid,
              candidate,
              features: { ...base.case.features, inner: value },
            },
          });
          reports.push(mutator(item, { grid, value, candidate }));
        }
      }
    }
    return ingestBenchmarkReports(reports, registry);
  }
  const workload = evidenceWith((item, context) => context.candidate === "flint"
    ? { ...item, case: { ...item.case, features: { ...item.case.features, left_rows: 1 } } }
    : item);
  assert.throws(() => proposeIntegerThreshold(workload, {
    family: "dense-prime-matrix", operation: "multiply", feature: "inner",
    specialized: "fflas-float", fallback: "flint",
  }), /incomparable/);
  const host = evidenceWith((item, context) => context.grid === "validation"
    ? { ...item, host: { ...item.host, os: "darwin", arch: "arm64" } }
    : item);
  assert.throws(() => proposeIntegerThreshold(host, {
    family: "dense-prime-matrix", operation: "multiply", feature: "inner",
    specialized: "fflas-float", fallback: "flint",
  }), /incomparable/);
  const protocol = evidenceWith((item, context) => context.candidate === "flint"
    ? {
        ...item,
        measurements: {
          ...item.measurements,
          warm: {
            ...item.measurements.warm,
            warmups: 100,
          },
        },
      }
    : item);
  assert.throws(() => proposeIntegerThreshold(protocol, {
    family: "dense-prime-matrix", operation: "multiply", feature: "inner",
    specialized: "fflas-float", fallback: "flint",
  }), /incomparable/);
});

test("fitting requires robust wins on both sides of the boundary", () => {
  function thresholdEvidence(timing) {
    const reports = [];
    for (const grid of ["training", "validation"]) {
      for (const value of [31, 32]) {
        for (const candidate of ["fflas-float", "flint"]) {
          const base = report();
          reports.push(report({
            case: {
              ...base.case,
              grid,
              candidate,
              features: { ...base.case.features, inner: value },
            },
            measurements: {
              ...base.measurements,
              warm: {
                ...base.measurements.warm,
                values_ms: Array(5).fill(timing({ value, candidate })),
              },
            },
          }));
        }
      }
    }
    return ingestBenchmarkReports(reports, registry);
  }

  const specializedAlwaysWins = thresholdEvidence(({ candidate }) =>
    candidate === "fflas-float" ? 1 : 2);
  assert.throws(() => proposeIntegerThreshold(specializedAlwaysWins, {
    family: "dense-prime-matrix", operation: "multiply", feature: "inner",
    specialized: "fflas-float", fallback: "flint",
  }), /supports no adjacent robust threshold/);

  const nearTie = thresholdEvidence(({ value, candidate }) => {
    const winner = value < 32 ? "flint" : "fflas-float";
    return candidate === winner ? 1 : 1.16;
  });
  assert.throws(() => proposeIntegerThreshold(nearTie, {
    family: "dense-prime-matrix", operation: "multiply", feature: "inner",
    specialized: "fflas-float", fallback: "flint",
  }), /supports no adjacent robust threshold/);
});
