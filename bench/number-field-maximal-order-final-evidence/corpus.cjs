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
    local_primes: [],
    profiles: ["final"],
    inner_iterations: 1,
    provenance: entry.provenance,
    limits: {},
    corpus_tier: entry.tier,
    corpus_tags: entry.tags,
  };
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
  SELECTIONS,
  SYSTEM_BOUNDARIES,
  buildEvidenceManifest,
  loadCorpus,
  selectCases,
};
