"use strict";

const {
  FINGERPRINT,
  canonicalJson,
  deepFreeze,
  exactKeys,
  fail,
  fingerprint,
  nonemptyString,
  safeInteger,
  uniqueStrings,
} = require("./common.cjs");
const { evaluate, normalizeFeatures } = require("./selector.cjs");

const BENCHMARK_SCHEMA = "sagejs.math-dispatch/benchmark-v1";

function finiteNonnegative(filename, value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(filename, `${label} must be a finite nonnegative number`);
  }
  return value;
}

function finitePositive(filename, value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail(filename, `${label} must be a finite positive number`);
  }
  return value;
}

function validateBenchmarkReport(report, registry, options = {}) {
  const filename = options.filename || "<benchmark report>";
  exactKeys(filename, report, [
    "case", "correctness", "dispatch", "host", "measurements", "native_math",
    "schema", "source", "suite_version", "timed_scope",
  ], "report");
  if (report.schema !== BENCHMARK_SCHEMA) fail(filename, "unsupported benchmark schema");
  nonemptyString(filename, report.suite_version, "suite_version");
  exactKeys(filename, report.source, ["commit", "dirty"], "source");
  if (!/^[a-f0-9]{40}$/.test(report.source.commit) || report.source.dirty !== false) {
    fail(filename, "source must identify a clean 40-hex Git commit");
  }
  if (options.commit && report.source.commit !== options.commit) fail(filename, "source commit is stale");
  exactKeys(filename, report.dispatch, [
    "declaration_generation", "family_fingerprint", "profile_set_fingerprint",
  ], "dispatch");
  safeInteger(filename, report.dispatch.declaration_generation, "dispatch.declaration_generation", 1);
  for (const key of ["family_fingerprint", "profile_set_fingerprint"]) {
    if (!FINGERPRINT.test(report.dispatch[key])) fail(filename, `dispatch.${key} must be sha256 hex`);
  }
  exactKeys(filename, report.case, [
    "candidate", "family", "features", "grid", "operation", "representation",
    "semantic_options",
  ], "case");
  const family = registry.families.get(report.case.family);
  if (!family) fail(filename, `unknown family ${report.case.family}`);
  const operation = family.operations.get(report.case.operation);
  if (!operation) fail(filename, `unknown operation ${report.case.family}.${report.case.operation}`);
  if (report.dispatch.family_fingerprint !== family.fingerprint) fail(filename, "family declaration is stale");
  if (report.dispatch.profile_set_fingerprint !== registry.identity.profile_set_fingerprint) {
    fail(filename, "profile set is stale");
  }
  if (report.dispatch.declaration_generation !== family.document.generation) {
    fail(filename, "declaration generation is stale");
  }
  exactKeys(filename, report.native_math, [
    "build_fingerprint", "capabilities", "libraries",
  ], "native_math");
  if (!FINGERPRINT.test(report.native_math.build_fingerprint)) {
    fail(filename, "native_math.build_fingerprint must be sha256 hex");
  }
  if (options.buildFingerprint && report.native_math.build_fingerprint !== options.buildFingerprint) {
    fail(filename, "native mathematics build is stale");
  }
  const capabilities = uniqueStrings(filename, report.native_math.capabilities, "native_math.capabilities");
  if (report.native_math.libraries === null || typeof report.native_math.libraries !== "object" ||
      Array.isArray(report.native_math.libraries) ||
      Object.values(report.native_math.libraries).some((item) => typeof item !== "string")) {
    fail(filename, "native_math.libraries must be a string map");
  }
  const features = normalizeFeatures(family, operation, report.case.features);
  const algorithm = operation.algorithms.find((item) => item.id === report.case.candidate);
  if (!algorithm) fail(filename, `unknown candidate ${report.case.candidate}`);
  const observed = new Set(capabilities);
  const capabilityResults = new Map(family.document.capabilities.map((capability) => [
    capability.id,
    Boolean(evaluate(capability.requires, features, observed)),
  ]));
  for (const required of algorithm.requires) {
    if (!capabilityResults.get(required)) {
      fail(filename, `candidate ${algorithm.id} does not satisfy capability ${required}`);
    }
  }
  if (!Boolean(evaluate(algorithm.when, features, observed))) {
    fail(filename, `candidate ${algorithm.id} does not satisfy its hard predicate`);
  }
  const canonicalRepresentations = family.document.representations.filter((representation) =>
    Boolean(evaluate(representation.when, features, observed)));
  if (canonicalRepresentations.length !== 1) {
    fail(filename, `features and capabilities match ${canonicalRepresentations.length} canonical representations`);
  }
  if (!family.representations.has(report.case.representation)) {
    fail(filename, `unknown representation ${report.case.representation}`);
  }
  if (canonicalRepresentations[0].id !== report.case.representation) {
    fail(filename,
      `representation ${report.case.representation} is not canonical; expected ${canonicalRepresentations[0].id}`);
  }
  if (!new Set(["training", "validation"]).has(report.case.grid)) {
    fail(filename, "case.grid must be training or validation");
  }
  if (report.case.semantic_options === null || typeof report.case.semantic_options !== "object" ||
      Array.isArray(report.case.semantic_options)) fail(filename, "case.semantic_options must be an object");
  exactKeys(filename, report.host, [
    "arch", "blas_provider", "cpu_family", "logical_cpus", "memory_bytes",
    "os", "physical_cpus", "threading",
  ], "host");
  for (const key of ["arch", "blas_provider", "cpu_family", "os", "threading"]) {
    nonemptyString(filename, report.host[key], `host.${key}`);
  }
  for (const key of ["logical_cpus", "memory_bytes", "physical_cpus"]) {
    safeInteger(filename, report.host[key], `host.${key}`, 1);
  }
  exactKeys(filename, report.timed_scope, [
    "allocation", "cleanup", "conversion", "lazy_load_excluded", "result_construction",
  ], "timed_scope");
  if (Object.values(report.timed_scope).some((item) => typeof item !== "boolean")) {
    fail(filename, "timed_scope fields must be boolean");
  }
  if (!report.timed_scope.lazy_load_excluded) fail(filename, "warm timing includes first lazy load");
  if (algorithm.conversions.length > 0 && !report.timed_scope.conversion) {
    fail(filename, "timing hides a declared representation conversion");
  }
  if (!report.timed_scope.allocation || !report.timed_scope.result_construction ||
      !report.timed_scope.cleanup) fail(filename, "timing excludes allocation, result construction, or cleanup");
  exactKeys(filename, report.measurements, [
    "cold_ms", "initialization_ms", "peak_memory_bytes", "warm",
  ], "measurements");
  finiteNonnegative(filename, report.measurements.cold_ms, "measurements.cold_ms");
  finiteNonnegative(filename, report.measurements.initialization_ms, "measurements.initialization_ms");
  safeInteger(filename, report.measurements.peak_memory_bytes, "measurements.peak_memory_bytes", 0);
  exactKeys(filename, report.measurements.warm, [
    "dispersion", "outliers", "samples", "statistic", "timeout_ms", "values_ms", "warmups",
  ], "measurements.warm");
  const warm = report.measurements.warm;
  safeInteger(filename, warm.warmups, "measurements.warm.warmups", 1);
  safeInteger(filename, warm.samples, "measurements.warm.samples", 3);
  if (warm.statistic !== "median") fail(filename, "warm statistic must be median");
  finiteNonnegative(filename, warm.dispersion, "measurements.warm.dispersion");
  if (warm.dispersion >= 1) fail(filename, "warm dispersion must be less than one");
  if (warm.dispersion > (options.maximumDispersion ?? 0.2)) fail(filename, "warm samples are excessively noisy");
  safeInteger(filename, warm.outliers, "measurements.warm.outliers", 0);
  finitePositive(filename, warm.timeout_ms, "measurements.warm.timeout_ms");
  if (!Array.isArray(warm.values_ms) || warm.values_ms.length !== warm.samples) {
    fail(filename, "warm.values_ms length must equal warm.samples");
  }
  warm.values_ms.forEach((value, index) => finitePositive(filename, value, `warm.values_ms[${index}]`));
  exactKeys(filename, report.correctness, ["digest", "matched", "oracle"], "correctness");
  nonemptyString(filename, report.correctness.digest, "correctness.digest");
  nonemptyString(filename, report.correctness.oracle, "correctness.oracle");
  if (report.correctness.matched !== true) fail(filename, "correctness oracle did not match");
  const normalized = deepFreeze({
    ...report,
    case: deepFreeze({ ...report.case, features }),
    native_math: deepFreeze({ ...report.native_math, capabilities }),
  });
  return deepFreeze({ report: normalized, fingerprint: fingerprint(normalized) });
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function proposeIntegerThreshold(evidence, options) {
  const {
    family, operation, feature, specialized, fallback,
    minimumSpeedup = 1.15,
  } = options;
  if (!Number.isFinite(minimumSpeedup) || minimumSpeedup <= 1) {
    throw new Error("minimumSpeedup must be greater than one");
  }
  const relevant = evidence.reports.map((item) => item.report).filter((report) =>
    report.case.family === family && report.case.operation === operation &&
    [specialized, fallback].includes(report.case.candidate));
  if (relevant.length === 0) throw new Error("no comparable benchmark evidence was provided");
  function comparisonIdentity(report) {
    const features = { ...report.case.features };
    delete features[feature];
    return canonicalJson({
      suite_version: report.suite_version,
      source: report.source,
      dispatch: report.dispatch,
      native_math: report.native_math,
      host: report.host,
      representation: report.case.representation,
      semantic_options: report.case.semantic_options,
      timed_scope: report.timed_scope,
      measurement_protocol: {
        warmups: report.measurements.warm.warmups,
        samples: report.measurements.warm.samples,
        statistic: report.measurements.warm.statistic,
        timeout_ms: report.measurements.warm.timeout_ms,
      },
      features,
      oracle: report.correctness.oracle,
    });
  }
  const identity = comparisonIdentity(relevant[0]);
  for (const report of relevant.slice(1)) {
    if (comparisonIdentity(report) !== identity) {
      throw new Error(
        "benchmark evidence is incomparable outside the threshold feature, grid, and candidate",
      );
    }
  }
  function exactInteger(value) {
    if (Number.isSafeInteger(value)) return BigInt(value);
    if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
    throw new Error(`threshold feature ${feature} must be an exact nonnegative integer`);
  }
  function jsonInteger(value) {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
  }
  const grids = new Map([["training", new Map()], ["validation", new Map()]]);
  for (const report of relevant) {
    const value = exactInteger(report.case.features[feature]);
    const entries = grids.get(report.case.grid);
    if (!entries.has(value)) entries.set(value, new Map());
    const candidates = entries.get(value);
    if (candidates.has(report.case.candidate)) {
      throw new Error(`duplicate ${report.case.grid} evidence for ${report.case.candidate} at ${feature}=${value}`);
    }
    candidates.set(report.case.candidate, {
      timing: median(report.measurements.warm.values_ms),
      dispersion: report.measurements.warm.dispersion,
      report,
    });
  }
  for (const [grid, entries] of grids) {
    if (entries.size < 2) throw new Error(`${grid} grid requires at least two feature values`);
    for (const [value, candidates] of entries) {
      for (const candidate of [specialized, fallback]) {
        if (!candidates.has(candidate)) throw new Error(`${grid} grid is missing ${candidate} at ${feature}=${value}`);
      }
      if (candidates.get(specialized).report.correctness.digest !==
          candidates.get(fallback).report.correctness.digest) {
        throw new Error(`${grid} candidate correctness digests differ at ${feature}=${value}`);
      }
    }
  }
  function robustSpeedup(timings, winner, loser) {
    const winnerTiming = timings.get(winner);
    const loserTiming = timings.get(loser);
    return (loserTiming.timing * (1 - loserTiming.dispersion)) /
      (winnerTiming.timing * (1 + winnerTiming.dispersion));
  }
  const trainingValues = [...grids.get("training").keys()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const candidates = trainingValues.filter((threshold) => {
    if (!trainingValues.includes(threshold - 1n)) return false;
    return trainingValues.every((value) => value < threshold
      ? robustSpeedup(grids.get("training").get(value), fallback, specialized) >= minimumSpeedup
      : robustSpeedup(grids.get("training").get(value), specialized, fallback) >= minimumSpeedup);
  });
  const threshold = candidates[0];
  if (threshold === undefined) throw new Error("training evidence supports no adjacent robust threshold");
  for (const [grid, entries] of grids) {
    if (!entries.has(threshold) || !entries.has(threshold - 1n)) {
      throw new Error(`${grid} grid does not cover both sides adjacent to threshold ${threshold}`);
    }
    for (const [value, timings] of entries) {
      const winner = value < threshold ? fallback : specialized;
      const loser = value < threshold ? specialized : fallback;
      if (robustSpeedup(timings, winner, loser) < minimumSpeedup) {
        throw new Error(`${grid} grid does not validate robust ${winner} win at ${feature}=${value}`);
      }
    }
  }
  return deepFreeze({
    schema: "sagejs.math-dispatch/threshold-proposal-v1",
    authority_unchanged: true,
    family,
    operation,
    feature,
    comparison: { specialized, fallback },
    threshold: { operator: "ge", value: jsonInteger(threshold) },
    minimum_speedup: minimumSpeedup,
    confidence_model: "reported-relative-dispersion-bounds",
    evidence_fingerprint: evidence.fingerprint,
    evidence: Object.fromEntries([...grids].map(([grid, entries]) => [
      grid,
      [...entries].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([value, timings]) => ({
        value: jsonInteger(value),
        specialized_ms: timings.get(specialized).timing,
        fallback_ms: timings.get(fallback).timing,
        speedup: timings.get(fallback).timing / timings.get(specialized).timing,
        robust_specialized_speedup: robustSpeedup(timings, specialized, fallback),
        robust_fallback_speedup: robustSpeedup(timings, fallback, specialized),
      })),
    ])),
  });
}

function ingestBenchmarkReports(reports, registry, options = {}) {
  if (!Array.isArray(reports) || reports.length === 0) throw new Error("benchmark evidence must be nonempty");
  const accepted = reports.map((report, index) => validateBenchmarkReport(report, registry, {
    ...options,
    filename: options.filenames?.[index] || `<benchmark report ${index + 1}>`,
  }));
  if (options.expectedCandidates) {
    const present = new Set(accepted.map((item) => item.report.case.candidate));
    for (const candidate of options.expectedCandidates) {
      if (!present.has(candidate)) throw new Error(`benchmark evidence is missing candidate ${candidate}`);
    }
  }
  return deepFreeze({
    schema: "sagejs.math-dispatch/evidence-set-v1",
    reports: Object.freeze(accepted),
    fingerprint: fingerprint(accepted.map((item) => item.fingerprint).sort()),
  });
}

module.exports = {
  BENCHMARK_SCHEMA,
  ingestBenchmarkReports,
  proposeIntegerThreshold,
  validateBenchmarkReport,
};
