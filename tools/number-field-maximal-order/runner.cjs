"use strict";

const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const { resolve } = require("node:path");
const { execFileSync } = require("node:child_process");
const { ROOT, createAdapters, localCapabilities } = require("./adapters.cjs");
const { canonicalBasis, polynomialDigest } = require("./exact.cjs");
const { verifyOracleResult } = require("./verify.cjs");

const TERMINAL_STATES = new Set([
  "ok",
  "invalid",
  "disagreement",
  "timeout",
  "crash",
  "unavailable",
  "unsupported",
]);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function validateManifest(manifest) {
  const errors = [];
  if (manifest.schema_version !== 1) errors.push("manifest schema_version must be 1");
  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) {
    errors.push("manifest must contain at least one case");
  }
  const ids = new Set();
  for (const caseSpec of manifest.cases || []) {
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(caseSpec.id || "")) {
      errors.push(`invalid case id ${JSON.stringify(caseSpec.id)}`);
    } else if (ids.has(caseSpec.id)) {
      errors.push(`duplicate case id ${caseSpec.id}`);
    }
    ids.add(caseSpec.id);
    const coefficients = caseSpec.polynomial?.coefficients;
    if (!Array.isArray(coefficients) || coefficients.length < 3) {
      errors.push(`${caseSpec.id}: polynomial needs low-to-high coefficients`);
      continue;
    }
    try {
      coefficients.forEach(BigInt);
      if (BigInt(coefficients.at(-1)) !== 1n) errors.push(`${caseSpec.id}: polynomial must be monic`);
    } catch {
      errors.push(`${caseSpec.id}: polynomial coefficients must be exact integers`);
    }
    for (const key of ["polynomial_discriminant", "field_discriminant", "equation_order_index"]) {
      try {
        BigInt(caseSpec.expected?.[key]);
      } catch {
        errors.push(`${caseSpec.id}: expected.${key} must be an exact integer string`);
      }
    }
    if (
      caseSpec.expected?.canonical_basis_digest &&
      !/^[0-9a-f]{64}$/.test(caseSpec.expected.canonical_basis_digest)
    ) {
      errors.push(`${caseSpec.id}: canonical basis digest must be SHA-256 hex`);
    }
    if (!Array.isArray(caseSpec.profiles) || caseSpec.profiles.length === 0) {
      errors.push(`${caseSpec.id}: at least one profile is required`);
    }
  }
  for (const [profile, definition] of Object.entries(manifest.profiles || {})) {
    if (!definition.systems || typeof definition.systems !== "object") {
      errors.push(`profile ${profile} must define systems and boundaries`);
    }
  }
  return errors;
}

function loadManifest(path) {
  const policy = JSON.parse(readFileSync(path, "utf8"));
  const policyErrors = [];
  if (policy.schema_version !== 1) policyErrors.push("policy schema_version must be 1");
  if (typeof policy.corpus !== "string" || !policy.corpus) {
    policyErrors.push("policy must name the shared corpus path");
  }
  if (!policy.profiles || typeof policy.profiles !== "object") {
    policyErrors.push("policy must define profiles");
  }
  for (const [name, profile] of Object.entries(policy.profiles || {})) {
    if (!Array.isArray(profile.case_ids) || profile.case_ids.length === 0) {
      policyErrors.push(`profile ${name} must select shared corpus case ids`);
    }
  }
  if (policyErrors.length) {
    throw new Error(`invalid maximal-order profiler policy:\n- ${policyErrors.join("\n- ")}`);
  }
  const corpusPath = resolve(ROOT, policy.corpus);
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
  if (corpus.schemaVersion !== 1 || !Array.isArray(corpus.cases)) {
    throw new Error(`invalid shared maximal-order corpus ${corpusPath}`);
  }
  const corpusCases = new Map(corpus.cases.map((entry) => [entry.id, entry]));
  const selected = new Map();
  for (const [profileName, profile] of Object.entries(policy.profiles)) {
    for (const id of profile.case_ids) {
      const entry = corpusCases.get(id);
      if (!entry) throw new Error(`profile ${profileName} selects missing corpus case ${id}`);
      if (!selected.has(id)) selected.set(id, { entry, profiles: [] });
      selected.get(id).profiles.push(profileName);
    }
  }
  const cases = [...selected].map(([id, selection]) => {
    const entry = selection.entry;
    if (polynomialDigest(entry.polynomial.coefficients) !== entry.polynomial.digest) {
      throw new Error(`shared corpus polynomial digest mismatch for ${id}`);
    }
    const override = policy.case_overrides?.[id] || {};
    return {
      id,
      label: id,
      polynomial: { coefficients: entry.polynomial.coefficients },
      expected: {
        polynomial_discriminant: entry.equationDiscriminant,
        field_discriminant: entry.fieldDiscriminant,
        equation_order_index: entry.equationOrderIndex,
        canonical_basis_digest: entry.basis.state === "available" ? entry.basis.digest : null,
        certification: entry.certification,
      },
      local_factors: entry.localIndexFactors,
      local_primes: [],
      profiles: selection.profiles,
      inner_iterations: override.inner_iterations || 1,
      provenance: entry.provenance,
      limits: override.limits || {},
      corpus_tier: entry.tier,
      corpus_tags: entry.tags,
    };
  });
  const manifest = {
    ...policy,
    cases,
    policy_digest: digest(policy),
    corpus_metadata: {
      path: policy.corpus,
      manifest_digest: corpus.manifestDigest,
      case_count: corpus.summary?.caseCount ?? corpus.cases.length,
      selected_case_count: cases.length,
    },
  };
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(`invalid maximal-order manifest:\n- ${errors.join("\n- ")}`);
  return manifest;
}

function gitOutput(args) {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function environmentRecord(config) {
  const cpus = os.cpus();
  const commit = gitOutput(["rev-parse", "HEAD"]);
  const dirty = Boolean(gitOutput(["status", "--porcelain"]));
  let nativeArtifactHash = config.nativeArtifactHash || process.env.SAGEJS_NATIVE_ARTIFACT_HASH || null;
  if (!nativeArtifactHash) {
    try {
      nativeArtifactHash = createHash("sha256")
        .update(readFileSync(resolve(ROOT, "packages/flint/build/Release/sagejs_flint.node")))
        .digest("hex");
    } catch {
      // Absence is an explicit capability state below.
    }
  }
  return {
    sagejs_commit: commit,
    sagejs_worktree_dirty: dirty,
    native_artifact_hash: nativeArtifactHash,
    native_artifact_note: nativeArtifactHash
      ? "SHA-256 of the loaded Sage.js FLINT addon"
      : "no loadable native artifact was present and no identity was supplied",
    host: os.hostname(),
    platform: process.platform,
    architecture: process.arch,
    operating_system: `${os.type()} ${os.release()}`,
    cpu_model: cpus[0]?.model || "unknown",
    logical_cpu_count: cpus.length,
    total_memory_bytes: os.totalmem(),
    node_version: process.version,
    warmup_policy: config.warmups,
    sample_policy: config.samples,
    memory_limit_mb: config.memoryMb,
  };
}

function makeColdRecord(record) {
  if (
    record.process_startup_ms === null ||
    record.process_startup_ms === undefined ||
    record.request_wall_ms === null ||
    record.request_wall_ms === undefined
  ) return null;
  return {
    case_id: record.case_id,
    system: record.system,
    implementation_family: record.implementation_family,
    boundary: "cold-application",
    status: record.status,
    version: record.version,
    source_revision: record.source_revision,
    samples: [{
      timing_ms: record.process_startup_ms + record.request_wall_ms,
      stages: {
        process_startup_and_lazy_loading: record.process_startup_ms,
        field_construction_through_result_protocol: record.request_wall_ms,
      },
    }],
    statistics: {
      median_ms: record.process_startup_ms + record.request_wall_ms,
      mad_ms: 0,
      minimum_ms: record.process_startup_ms + record.request_wall_ms,
      maximum_ms: record.process_startup_ms + record.request_wall_ms,
      sample_count: 1,
    },
    note: "Cold evidence uses the first request of a newly spawned persistent adapter.",
  };
}

function classifyDisagreements(records, manifest) {
  const cases = new Map(manifest.cases.map((entry) => [entry.id, entry]));
  for (const caseSpec of manifest.cases) {
    if (caseSpec.expected.canonical_basis_digest) continue;
    const eligible = records.filter(
      (record) => record.case_id === caseSpec.id && record.status === "ok" &&
        record.verification?.canonical_basis?.digest,
    );
    const familyDigests = new Map();
    for (const record of eligible) {
      const family = record.implementation_family;
      const value = record.verification.canonical_basis.digest;
      if (!familyDigests.has(family)) familyDigests.set(family, new Set());
      familyDigests.get(family).add(value);
    }
    const allDigests = new Set([...familyDigests.values()].flatMap((values) => [...values]));
    if (allDigests.size <= 1) continue;
    for (const record of eligible) {
      record.rejected_statistics = record.statistics;
      record.statistics = null;
      record.status = "disagreement";
      record.reason = "verified oracle lattices disagree; no majority result was selected";
      record.disagreement = Object.fromEntries(
        [...familyDigests].map(([family, values]) => [family, [...values].sort()]),
      );
    }
  }
  return cases;
}

async function runManifest(manifest, config = {}, injectedAdapters = null) {
  const manifestDigest = manifest.policy_digest || digest(manifest);
  const profileName = config.profile || "baseline";
  const profile = manifest.profiles[profileName];
  if (!profile) throw new Error(`unknown manifest profile ${profileName}`);
  const selectedSystems = config.systems?.length ? config.systems : Object.keys(profile.systems);
  const systemMemoryMb = Object.fromEntries(
    Object.entries(manifest.system_limits || {}).map(([system, limits]) => [
      system,
      config.memoryMb ?? limits.memory_limit_mb,
    ]),
  );
  Object.assign(systemMemoryMb, config.systemMemoryMb || {});
  const adapters = injectedAdapters || createAdapters({ ...config, systemMemoryMb });
  const records = [];
  const coldRecords = [];
  const coldRecorded = new Set();
  const caseEvidence = new Map();
  const requestedCases = new Set(config.caseIds || []);
  const cases = manifest.cases.filter(
    (caseSpec) => caseSpec.profiles.includes(profileName) &&
      (requestedCases.size === 0 || requestedCases.has(caseSpec.id)),
  );
  if (requestedCases.size && cases.length !== requestedCases.size) {
    const found = new Set(cases.map((caseSpec) => caseSpec.id));
    const missing = [...requestedCases].filter((id) => !found.has(id));
    throw new Error(`unknown or out-of-profile cases: ${missing.join(", ")}`);
  }
  try {
    for (const caseSpec of cases) {
      const polynomialHash = polynomialDigest(caseSpec.polynomial.coefficients);
      const certificateHash = digest(caseSpec.expected);
      caseEvidence.set(caseSpec.id, {
        polynomial_digest: polynomialHash,
        certificate_digest: certificateHash,
      });
      for (const system of selectedSystems) {
        const adapter = adapters[system];
        const boundaries = profile.systems[system] || [];
        if (!adapter) {
          for (const boundary of boundaries) {
            records.push({
              case_id: caseSpec.id,
              system,
              implementation_family: system,
              boundary,
              status: "unavailable",
              reason: `${system} adapter was not configured`,
            });
          }
          continue;
        }
        for (const boundary of boundaries) {
          const timeoutMs = Number(
            caseSpec.limits?.[system]?.timeout_ms ??
            caseSpec.limits?.default?.timeout_ms ??
            profile.timeout_ms ??
            config.timeoutMs ??
            60_000,
          );
          const record = await adapter.run(caseSpec, {
            boundary,
            timeoutMs,
            warmups: config.warmups ?? profile.warmups ?? manifest.defaults.warmups,
            samples: config.samples ?? profile.samples ?? manifest.defaults.samples,
            innerIterations: config.innerIterations,
            localPrimes: config.localPrimes,
          });
          if (!TERMINAL_STATES.has(record.status)) {
            record.reason = `adapter returned unknown state ${record.status}`;
            record.status = "crash";
          }
          record.polynomial_digest = polynomialHash;
          record.certificate_digest = certificateHash;
          record.timeout_ms = timeoutMs;
          record.memory_limit_mb = systemMemoryMb[system] ||
            config.memoryMb || manifest.defaults.memory_limit_mb;
          record.memory_limit_kind = system.startsWith("sagejs")
            ? "V8 old-space limit (75% of configured MiB); address-space limits conflict with V8 reservations"
            : process.platform === "linux"
              ? "process address-space limit via prlimit"
              : "requested policy; native address-space enforcement unavailable on this platform";
          if (record.status === "ok") {
            if (record.profiling_only) {
              record.verification = {
                verified: record.irreducible_verified === true,
                profiling_only: true,
                errors: record.irreducible_verified ? [] : ["irreducibility was not verified"],
              };
            } else {
              record.verification = verifyOracleResult(caseSpec, record);
            }
            if (!record.verification.verified) {
              record.rejected_statistics = record.statistics;
              record.statistics = null;
              record.status = "invalid";
              record.reason = "oracle result failed independent basis verification";
            }
          }
          records.push(record);
          if (config.includeCold && !coldRecorded.has(system)) {
            const cold = makeColdRecord(record);
            if (cold) coldRecords.push(cold);
            coldRecorded.add(system);
          }
        }
      }
    }
  } finally {
    for (const adapter of Object.values(adapters)) adapter.close?.();
  }
  classifyDisagreements(records, manifest);
  const stateCounts = Object.fromEntries(
    [...TERMINAL_STATES].map((state) => [state, records.filter((record) => record.status === state).length]),
  );
  return {
    schema: "https://sagejs.org/schemas/number-field-maximal-order-report-v1.json",
    schema_version: 1,
    generated_at: new Date().toISOString(),
    manifest_id: manifest.id,
    manifest_digest: manifestDigest,
    corpus: manifest.corpus_metadata || null,
    profile: profileName,
    environment: environmentRecord({
      ...config,
      warmups: config.warmups ?? profile.warmups ?? manifest.defaults.warmups,
      samples: config.samples ?? profile.samples ?? manifest.defaults.samples,
      memoryMb: config.memoryMb ?? manifest.defaults.memory_limit_mb,
    }),
    capabilities: localCapabilities(config),
    implementation_families: manifest.implementation_families,
    cases: cases.map((caseSpec) => ({
      id: caseSpec.id,
      polynomial_digest: caseEvidence.get(caseSpec.id).polynomial_digest,
      certificate_digest: caseEvidence.get(caseSpec.id).certificate_digest,
      degree: caseSpec.polynomial.coefficients.length - 1,
      provenance: caseSpec.provenance,
    })),
    records,
    cold_records: coldRecords,
    summary: {
      state_counts: stateCounts,
      verified_timing_records: records.filter(
        (record) => record.status === "ok" && record.verification?.verified,
      ).length,
      rejected_timing_records: records.filter(
        (record) => ["invalid", "disagreement"].includes(record.status),
      ).length,
    },
  };
}

function reportMarkdown(report) {
  const rows = report.records.map((record) => {
    const timing = record.statistics?.median_ms;
    return `| ${record.case_id} | ${record.system} | ${record.implementation_family} | ${record.boundary} | ${record.status} | ${timing === null || timing === undefined ? "—" : timing.toFixed(3)} | ${record.peak_rss_kb ?? "—"} |`;
  });
  return [
    `# Maximal-order oracle report: ${report.profile}`,
    "",
    `Generated at ${report.generated_at} from manifest \`${report.manifest_id}\` (${report.manifest_digest}).`,
    "",
    "Only independently verified `ok` records contribute timings. Invalid results and",
    "cross-family disagreements retain raw evidence but have no accepted statistics.",
    "",
    "| Case | System | Family | Boundary | State | Median (ms) | Peak RSS (KiB) |",
    "| --- | --- | --- | --- | --- | ---: | ---: |",
    ...rows,
    "",
    "## State counts",
    "",
    ...Object.entries(report.summary.state_counts).map(([state, count]) => `- ${state}: ${count}`),
    "",
  ].join("\n");
}

function writeReport(report, jsonPath, markdownPath) {
  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  if (markdownPath) writeFileSync(markdownPath, reportMarkdown(report));
}

module.exports = {
  TERMINAL_STATES,
  digest,
  loadManifest,
  reportMarkdown,
  runManifest,
  stableJson,
  validateManifest,
  writeReport,
};
