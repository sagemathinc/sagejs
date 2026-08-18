"use strict";

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const { polynomialDigest } = require("../../tools/number-field-maximal-order/exact.cjs");
const {
  digest,
  validateManifest,
} = require("../../tools/number-field-maximal-order/runner.cjs");

const ROOT = resolve(__dirname, "../..");
const DEFAULT_CORPUS = resolve(
  ROOT,
  "test/fixtures/number-field-maximal-order-corpus.json",
);

const IMPLEMENTATION_FAMILIES = Object.freeze({
  "pari-sage": {
    members: ["pari", "sage"],
    independence: "shared PARI maximal-order implementation",
  },
  "hecke-oscar": {
    members: ["hecke", "oscar"],
    independence: "Oscar exposes Hecke's maximal-order implementation",
  },
  magma: {
    members: ["magma"],
    independence: "independent proprietary black-box oracle; optional",
  },
  sagejs: {
    members: ["sagejs", "sagejs-dynamic", "sagejs-native"],
    independence:
      "implementation under test; every accepted lattice is checked by the exact harness",
  },
});

const SYSTEM_BOUNDARIES = Object.freeze({
  sagejs: ["warm-public"],
  "sagejs-dynamic": ["dynamic-public"],
  "sagejs-native": ["native-public"],
  sage: ["warm-public"],
  pari: ["nfbasis", "nfinit"],
  hecke: ["core"],
  oscar: ["warm-public"],
  magma: ["warm-public"],
});

const SAGEJS_EVIDENCE_BOUNDARIES = Object.freeze([
  "warm-public",
  "traced-public-diagnostic",
  "native-kernel",
  "round2-local",
  "round4-local",
  "om-local",
  "sequential-public",
  "parallel-public",
]);

const SELECTIONS = Object.freeze({
  standard: (entry) => entry.tier === "standard",
  stress: (entry) => entry.tier === "stress",
  round4: (entry) => entry.tags.includes("pari-round4"),
  hecke: (entry) => entry.provenance.source === "hecke",
  equivalent: (entry) => entry.tags.includes("equivalent-generator"),
  quick: (entry) => ["motivating-degree-7", "pure-bad-generator-n8-c2pow32"].includes(entry.id),
  all: () => true,
});

function loadCorpus(path = DEFAULT_CORPUS) {
  const corpus = JSON.parse(readFileSync(path, "utf8"));
  if (corpus.schemaVersion !== 1 || !Array.isArray(corpus.cases)) {
    throw new Error(`invalid maximal-order corpus ${path}`);
  }
  if (corpus.summary?.caseCount !== corpus.cases.length) {
    throw new Error("maximal-order corpus summary does not account for every case");
  }
  const ids = new Set();
  for (const entry of corpus.cases) {
    if (ids.has(entry.id)) throw new Error(`duplicate corpus case ${entry.id}`);
    ids.add(entry.id);
    if (polynomialDigest(entry.polynomial.coefficients) !== entry.polynomial.digest) {
      throw new Error(`polynomial digest mismatch for ${entry.id}`);
    }
  }
  return corpus;
}

function selectCases(corpus, selection, explicitCaseIds = []) {
  const predicate = SELECTIONS[selection];
  if (!predicate) {
    throw new Error(
      `unknown selection ${selection}; expected ${Object.keys(SELECTIONS).join(", ")}`,
    );
  }
  const requested = new Set(explicitCaseIds);
  const selected = corpus.cases.filter(
    (entry) => predicate(entry) && (requested.size === 0 || requested.has(entry.id)),
  );
  if (requested.size) {
    const found = new Set(selected.map((entry) => entry.id));
    const missing = [...requested].filter((id) => !found.has(id));
    if (missing.length) {
      throw new Error(`unknown or out-of-selection cases: ${missing.join(", ")}`);
    }
  }
  if (!selected.length) throw new Error(`selection ${selection} contains no cases`);
  return selected;
}

function caseSpec(entry) {
  return {
    id: entry.id,
    label: entry.id,
    polynomial: { coefficients: entry.polynomial.coefficients },
    expected: {
      polynomial_discriminant: entry.equationDiscriminant,
      field_discriminant: entry.fieldDiscriminant,
      equation_order_index: entry.equationOrderIndex,
      canonical_basis_digest:
        entry.basis.state === "available" ? entry.basis.digest : null,
      certification: entry.certification,
    },
    local_factors: entry.localIndexFactors,
    local_primes: (entry.localIndexFactors || [])
      .filter((factor) => factor.state === "proven-prime")
      .map((factor) => String(factor.value))
      .filter((value) => BigInt(value) <= (1n << 64n) - 1n),
    native_kernel_eligible: entry.primeSupportCertified === true,
    profiles: ["final"],
    inner_iterations: 1,
    provenance: entry.provenance,
    limits: {},
    corpus_tier: entry.tier,
    corpus_tags: entry.tags,
  };
}

function binomial(n, k) {
  let answer = 1n;
  for (let index = 1; index <= k; index += 1) {
    answer = answer * BigInt(n - k + index) / BigInt(index);
  }
  return answer;
}

function translatePolynomial(coefficients, offset) {
  const shift = BigInt(offset);
  const result = Array.from({ length: coefficients.length }, () => 0n);
  for (let degree = 0; degree < coefficients.length; degree += 1) {
    const coefficient = BigInt(coefficients[degree]);
    for (let target = 0; target <= degree; target += 1) {
      result[target] += coefficient * binomial(degree, target) *
        shift ** BigInt(degree - target);
    }
  }
  return result.map(String);
}

function seededWords(seed) {
  let state = Number(seed) >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function buildRandomizedEvidenceManifest({
  seed = 20260818,
  count = 8,
  corpusPath = DEFAULT_CORPUS,
  systemBoundaries = SYSTEM_BOUNDARIES,
  timeoutMs = 5_000,
  warmups = 0,
  samples = 1,
} = {}) {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error("randomized seed must be nonnegative");
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error("randomized count must be positive");
  const corpus = loadCorpus(corpusPath);
  const parents = corpus.cases.filter((entry) =>
    entry.tier === "standard" && entry.basis.state === "available" &&
    entry.polynomial.coefficients.length <= 17,
  );
  if (!parents.length) throw new Error("corrected corpus has no randomized-generator parents");
  const next = seededWords(seed);
  const transformations = [];
  const cases = [];
  for (let index = 0; index < count; index += 1) {
    const parent = parents[next() % parents.length];
    let offset = Number(next() % 11) - 5;
    if (offset === 0) offset = 1;
    const coefficients = translatePolynomial(parent.polynomial.coefficients, offset);
    const caseId = `randomized-generator-${seed}-${index}-${parent.id}`;
    const entry = {
      ...parent,
      id: caseId,
      tier: "randomized",
      polynomial: {
        coefficients,
        digest: polynomialDigest(coefficients),
      },
      basis: { state: "unavailable", denominator: null, digest: null, numerator: null },
      provenance: {
        source: "sagejs-randomized-equivalent-generator",
        parent: parent.id,
        seed,
        ordinal: index,
        transformation: `x -> x + (${offset})`,
      },
      tags: [...new Set([...(parent.tags || []), "equivalent-generator", "randomized-generator"])],
    };
    cases.push(caseSpec(entry));
    transformations.push({
      case_id: caseId,
      parent_case_id: parent.id,
      offset,
      polynomial_digest: entry.polynomial.digest,
    });
  }
  const schedule = {
    schema: "sagejs.number-fields/randomized-generator-schedule-v1",
    seed,
    count,
    transformations,
  };
  const profile = {
    description: "Deterministic randomized equivalent-generator exactness evidence",
    case_ids: cases.map((entry) => entry.id),
    warmups,
    samples,
    timeout_ms: timeoutMs,
    systems: Object.fromEntries(
      Object.entries(systemBoundaries).map(([system, boundaries]) => [system, [...boundaries]]),
    ),
  };
  const policyIdentity = {
    schema_version: 1,
    selection: "randomized",
    corpus_manifest_digest: corpus.manifestDigest,
    profile,
    schedule,
    implementation_families: IMPLEMENTATION_FAMILIES,
  };
  const manifest = {
    schema_version: 1,
    id: `sagejs-number-field-maximal-order-randomized-${seed}-v1`,
    description: "Seeded translated-generator cases derived from the corrected corpus",
    corpus: "test/fixtures/number-field-maximal-order-corpus.json",
    implementation_families: IMPLEMENTATION_FAMILIES,
    defaults: { warmups, samples, memory_limit_mb: 4096 },
    system_limits: Object.fromEntries(Object.keys(SYSTEM_BOUNDARIES).map((system) => [
      system,
      { memory_limit_mb: system === "oscar" ? 6144 : 4096 },
    ])),
    profiles: { final: profile },
    cases,
    policy_digest: digest(policyIdentity),
    randomized_generator_schedule: schedule,
    corpus_metadata: {
      path: "test/fixtures/number-field-maximal-order-corpus.json",
      manifest_digest: corpus.manifestDigest,
      case_count: corpus.cases.length,
      selected_case_count: cases.length,
      selection: "randomized",
      seed,
    },
  };
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(`invalid randomized evidence manifest:\n- ${errors.join("\n- ")}`);
  return manifest;
}

function buildEvidenceManifest({
  selection = "standard",
  caseIds = [],
  corpusPath = DEFAULT_CORPUS,
  systemBoundaries = SYSTEM_BOUNDARIES,
  timeoutMs,
  warmups = 0,
  samples = 1,
} = {}) {
  const corpus = loadCorpus(corpusPath);
  const selectedEntries = selectCases(corpus, selection, caseIds);
  const cases = selectedEntries.map(caseSpec);
  const defaultTimeout = selection === "stress" ? 300_000 : 5_000;
  const profile = {
    description: `Final-plan ${selection} evidence from the corrected shared corpus`,
    case_ids: cases.map((entry) => entry.id),
    warmups,
    samples,
    timeout_ms: timeoutMs ?? defaultTimeout,
    systems: Object.fromEntries(
      Object.entries(systemBoundaries).map(([system, boundaries]) => [
        system,
        [...boundaries],
      ]),
    ),
  };
  const policyIdentity = {
    schema_version: 1,
    selection,
    corpus_manifest_digest: corpus.manifestDigest,
    case_ids: profile.case_ids,
    profile,
    implementation_families: IMPLEMENTATION_FAMILIES,
  };
  const manifest = {
    schema_version: 1,
    id: `sagejs-number-field-maximal-order-final-${selection}-v1`,
    description:
      "Final-plan runner generated from the corrected shared corpus; no polynomial list is duplicated.",
    corpus: "test/fixtures/number-field-maximal-order-corpus.json",
    implementation_families: IMPLEMENTATION_FAMILIES,
    defaults: { warmups, samples, memory_limit_mb: 4096 },
    system_limits: Object.fromEntries(
      Object.keys(SYSTEM_BOUNDARIES).map((system) => [system, {
        memory_limit_mb: system === "oscar" ? 6144 : 4096,
      }]),
    ),
    profiles: { final: profile },
    cases,
    policy_digest: digest(policyIdentity),
    corpus_metadata: {
      path: "test/fixtures/number-field-maximal-order-corpus.json",
      manifest_digest: corpus.manifestDigest,
      case_count: corpus.cases.length,
      standard_count: corpus.summary.standardCount,
      stress_count: corpus.summary.stressCount,
      selected_case_count: cases.length,
      selection,
    },
  };
  const errors = validateManifest(manifest);
  if (errors.length) {
    throw new Error(`invalid final evidence manifest:\n- ${errors.join("\n- ")}`);
  }
  return manifest;
}

module.exports = {
  DEFAULT_CORPUS,
  IMPLEMENTATION_FAMILIES,
  SAGEJS_EVIDENCE_BOUNDARIES,
  SELECTIONS,
  SYSTEM_BOUNDARIES,
  buildRandomizedEvidenceManifest,
  buildEvidenceManifest,
  loadCorpus,
  selectCases,
  translatePolynomial,
};
