#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  CORPUS_SCHEMA,
  PRIOR_EXPOSURE_LABELS_SHA256,
  SEED,
  canonicalDigest,
  canonicalJson,
  sha256,
  validateCorpus,
} = require("./complex-cubic-frontier-schema.cjs");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_QUERY = `SELECT label, degree, coeffs, r2, disc_sign, disc_abs, disc_rad,
       index, num_ram, class_number, class_group, used_grh
FROM nf_fields
WHERE degree = 3 AND r2 = 1 AND disc_sign = -1
  AND disc_abs <= 100000000 AND used_grh = false
ORDER BY disc_abs, label`;
const DISCRIMINANT_BANDS = Object.freeze([
  [1n, 1_000n, "d000000001-000001000"],
  [1_001n, 10_000n, "d000001001-000010000"],
  [10_001n, 100_000n, "d000010001-000100000"],
  [100_001n, 1_000_000n, "d000100001-001000000"],
  [1_000_001n, 10_000_000n, "d001000001-010000000"],
  [10_000_001n, 100_000_000n, "d010000001-100000000"],
]);
const CLASS_GROUP_BANDS = Object.freeze([
  "trivial", "cyclic-2-4", "cyclic-5-10", "cyclic-over-10", "noncyclic",
]);

function usage() {
  return `Usage: node ${path.relative(ROOT, __filename)} --input PATH --output PATH \\
  --exclude PATH [--exclude PATH ...] [options]

Create the immutable 1,000-field complex-cubic frontier corpus from an offline
LMFDB JSON export. The input may be a JSON array or an object with a records
array. Every --exclude file may have a records array, cases array, or be a JSON
array. No network access occurs.

Options:
  --input PATH          offline LMFDB export
  --output PATH         canonical corpus JSON
  --exclude PATH        prior-exposure label source; repeatable and required
  --snapshot TEXT       LMFDB snapshot identifier (required)
  --selection-query PATH  exact SQL text (default is the documented query)
  --created-at ISO      reproducible UTC timestamp (default: now)
  --help                show this text`;
}

function parseArguments(argv) {
  const options = {
    input: null,
    output: null,
    excludes: [],
    snapshot: null,
    selectionQuery: DEFAULT_QUERY,
    createdAt: new Date().toISOString(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      console.log(usage());
      process.exit(0);
    }
    if (!["--input", "--output", "--exclude", "--snapshot", "--selection-query",
      "--created-at"].includes(argument)) throw new Error(`unknown argument: ${argument}`);
    if (index + 1 >= argv.length) throw new Error(`${argument} needs a value`);
    const value = argv[(index += 1)];
    if (argument === "--input") options.input = path.resolve(value);
    else if (argument === "--output") options.output = path.resolve(value);
    else if (argument === "--exclude") options.excludes.push(path.resolve(value));
    else if (argument === "--snapshot") options.snapshot = value;
    else if (argument === "--selection-query") {
      options.selectionQuery = fs.readFileSync(path.resolve(value), "utf8").trimEnd();
    } else options.createdAt = new Date(value).toISOString();
  }
  if (!options.input || !options.output || !options.snapshot || options.excludes.length === 0) {
    throw new Error("--input, --output, --snapshot, and at least one --exclude are required");
  }
  return options;
}

function canonicalInteger(value, label, { positive = false } = {}) {
  const text = String(value);
  if (!/^-?(?:0|[1-9][0-9]*)$/.test(text)) throw new Error(`${label}: invalid integer`);
  const result = BigInt(text);
  if (positive && result < 1n) throw new Error(`${label}: expected a positive integer`);
  return result.toString();
}

function normalizeList(value, label) {
  let selected = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    try {
      selected = JSON.parse(trimmed);
    } catch {
      selected = trimmed.replace(/^\[|\]$/g, "").split(",").filter(Boolean);
    }
  }
  if (!Array.isArray(selected)) throw new Error(`${label}: expected an array`);
  return selected;
}

function normalizeSourceRecord(source) {
  const label = String(source.label);
  const coefficients = normalizeList(source.coefficients ?? source.coeffs,
    `${label}.coefficients`).map((value) => canonicalInteger(value, `${label}.coefficient`));
  const classGroup = normalizeList(source.class_group_invariants ?? source.class_group ?? [],
    `${label}.class_group`).map((value) => canonicalInteger(value, `${label}.class_group`, {
      positive: true,
    })).filter((value) => value !== "1");
  const discriminantAbsolute = canonicalInteger(
    source.discriminant_absolute ?? source.disc_abs, `${label}.disc_abs`, { positive: true },
  );
  const discriminant = canonicalInteger(
    source.discriminant ?? -(BigInt(discriminantAbsolute)), `${label}.discriminant`,
  );
  return {
    label,
    degree: Number(source.degree),
    r2: Number(source.r2),
    disc_sign: Number(source.disc_sign),
    coefficients,
    discriminant,
    discriminant_absolute: discriminantAbsolute,
    class_number: canonicalInteger(source.class_number, `${label}.class_number`, { positive: true }),
    class_group_invariants: classGroup,
    equation_order_index: canonicalInteger(
      source.equation_order_index ?? source.index, `${label}.equation_order_index`, { positive: true },
    ),
    ramified_prime_count: Number(source.ramified_prime_count ?? source.num_ram),
    used_grh: source.used_grh,
  };
}

function classGroupBand(record) {
  const invariants = record.class_group_invariants.map(BigInt);
  if (invariants.length === 0) return "trivial";
  if (invariants.length > 1) return "noncyclic";
  if (invariants[0] <= 4n) return "cyclic-2-4";
  if (invariants[0] <= 10n) return "cyclic-5-10";
  return "cyclic-over-10";
}

function discriminantBand(record) {
  const absolute = BigInt(record.discriminant_absolute);
  const band = DISCRIMINANT_BANDS.find(([lower, upper]) => lower <= absolute && absolute <= upper);
  if (!band) throw new Error(`${record.label}: discriminant is outside the pinned bands`);
  return band[2];
}

function stratum(record) {
  return [
    discriminantBand(record),
    classGroupBand(record),
    BigInt(record.equation_order_index) === 1n ? "index-1" : "index-over-1",
    record.ramified_prime_count <= 1 ? "ramified-0-1" : "ramified-over-1",
  ].join("/");
}

function hashOrder(left, right, suffix) {
  const leftHash = crypto.createHash("md5").update(`${left}${suffix}`).digest("hex");
  const rightHash = crypto.createHash("md5").update(`${right}${suffix}`).digest("hex");
  return leftHash.localeCompare(rightHash) || left.localeCompare(right);
}

function extractLabels(document) {
  const records = Array.isArray(document) ? document : document.records ?? document.cases;
  if (!Array.isArray(records)) throw new Error("exclusion source has no records/cases array");
  return records.map((record) => typeof record === "string" ? record : String(record.label));
}

function buildCorpus(inputDocument, options = {}) {
  const requestedCount = options.fieldCount ?? 1000;
  const warmupCount = 3;
  const sourceRows = Array.isArray(inputDocument) ? inputDocument : inputDocument.records;
  if (!Array.isArray(sourceRows)) throw new Error("LMFDB input has no records array");
  const priorLabels = new Set(options.priorLabels || []);
  const normalized = sourceRows.map(normalizeSourceRecord).filter((record) =>
    record.degree === 3 && record.r2 === 1 && record.disc_sign === -1 &&
    BigInt(record.discriminant_absolute) <= 100_000_000n && record.used_grh === false &&
    !priorLabels.has(record.label));
  const seen = new Set();
  for (const record of normalized) {
    if (seen.has(record.label)) throw new Error(`duplicate LMFDB label ${record.label}`);
    seen.add(record.label);
    if (record.coefficients.length !== 4 || record.coefficients[3] !== "1") {
      throw new Error(`${record.label}: expected a monic cubic coefficient vector`);
    }
    const product = record.class_group_invariants.reduce((value, entry) => value * BigInt(entry), 1n);
    if (product !== BigInt(record.class_number)) throw new Error(`${record.label}: wrong class group order`);
    if (!Number.isSafeInteger(record.ramified_prime_count) || record.ramified_prime_count < 0) {
      throw new Error(`${record.label}: invalid ramified-prime count`);
    }
  }
  const buckets = new Map();
  for (const record of normalized) {
    const key = stratum(record);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(record);
  }
  for (const values of buckets.values()) {
    values.sort((left, right) => hashOrder(left.label, right.label, SEED));
  }
  const keys = [...buckets.keys()].sort((left, right) => hashOrder(left, right, SEED));
  const selected = [];
  let stratumRank = 0;
  while (selected.length < requestedCount + warmupCount) {
    stratumRank += 1;
    let progress = false;
    for (const key of keys) {
      const record = buckets.get(key)[stratumRank - 1];
      if (!record) continue;
      progress = true;
      selected.push({ record, stratum: key, stratumRank });
      if (selected.length === requestedCount + warmupCount) break;
    }
    if (!progress) break;
  }
  if (selected.length < requestedCount + warmupCount) {
    throw new Error(`only ${selected.length} eligible unseen fields; need ${requestedCount + warmupCount}`);
  }
  const project = ({ record, stratum: key, stratumRank: rank }, globalRank) => ({
    label: record.label,
    coefficients: record.coefficients,
    discriminant: record.discriminant,
    discriminant_absolute: record.discriminant_absolute,
    class_number: record.class_number,
    class_group_invariants: record.class_group_invariants,
    equation_order_index: record.equation_order_index,
    ramified_prime_count: record.ramified_prime_count,
    selection: { global_rank: globalRank, stratum: key, stratum_rank: rank, shard: (globalRank - 1) % 20 },
  });
  const records = selected.slice(0, requestedCount).map((entry, index) => project(entry, index + 1));
  const warmups = selected.slice(requestedCount).map((entry, index) => project(entry, requestedCount + index + 1));
  const selectionQuery = options.selectionQuery ?? DEFAULT_QUERY;
  const priorSorted = [...priorLabels].sort();
  const corpus = {
    schema: CORPUS_SCHEMA,
    schema_version: 1,
    created_at: new Date(options.createdAt ?? "2026-09-02T00:00:00.000Z").toISOString(),
    source: {
      kind: "lmfdb-number-fields",
      snapshot: options.snapshot ?? "test-snapshot",
      selection_query: selectionQuery,
      selection_query_sha256: sha256(selectionQuery),
      input_records_sha256: canonicalDigest(sourceRows),
    },
    selection_policy: {
      seed: SEED,
      field_count: requestedCount,
      warmup_count: 3,
      shard_count: 20,
      fields_per_shard: 50,
      discriminant_bands: DISCRIMINANT_BANDS.map((entry) => entry[2]),
      class_group_bands: [...CLASS_GROUP_BANDS],
      equation_order_index_bands: ["index-1", "index-over-1"],
      ramified_prime_count_bands: ["ramified-0-1", "ramified-over-1"],
      within_stratum_order: "md5(label || seed), then label",
      global_selection: "round-robin over md5(stratum || seed)-ordered nonempty strata",
    },
    prior_exposure: {
      record_count: priorSorted.length,
      labels_sha256: sha256(`${priorSorted.join("\n")}\n`),
      sources: options.priorSources ?? [],
    },
    warmups,
    records,
    digests: {
      labels_sha256: sha256(`${records.map((record) => record.label).join("\n")}\n`),
      records_sha256: canonicalDigest(records),
      warmup_labels_sha256: sha256(`${warmups.map((record) => record.label).join("\n")}\n`),
    },
  };
  return validateCorpus(corpus, { expectedCount: requestedCount });
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const inputText = fs.readFileSync(options.input, "utf8");
  const input = JSON.parse(inputText);
  const labels = [];
  const priorSources = [];
  for (const filename of options.excludes) {
    const bytes = fs.readFileSync(filename);
    labels.push(...extractLabels(JSON.parse(bytes.toString("utf8"))));
    priorSources.push({ path: filename, sha256: sha256(bytes) });
  }
  const corpus = buildCorpus(input, {
    fieldCount: 1000,
    snapshot: options.snapshot,
    selectionQuery: options.selectionQuery,
    createdAt: options.createdAt,
    priorLabels: [...new Set(labels)],
    priorSources,
  });
  if (corpus.prior_exposure.record_count !== 1815 ||
      corpus.prior_exposure.labels_sha256 !== PRIOR_EXPOSURE_LABELS_SHA256) {
    throw new Error(
      "production corpus exclusions must be the audited 1,815-label prior-exposure union " +
      PRIOR_EXPOSURE_LABELS_SHA256,
    );
  }
  fs.writeFileSync(options.output, canonicalJson(corpus));
  console.log(`${options.output}: ${corpus.records.length} fields; ${corpus.digests.labels_sha256}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  CLASS_GROUP_BANDS,
  DEFAULT_QUERY,
  DISCRIMINANT_BANDS,
  buildCorpus,
  classGroupBand,
  discriminantBand,
  extractLabels,
  normalizeSourceRecord,
  parseArguments,
  stratum,
};
