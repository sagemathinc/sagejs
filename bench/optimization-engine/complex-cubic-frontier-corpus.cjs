#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST_SCHEMA =
  "sagejs.number-fields/complex-cubic-frontier-corpus-manifest-v1";
const SELECTION_SEED = ":sagejs-complex-cubic-frontier-1412-v1";
const EXPECTED_EXCLUDED_LABELS_SHA256 =
  "3aaa2fd01a009d87d40f9f21a83db42b00f3f578827e2ae36d3e0025bdf610d8";
const EXPECTED_EXCLUDED_LABELS_COUNT = 1815;
const EXCLUSION_DERIVATION = Object.freeze({
  roots: Object.freeze([
    ".agents/scratch",
    "bench",
    "test/fixtures/number-field-lmfdb-cubic-100.json",
    "test/fixtures/number-field-lmfdb-cubic-class-numbers.json",
  ]),
  label_regex: String.raw`3\.(1|3)\.[0-9]+\.[0-9]+`,
  normalization:
    "discard filename prefixes; sort bytewise unique under LC_ALL=C; serialize one label plus LF",
});
const DEFAULT_RELEASE_TAG = "optimization-corpus-complex-cubic-v1";
const DEFAULT_RELEASE_BASE_URL =
  `https://github.com/sagemathinc/sagejs/releases/download/${DEFAULT_RELEASE_TAG}`;

const CONTROL_LABELS = Object.freeze([
  "3.1.23.1",
  "3.1.59.1",
  "3.1.283.1",
  "3.1.588.1",
  "3.1.1083.1",
  "3.1.1371.1",
  "3.1.1563.1",
  "3.1.2856.1",
  "3.1.4027.2",
  "3.1.5448.1",
  "3.1.331.1",
  "3.1.9399.1",
]);

const DISCRIMINANT_BANDS = Object.freeze([
  Object.freeze({ id: "d1-1e4-1e5", lowerExclusive: 10_000n, upperInclusive: 100_000n }),
  Object.freeze({ id: "d2-1e5-1e6", lowerExclusive: 100_000n, upperInclusive: 1_000_000n }),
  Object.freeze({ id: "d3-1e6-1e7", lowerExclusive: 1_000_000n, upperInclusive: 10_000_000n }),
  Object.freeze({ id: "d4-1e7-1e8", lowerExclusive: 10_000_000n, upperInclusive: 100_000_000n }),
]);

const CLASS_BANDS = Object.freeze([
  "h0-trivial",
  "h1-cyclic-2-4",
  "h2-cyclic-5-16",
  "h3-cyclic-ge-17",
  "h4-noncyclic",
]);

const SOURCE_COLUMNS = Object.freeze([
  "label",
  "degree",
  "coeffs",
  "r2",
  "disc_sign",
  "disc_abs",
  "disc_rad",
  "index",
  "monogenic",
  "galt",
  "galois_label",
  "num_ram",
  "class_number",
  "class_group",
  "regulator",
  "torsion_order",
  "used_grh",
  "narrow_class_number",
  "narrow_class_group",
  "unit_signature_rank",
]);

const RECORD_KEYS = Object.freeze([
  "class_group",
  "class_number",
  "coefficients",
  "degree",
  "disc_sign",
  "discriminant_absolute",
  "discriminant_radical",
  "equation_order_index",
  "galois_label",
  "galois_transitive_group",
  "label",
  "monogenic",
  "narrow_class_group",
  "narrow_class_number",
  "r2",
  "ramified_prime_count",
  "regulator",
  "selection",
  "torsion_order",
  "unit_rank",
  "unit_signature_rank",
  "used_grh",
].sort());

const LABEL_PATTERN = /^3\.1\.([1-9][0-9]*)\.([1-9][0-9]*)$/;
const ANY_NUMBER_FIELD_LABEL_PATTERN =
  /^[1-9][0-9]*\.[0-9]+\.[1-9][0-9]*\.[1-9][0-9]*$/;
const INTEGER_PATTERN = /^-?(?:0|[1-9][0-9]*)$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const DECIMAL_PATTERN =
  /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;

function fail(message) {
  throw new Error(`complex cubic frontier corpus: ${message}`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort(compareAscii)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    fail("canonical JSON cannot contain a non-finite number");
  }
  return JSON.stringify(value);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value) {
  return sha256(canonicalJson(value));
}

function normalizeSql(sql) {
  return `${sql
    .trim()
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n")}\n`;
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const observed = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (canonicalJson(observed) !== canonicalJson(wanted)) {
    fail(`${label} keys must be ${wanted.join(", ")}`);
  }
}

function canonicalLabels(labels) {
  if (!Array.isArray(labels)) fail("excluded labels must be an array");
  const result = labels.map((label) => {
    if (typeof label !== "string" || !ANY_NUMBER_FIELD_LABEL_PATTERN.test(label)) {
      fail(`invalid excluded LMFDB label ${JSON.stringify(label)}`);
    }
    return label;
  });
  result.sort(compareAscii);
  if (new Set(result).size !== result.length) {
    fail("excluded labels must be unique");
  }
  return result;
}

function labelsSha256(labels) {
  return sha256(`${canonicalLabels(labels).join("\n")}\n`);
}

function parseExcludedLabelsBytes(bytes, filename = "excluded labels") {
  const source = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes);
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    parsed = source.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  }
  if (Array.isArray(parsed)) {
    if (parsed.every((item) => typeof item === "string")) {
      return canonicalLabels(parsed);
    }
    if (parsed.every((item) => item && typeof item.label === "string")) {
      return canonicalLabels(parsed.map((item) => item.label));
    }
  }
  if (parsed && Array.isArray(parsed.labels)) return canonicalLabels(parsed.labels);
  if (parsed && Array.isArray(parsed.records)) {
    return canonicalLabels(parsed.records.map((record) => record.label));
  }
  fail(`${filename} must be newline labels, a JSON label array, or an object with labels/records`);
}

function readExcludedLabels(filename, expectedDigest = EXPECTED_EXCLUDED_LABELS_SHA256) {
  const labels = parseExcludedLabelsBytes(fs.readFileSync(filename), filename);
  const digest = labelsSha256(labels);
  if (digest !== expectedDigest) {
    fail(`excluded-label digest ${digest} does not match frozen ${expectedDigest}`);
  }
  return labels;
}

function sqlQuoted(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function valuesSql(labels, withRank = false) {
  if (labels.length === 0) {
    return withRank
      ? "  SELECT NULL::text AS label, NULL::bigint AS selection_rank WHERE FALSE"
      : "  SELECT NULL::text AS label WHERE FALSE";
  }
  return `  VALUES\n${labels
    .map((label, index) =>
      withRank
        ? `    (${sqlQuoted(label)}, ${index + 1})`
        : `    (${sqlQuoted(label)})`)
    .join(",\n")}`;
}

function sourceProjectionSql(prefix) {
  return `${prefix}.label, ${prefix}.degree,
         ARRAY(SELECT coefficient::text FROM unnest(${prefix}.coeffs) coefficient)
           AS coefficients,
         ${prefix}.disc_sign,
         ${prefix}.disc_abs::text AS discriminant_absolute,
         ${prefix}.r2,
         (${prefix}.degree - ${prefix}.r2 - 1)::integer AS unit_rank,
         ${prefix}.disc_rad::text AS discriminant_radical,
         ${prefix}.index::text AS equation_order_index,
         ${prefix}.monogenic,
         ${prefix}.galt AS galois_transitive_group,
         ${prefix}.galois_label,
         ${prefix}.num_ram AS ramified_prime_count,
         ${prefix}.class_number::text AS class_number,
         ARRAY(SELECT invariant FROM jsonb_array_elements_text(${prefix}.class_group) invariant)
           AS class_group,
         ${prefix}.regulator::text AS regulator,
         ${prefix}.torsion_order,
         ${prefix}.used_grh,
         ${prefix}.narrow_class_number::text AS narrow_class_number,
         CASE WHEN ${prefix}.narrow_class_group IS NULL THEN NULL ELSE
           ARRAY(SELECT invariant::text FROM unnest(${prefix}.narrow_class_group) invariant)
         END AS narrow_class_group,
         ${prefix}.unit_signature_rank`;
}

function selectionQuery(excludedLabels) {
  const excluded = canonicalLabels(excludedLabels);
  return normalizeSql(`COPY (
WITH controls(label, selection_rank) AS (
${valuesSql(CONTROL_LABELS, true)}
), exposed(label) AS (
${valuesSql(excluded)}
), base AS (
  SELECT f.label,
         CASE WHEN f.disc_abs <= 100000 THEN 'd1-1e4-1e5'
              WHEN f.disc_abs <= 1000000 THEN 'd2-1e5-1e6'
              WHEN f.disc_abs <= 10000000 THEN 'd3-1e6-1e7'
              ELSE 'd4-1e7-1e8' END AS discriminant_band,
         CASE WHEN f.class_number = 1 THEN 'h0-trivial'
              WHEN jsonb_array_length(f.class_group) > 1 THEN 'h4-noncyclic'
              WHEN f.class_number <= 4 THEN 'h1-cyclic-2-4'
              WHEN f.class_number <= 16 THEN 'h2-cyclic-5-16'
              ELSE 'h3-cyclic-ge-17' END AS class_band
    FROM nf_fields f
    LEFT JOIN exposed USING (label)
   WHERE f.degree = 3
     AND f.r2 = 1
     AND f.disc_sign = -1
     AND f.disc_abs > 10000
     AND f.disc_abs <= 100000000
     AND f.class_number IS NOT NULL
     AND f.class_group IS NOT NULL
     AND f.regulator IS NOT NULL
     AND f.used_grh IS FALSE
     AND exposed.label IS NULL
), ranked AS (
  SELECT base.*,
         row_number() OVER (
           PARTITION BY discriminant_band, class_band
           ORDER BY md5(label || '${SELECTION_SEED}'), label
         ) AS selection_rank
    FROM base
), selected AS (
  SELECT label, 'smoke'::text AS role,
         'fixed-complex-controls'::text AS stratum,
         selection_rank::bigint
    FROM controls
  UNION ALL
  SELECT label,
         CASE WHEN selection_rank <= 50 THEN 'tune' ELSE 'holdout' END AS role,
         discriminant_band || ':' || class_band AS stratum,
         selection_rank
    FROM ranked
   WHERE selection_rank <= 70
), records AS (
  SELECT json_build_object(
           'role', selected.role,
           'stratum', selected.stratum,
           'selection_rank', selected.selection_rank::integer
         ) AS selection,
         ${sourceProjectionSql("f")}
    FROM selected
    JOIN nf_fields f USING (label)
   ORDER BY f.degree, f.disc_abs, f.label
)
SELECT row_to_json(records) FROM records
) TO STDOUT;`);
}

function replayQuery(labels) {
  const selected = canonicalLabels(labels);
  if (selected.length === 0) fail("replay needs at least one pinned label");
  return normalizeSql(`COPY (
WITH selected_labels(label) AS (
${valuesSql(selected)}
), records AS (
  SELECT ${sourceProjectionSql("f")}
    FROM selected_labels
    JOIN nf_fields f USING (label)
   ORDER BY f.degree, f.disc_abs, f.label
)
SELECT row_to_json(records) FROM records
) TO STDOUT;`);
}

function connectionOptions() {
  return {
    host: process.env.LMFDB_PGHOST || "devmirror.lmfdb.xyz",
    port: process.env.LMFDB_PGPORT || "5432",
    database: process.env.LMFDB_PGDATABASE || "lmfdb",
    user: process.env.LMFDB_PGUSER || "lmfdb",
    password: process.env.LMFDB_PGPASSWORD || "lmfdb",
  };
}

function queryRows(query) {
  const connection = connectionOptions();
  const run = childProcess.spawnSync(
    "psql",
    [
      "-X",
      "-qAt",
      "--set=ON_ERROR_STOP=1",
      `--host=${connection.host}`,
      `--port=${connection.port}`,
      `--dbname=${connection.database}`,
      `--username=${connection.user}`,
      `--command=${query}`,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        PGPASSWORD: connection.password,
        PGCONNECT_TIMEOUT: "10",
      },
      maxBuffer: 256 * 1024 * 1024,
      timeout: 600_000,
      killSignal: "SIGKILL",
    },
  );
  if (run.error || run.status !== 0) {
    fail(run.error?.message || run.stderr || `psql exited ${run.status}`);
  }
  return run.stdout.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function discriminantBand(discriminant) {
  const value = BigInt(discriminant);
  return DISCRIMINANT_BANDS.find(
    (band) => value > band.lowerExclusive && value <= band.upperInclusive,
  )?.id || null;
}

function classBand(classNumber, invariants) {
  const order = BigInt(classNumber);
  if (order === 1n) return "h0-trivial";
  if (invariants.length > 1) return "h4-noncyclic";
  if (order <= 4n) return "h1-cyclic-2-4";
  if (order <= 16n) return "h2-cyclic-5-16";
  return "h3-cyclic-ge-17";
}

function compareRecords(left, right) {
  if (left.degree !== right.degree) return left.degree - right.degree;
  const leftDiscriminant = BigInt(left.discriminant_absolute);
  const rightDiscriminant = BigInt(right.discriminant_absolute);
  if (leftDiscriminant !== rightDiscriminant) {
    return leftDiscriminant < rightDiscriminant ? -1 : 1;
  }
  return compareAscii(left.label, right.label);
}

function validateIntegerString(value, label, positive = false) {
  const pattern = positive ? POSITIVE_INTEGER_PATTERN : INTEGER_PATTERN;
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(`${label} must be a canonical ${positive ? "positive " : ""}integer string`);
  }
}

function validateGroup(invariants, classNumber, label) {
  if (!Array.isArray(invariants)) fail(`${label}.class_group must be an array`);
  let product = 1n;
  let previous = 1n;
  for (const invariant of invariants) {
    validateIntegerString(invariant, `${label}.class_group entry`, true);
    const value = BigInt(invariant);
    if (value < 2n || value % previous !== 0n) {
      fail(`${label}.class_group must contain divisibility-ordered invariants >= 2`);
    }
    product *= value;
    previous = value;
  }
  if (product !== BigInt(classNumber)) {
    fail(`${label}.class_group has order ${product}, expected ${classNumber}`);
  }
}

function validateRecord(record) {
  exactKeys(record, RECORD_KEYS, `record ${record?.label || "<unknown>"}`);
  const match = LABEL_PATTERN.exec(record.label);
  if (!match || record.degree !== 3 || record.r2 !== 1 || record.disc_sign !== -1) {
    fail(`${record.label}: expected a complex cubic LMFDB record`);
  }
  validateIntegerString(record.discriminant_absolute, `${record.label}.discriminant_absolute`, true);
  if (record.discriminant_absolute !== match[1]) {
    fail(`${record.label}: label discriminant does not match record`);
  }
  if (!Array.isArray(record.coefficients) || record.coefficients.length !== 4 ||
      record.coefficients.some((value) => typeof value !== "string" || !INTEGER_PATTERN.test(value)) ||
      record.coefficients[3] !== "1") {
    fail(`${record.label}: coefficients must be a monic ascending cubic integer vector`);
  }
  validateIntegerString(record.discriminant_radical, `${record.label}.discriminant_radical`, true);
  validateIntegerString(record.equation_order_index, `${record.label}.equation_order_index`, true);
  validateIntegerString(record.class_number, `${record.label}.class_number`, true);
  validateGroup(record.class_group, record.class_number, record.label);
  if (record.unit_rank !== 1 || record.unit_signature_rank !== 1 ||
      record.torsion_order !== 2 || record.used_grh !== false) {
    fail(`${record.label}: invalid complex-cubic unit or proof metadata`);
  }
  if (![0, 1, -1].includes(record.monogenic) ||
      record.galois_transitive_group !== 2 || record.galois_label !== "3T2" ||
      !Number.isInteger(record.ramified_prime_count) || record.ramified_prime_count < 1) {
    fail(`${record.label}: invalid structural metadata`);
  }
  if (typeof record.regulator !== "string" || !DECIMAL_PATTERN.test(record.regulator) ||
      Number(record.regulator) <= 0) {
    fail(`${record.label}: invalid regulator`);
  }
  if (record.narrow_class_number !== null) {
    validateIntegerString(record.narrow_class_number, `${record.label}.narrow_class_number`, true);
  }
  if (record.narrow_class_group !== null) {
    if (!Array.isArray(record.narrow_class_group)) {
      fail(`${record.label}.narrow_class_group must be an array or null`);
    }
    for (const invariant of record.narrow_class_group) {
      validateIntegerString(invariant, `${record.label}.narrow_class_group entry`, true);
    }
  }
  exactKeys(record.selection, ["role", "selection_rank", "stratum"], `${record.label}.selection`);
  if (!Number.isInteger(record.selection.selection_rank) || record.selection.selection_rank < 1) {
    fail(`${record.label}: invalid selection rank`);
  }
  return record;
}

function expectedStrata() {
  return DISCRIMINANT_BANDS.flatMap((discriminant) =>
    CLASS_BANDS.map((classId) => `${discriminant.id}:${classId}`));
}

function validateCorpusRecords(records, excludedLabels) {
  if (!Array.isArray(records) || records.length !== 1412) {
    fail(`expected exactly 1412 records, got ${records?.length}`);
  }
  const excluded = new Set(canonicalLabels(excludedLabels));
  const controls = new Set(CONTROL_LABELS);
  const labels = new Set();
  let previous = null;
  const roleCounts = { smoke: 0, tune: 0, holdout: 0 };
  const cellRanks = new Map(expectedStrata().map((stratum) => [stratum, new Map()]));
  for (const record of records) {
    validateRecord(record);
    if (labels.has(record.label)) fail(`duplicate record ${record.label}`);
    labels.add(record.label);
    if (previous !== null && compareRecords(previous, record) >= 0) {
      fail("records must be strictly ordered by degree, numeric discriminant, and ASCII label");
    }
    previous = record;
    const role = record.selection.role;
    if (!Object.hasOwn(roleCounts, role)) fail(`${record.label}: invalid role ${role}`);
    roleCounts[role] += 1;
    if (controls.has(record.label)) {
      const expectedRank = CONTROL_LABELS.indexOf(record.label) + 1;
      if (role !== "smoke" || record.selection.stratum !== "fixed-complex-controls" ||
          record.selection.selection_rank !== expectedRank) {
        fail(`${record.label}: invalid fixed-control selection metadata`);
      }
      continue;
    }
    if (role === "smoke") fail(`${record.label}: unexpected smoke label`);
    if (excluded.has(record.label)) fail(`${record.label}: exposed label was resampled`);
    const discriminant = discriminantBand(record.discriminant_absolute);
    const classId = classBand(record.class_number, record.class_group);
    const stratum = `${discriminant}:${classId}`;
    if (discriminant === null || record.selection.stratum !== stratum) {
      fail(`${record.label}: stale stratum ${record.selection.stratum}, expected ${stratum}`);
    }
    const rank = record.selection.selection_rank;
    if ((role === "tune" && (rank < 1 || rank > 50)) ||
        (role === "holdout" && (rank < 51 || rank > 70))) {
      fail(`${record.label}: role ${role} disagrees with selection rank ${rank}`);
    }
    const ranks = cellRanks.get(stratum);
    if (ranks.has(rank)) fail(`${stratum}: duplicate selection rank ${rank}`);
    ranks.set(rank, record.label);
  }
  for (const label of CONTROL_LABELS) {
    if (!labels.has(label)) fail(`missing fixed control ${label}`);
  }
  if (canonicalJson(roleCounts) !== canonicalJson({ smoke: 12, tune: 1000, holdout: 400 })) {
    fail(`invalid role counts ${canonicalJson(roleCounts)}`);
  }
  for (const [stratum, ranks] of cellRanks) {
    if (ranks.size !== 70 ||
        Array.from({ length: 70 }, (_, index) => index + 1).some((rank) => !ranks.has(rank))) {
      fail(`${stratum}: expected exactly ranks 1 through 70`);
    }
  }
  return records;
}

function sourceRecord(record) {
  const { selection: _selection, ...source } = record;
  return source;
}

function recordsSha256(records) {
  return canonicalSha256(records);
}

function sourceRecordsSha256(records) {
  return canonicalSha256(records.map(sourceRecord));
}

function recordLabelsSha256(records) {
  const labels = records.map((record) => record.label);
  if (new Set(labels).size !== labels.length ||
      labels.some((label) => !ANY_NUMBER_FIELD_LABEL_PATTERN.test(label))) {
    fail("record labels must be unique valid LMFDB labels");
  }
  return sha256(`${labels.join("\n")}\n`);
}

function canonicalJsonl(records) {
  return Buffer.from(`${records.map((record) => canonicalJson(record)).join("\n")}\n`, "utf8");
}

function manifestIdentity(manifest) {
  const { id: _id, ...payload } = manifest;
  return `sha256:${canonicalSha256(payload)}`;
}

function manifestFilename(manifest) {
  return `complex-cubic-frontier-manifest-sha256-${manifest.id.slice(7)}.json`;
}

function makeAsset(records, role, releaseBaseUrl) {
  const jsonl = canonicalJsonl(records);
  const jsonlDigest = sha256(jsonl);
  const gzip = zlib.gzipSync(jsonl, { level: 9, mtime: 0 });
  const filename = `complex-cubic-frontier-${role}-sha256-${jsonlDigest}.jsonl.gz`;
  return {
    descriptor: {
      role,
      filename,
      release_url: `${releaseBaseUrl.replace(/\/$/u, "")}/${filename}`,
      media_type: "application/x-ndjson",
      content_encoding: "gzip",
      record_count: records.length,
      labels_sha256: recordLabelsSha256(records),
      source_records_sha256: sourceRecordsSha256(records),
      records_sha256: recordsSha256(records),
      canonical_jsonl_sha256: jsonlDigest,
      gzip_sha256: sha256(gzip),
      uncompressed_bytes: jsonl.length,
      compressed_bytes: gzip.length,
    },
    gzip,
  };
}

function buildBundle(records, {
  excludedLabels,
  expectedExcludedDigest = EXPECTED_EXCLUDED_LABELS_SHA256,
  capturedAt,
  releaseTag = DEFAULT_RELEASE_TAG,
  releaseBaseUrl = DEFAULT_RELEASE_BASE_URL,
} = {}) {
  const excluded = canonicalLabels(excludedLabels);
  const excludedDigest = labelsSha256(excluded);
  if (excludedDigest !== expectedExcludedDigest) {
    fail(`excluded-label digest ${excludedDigest} does not match frozen ${expectedExcludedDigest}`);
  }
  if (typeof capturedAt !== "string" || Number.isNaN(Date.parse(capturedAt))) {
    fail("capturedAt must be an ISO timestamp");
  }
  const sorted = [...records].sort(compareRecords);
  validateCorpusRecords(sorted, excluded);
  const surveyRecords = sorted.filter((record) => record.selection.role !== "holdout");
  const holdoutRecords = sorted.filter((record) => record.selection.role === "holdout");
  const survey = makeAsset(surveyRecords, "survey", releaseBaseUrl);
  const holdout = makeAsset(holdoutRecords, "holdout", releaseBaseUrl);
  const sql = selectionQuery(excluded);
  const manifest = {
    schema: MANIFEST_SCHEMA,
    id: "",
    description:
      "Frozen complex-cubic LMFDB performance survey with a policy-held-out neighboring set.",
    source: {
      provider: "The LMFDB Collaboration",
      dataset: "LMFDB Number Fields",
      table: "nf_fields",
      number_fields_url: "https://www.lmfdb.org/NumberField/",
      citation_url: "https://www.lmfdb.org/citation",
      public_sql_mirror: "https://beta.lmfdb.org/api/options",
      license: "CC-BY-SA-4.0",
      license_url: "https://creativecommons.org/licenses/by-sa/4.0/",
      columns: [...SOURCE_COLUMNS],
    },
    snapshot: {
      captured_at: capturedAt,
      selection_seed: SELECTION_SEED,
      selection_sql: sql,
      canonical_ordering: ["degree", "numeric-discriminant-absolute", "ascii-label"],
      discriminant_absolute_lower_exclusive: "10000",
      discriminant_absolute_upper_inclusive: "100000000",
    },
    exclusions: {
      count: excluded.length,
      labels_sha256: excludedDigest,
      derivation: EXCLUSION_DERIVATION,
    },
    controls: [...CONTROL_LABELS],
    counts: {
      total: sorted.length,
      smoke: surveyRecords.filter((record) => record.selection.role === "smoke").length,
      tune: surveyRecords.filter((record) => record.selection.role === "tune").length,
      holdout: holdoutRecords.length,
      strata: expectedStrata().length,
      tune_per_stratum: 50,
      holdout_per_stratum: 20,
    },
    strata: expectedStrata(),
    checksums: {
      labels_sha256: recordLabelsSha256(sorted),
      source_records_sha256: sourceRecordsSha256(sorted),
      records_sha256: recordsSha256(sorted),
      selection_sql_sha256: sha256(sql),
      source_columns_sha256: canonicalSha256(SOURCE_COLUMNS),
    },
    release: {
      tag: releaseTag,
      assets: [survey.descriptor, holdout.descriptor],
    },
  };
  manifest.id = manifestIdentity(manifest);
  return { manifest, assets: { survey, holdout }, records: sorted };
}

function parseJsonl(bytes, label) {
  const source = bytes.toString("utf8");
  if (!source.endsWith("\n")) fail(`${label} must end with LF`);
  const lines = source.slice(0, -1).split("\n");
  if (lines.some((line) => line.length === 0)) fail(`${label} contains a blank line`);
  return lines.map((line, index) => {
    const record = JSON.parse(line);
    if (line !== canonicalJson(record)) fail(`${label} line ${index + 1} is not canonical JSON`);
    return record;
  });
}

function loadAsset(asset, assetDirectory) {
  const filename = path.join(assetDirectory, asset.filename);
  const gzip = fs.readFileSync(filename);
  if (gzip.length !== asset.compressed_bytes || sha256(gzip) !== asset.gzip_sha256) {
    fail(`${asset.role} compressed asset identity mismatch`);
  }
  const jsonl = zlib.gunzipSync(gzip);
  if (jsonl.length !== asset.uncompressed_bytes ||
      sha256(jsonl) !== asset.canonical_jsonl_sha256) {
    fail(`${asset.role} canonical JSONL identity mismatch`);
  }
  const records = parseJsonl(jsonl, asset.role);
  if (records.length !== asset.record_count ||
      recordLabelsSha256(records) !== asset.labels_sha256 ||
      sourceRecordsSha256(records) !== asset.source_records_sha256 ||
      recordsSha256(records) !== asset.records_sha256) {
    fail(`${asset.role} logical asset identity mismatch`);
  }
  return records;
}

function validateSurveyRecords(records, manifest) {
  if (!Array.isArray(records) || records.length !== manifest.counts.smoke + manifest.counts.tune) {
    fail(`survey must contain exactly ${manifest.counts.smoke + manifest.counts.tune} records`);
  }
  const labels = new Set();
  const controls = new Map();
  const ranks = new Map(manifest.strata.map((stratum) => [stratum, new Map()]));
  let previous = null;
  for (const record of records) {
    validateRecord(record);
    if (labels.has(record.label)) fail(`survey contains duplicate record ${record.label}`);
    labels.add(record.label);
    if (previous !== null && compareRecords(previous, record) >= 0) {
      fail("survey records must retain canonical source order");
    }
    previous = record;
    if (record.selection.role === "smoke") {
      const expectedRank = manifest.controls.indexOf(record.label) + 1;
      if (expectedRank < 1 || record.selection.stratum !== "fixed-complex-controls" ||
          record.selection.selection_rank !== expectedRank) {
        fail(`${record.label}: invalid survey control metadata`);
      }
      controls.set(record.label, record);
      continue;
    }
    if (record.selection.role !== "tune") {
      fail(`${record.label}: survey asset contains forbidden role ${record.selection.role}`);
    }
    const discriminant = discriminantBand(record.discriminant_absolute);
    const classId = classBand(record.class_number, record.class_group);
    const stratum = `${discriminant}:${classId}`;
    const rank = record.selection.selection_rank;
    if (discriminant === null || record.selection.stratum !== stratum ||
        rank < 1 || rank > manifest.counts.tune_per_stratum || !ranks.has(stratum)) {
      fail(`${record.label}: invalid survey stratum or rank`);
    }
    if (ranks.get(stratum).has(rank)) fail(`${stratum}: duplicate survey rank ${rank}`);
    ranks.get(stratum).set(rank, record);
  }
  if (controls.size !== manifest.controls.length ||
      manifest.controls.some((label) => !controls.has(label))) {
    fail("survey does not contain every fixed control exactly once");
  }
  for (const [stratum, selected] of ranks) {
    if (selected.size !== manifest.counts.tune_per_stratum ||
        Array.from(
          { length: manifest.counts.tune_per_stratum },
          (_, index) => index + 1,
        ).some((rank) => !selected.has(rank))) {
      fail(`${stratum}: survey must contain every tuning rank exactly once`);
    }
  }
  return records;
}

function loadSurveyAsset(
  manifest,
  assetDirectory,
  expectedExcludedDigest = EXPECTED_EXCLUDED_LABELS_SHA256,
) {
  validateManifestShape(manifest, expectedExcludedDigest);
  const surveyAsset = manifest.release.assets[0];
  if (surveyAsset.role !== "survey") fail("first release asset is not the survey");
  return validateSurveyRecords(loadAsset(surveyAsset, assetDirectory), manifest);
}

function validateManifestShape(
  manifest,
  expectedExcludedDigest = EXPECTED_EXCLUDED_LABELS_SHA256,
) {
  exactKeys(manifest, [
    "checksums", "controls", "counts", "description", "exclusions", "id",
    "release", "schema", "snapshot", "source", "strata",
  ], "manifest");
  if (manifest.schema !== MANIFEST_SCHEMA || manifest.id !== manifestIdentity(manifest)) {
    fail("manifest schema or content identity is stale");
  }
  if (typeof manifest.description !== "string" || manifest.description.length === 0) {
    fail("manifest description is missing");
  }
  exactKeys(manifest.source, [
    "citation_url", "columns", "dataset", "license", "license_url",
    "number_fields_url", "provider", "public_sql_mirror", "table",
  ], "manifest.source");
  if (manifest.source.provider !== "The LMFDB Collaboration" ||
      manifest.source.dataset !== "LMFDB Number Fields" ||
      manifest.source.table !== "nf_fields" ||
      manifest.source.license !== "CC-BY-SA-4.0" ||
      manifest.source.license_url !== "https://creativecommons.org/licenses/by-sa/4.0/" ||
      canonicalJson(manifest.source.columns) !== canonicalJson(SOURCE_COLUMNS)) {
    fail("manifest source attribution or columns are stale");
  }
  for (const key of ["number_fields_url", "citation_url", "public_sql_mirror"]) {
    try {
      new URL(manifest.source[key]);
    } catch {
      fail(`manifest.source.${key} must be a URL`);
    }
  }
  exactKeys(manifest.snapshot, [
    "canonical_ordering", "captured_at", "discriminant_absolute_lower_exclusive",
    "discriminant_absolute_upper_inclusive", "selection_seed", "selection_sql",
  ], "manifest.snapshot");
  if (Number.isNaN(Date.parse(manifest.snapshot.captured_at)) ||
      canonicalJson(manifest.snapshot.canonical_ordering) !== canonicalJson([
        "degree", "numeric-discriminant-absolute", "ascii-label",
      ]) ||
      manifest.snapshot.discriminant_absolute_lower_exclusive !== "10000" ||
      manifest.snapshot.discriminant_absolute_upper_inclusive !== "100000000" ||
      manifest.snapshot.selection_sql !== normalizeSql(manifest.snapshot.selection_sql)) {
    fail("manifest snapshot boundary or SQL normalization is stale");
  }
  exactKeys(
    manifest.exclusions,
    ["count", "derivation", "labels_sha256"],
    "manifest.exclusions",
  );
  if (!Number.isInteger(manifest.exclusions.count) || manifest.exclusions.count < 1) {
    fail("manifest exclusion count must be positive");
  }
  if (expectedExcludedDigest === EXPECTED_EXCLUDED_LABELS_SHA256 &&
      (manifest.exclusions.count !== EXPECTED_EXCLUDED_LABELS_COUNT ||
       canonicalJson(manifest.exclusions.derivation) !== canonicalJson(EXCLUSION_DERIVATION))) {
    fail("manifest exclusion derivation or frozen count is stale");
  }
  exactKeys(manifest.counts, [
    "holdout", "holdout_per_stratum", "smoke", "strata", "total", "tune",
    "tune_per_stratum",
  ], "manifest.counts");
  exactKeys(manifest.checksums, [
    "labels_sha256", "records_sha256", "selection_sql_sha256",
    "source_columns_sha256", "source_records_sha256",
  ], "manifest.checksums");
  for (const [key, digest] of Object.entries(manifest.checksums)) {
    if (!/^[0-9a-f]{64}$/u.test(digest)) fail(`manifest.checksums.${key} is invalid`);
  }
  exactKeys(manifest.release, ["assets", "tag"], "manifest.release");
  if (typeof manifest.release.tag !== "string" || manifest.release.tag.length === 0) {
    fail("manifest release tag is missing");
  }
  if (canonicalJson(manifest.controls) !== canonicalJson(CONTROL_LABELS) ||
      canonicalJson(manifest.strata) !== canonicalJson(expectedStrata())) {
    fail("manifest controls or strata are stale");
  }
  if (manifest.exclusions.labels_sha256 !== expectedExcludedDigest ||
      manifest.snapshot.selection_seed !== SELECTION_SEED ||
      sha256(manifest.snapshot.selection_sql) !== manifest.checksums.selection_sql_sha256 ||
      canonicalSha256(manifest.source.columns) !== manifest.checksums.source_columns_sha256) {
    fail("manifest source, exclusion, or SQL provenance is stale");
  }
  const expectedCounts = {
    total: 1412,
    smoke: 12,
    tune: 1000,
    holdout: 400,
    strata: 20,
    tune_per_stratum: 50,
    holdout_per_stratum: 20,
  };
  if (canonicalJson(manifest.counts) !== canonicalJson(expectedCounts)) {
    fail("manifest counts are stale");
  }
  if (!Array.isArray(manifest.release.assets) || manifest.release.assets.length !== 2 ||
      manifest.release.assets[0].role !== "survey" ||
      manifest.release.assets[1].role !== "holdout") {
    fail("manifest must bind survey then holdout assets");
  }
  manifest.release.assets.forEach((asset, index) => {
    exactKeys(asset, [
      "canonical_jsonl_sha256", "compressed_bytes", "content_encoding", "filename",
      "gzip_sha256", "labels_sha256", "media_type", "record_count", "records_sha256",
      "release_url", "role", "source_records_sha256", "uncompressed_bytes",
    ], `manifest.release.assets[${index}]`);
    const expectedRole = index === 0 ? "survey" : "holdout";
    if (asset.role !== expectedRole || asset.media_type !== "application/x-ndjson" ||
        asset.content_encoding !== "gzip" ||
        asset.record_count !== (expectedRole === "survey" ? 1012 : 400) ||
        asset.filename !==
          `complex-cubic-frontier-${expectedRole}-sha256-${asset.canonical_jsonl_sha256}.jsonl.gz`) {
      fail(`${expectedRole} asset contract is stale`);
    }
    for (const key of [
      "labels_sha256", "source_records_sha256", "records_sha256",
      "canonical_jsonl_sha256", "gzip_sha256",
    ]) {
      if (!/^[0-9a-f]{64}$/u.test(asset[key])) fail(`${expectedRole}.${key} is invalid`);
    }
    if (!Number.isInteger(asset.uncompressed_bytes) || asset.uncompressed_bytes < 1 ||
        !Number.isInteger(asset.compressed_bytes) || asset.compressed_bytes < 1) {
      fail(`${expectedRole} asset byte sizes are invalid`);
    }
    try {
      new URL(asset.release_url);
    } catch {
      fail(`${expectedRole} asset release URL is invalid`);
    }
  });
  return manifest;
}

function validateBundle(manifest, assetDirectory, excludedLabels, {
  expectedExcludedDigest = EXPECTED_EXCLUDED_LABELS_SHA256,
} = {}) {
  validateManifestShape(manifest, expectedExcludedDigest);
  const excluded = canonicalLabels(excludedLabels);
  if (labelsSha256(excluded) !== manifest.exclusions.labels_sha256 ||
      excluded.length !== manifest.exclusions.count ||
      manifest.snapshot.selection_sql !== selectionQuery(excluded)) {
    fail("excluded labels do not reproduce the manifest selection SQL");
  }
  const [surveyAsset, holdoutAsset] = manifest.release.assets;
  const survey = loadAsset(surveyAsset, assetDirectory);
  const holdout = loadAsset(holdoutAsset, assetDirectory);
  if (survey.some((record) => record.selection.role === "holdout") ||
      holdout.some((record) => record.selection.role !== "holdout")) {
    fail("survey and holdout assets cross the policy boundary");
  }
  const records = [...survey, ...holdout].sort(compareRecords);
  validateCorpusRecords(records, excluded);
  if (recordLabelsSha256(records) !== manifest.checksums.labels_sha256 ||
      sourceRecordsSha256(records) !== manifest.checksums.source_records_sha256 ||
      recordsSha256(records) !== manifest.checksums.records_sha256) {
    fail("combined logical corpus identity mismatch");
  }
  return { manifest, survey, holdout, records };
}

function emitBundle(bundle, outputDirectory) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const written = [];
  try {
    for (const role of ["survey", "holdout"]) {
      const asset = bundle.assets[role];
      const filename = path.join(outputDirectory, asset.descriptor.filename);
      fs.writeFileSync(filename, asset.gzip, { flag: "wx" });
      written.push(filename);
    }
    const manifestPath = path.join(outputDirectory, manifestFilename(bundle.manifest));
    fs.writeFileSync(manifestPath, `${canonicalJson(bundle.manifest)}\n`, { flag: "wx" });
    written.push(manifestPath);
    return { manifestPath, written };
  } catch (error) {
    for (const filename of written.reverse()) {
      try {
        fs.unlinkSync(filename);
      } catch {
        // Best-effort rollback only for files created by this invocation.
      }
    }
    throw error;
  }
}

function parseManifestBytes(bytes, filename) {
  const source = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes);
  const manifest = JSON.parse(source);
  if (source !== `${canonicalJson(manifest)}\n`) fail("manifest file is not canonical JSON");
  if (path.basename(filename) !== manifestFilename(manifest)) {
    fail("manifest filename does not match its content identity");
  }
  return manifest;
}

function readManifest(filename) {
  return parseManifestBytes(fs.readFileSync(filename), filename);
}

function replayBundle(manifest, records) {
  const replayed = queryRows(replayQuery(records.map((record) => record.label)));
  if (replayed.length !== records.length) {
    fail(`LMFDB replay returned ${replayed.length} of ${records.length} records`);
  }
  const observed = canonicalSha256(replayed);
  if (observed !== manifest.checksums.source_records_sha256) {
    fail(`LMFDB replay source digest changed: ${observed}`);
  }
  return { records: replayed.length, source_records_sha256: observed };
}

function usage() {
  return `Usage: node ${path.relative(ROOT, __filename)} MODE [options]

Modes:
  --generate       query LMFDB and emit canonical split gzip assets plus manifest
  --check          validate a manifest and both local assets without networking
  --replay         check locally, then refetch pinned labels and compare source digest
  --selection-sql  print the exact normalized selection SQL

Options:
  --exclude-labels PATH                 frozen prior-exposure label input (required)
  --expected-excluded-labels-sha256 HEX default is the campaign-frozen digest
  --output-dir PATH                     required for --generate
  --manifest PATH                       required for --check/--replay
  --asset-dir PATH                      defaults to the manifest directory
  --captured-at ISO                     generation timestamp (default: now)
  --release-tag TAG                     default: ${DEFAULT_RELEASE_TAG}
  --release-base-url URL                default: ${DEFAULT_RELEASE_BASE_URL}
  --help                                show this text

Connection overrides: LMFDB_PGHOST, LMFDB_PGPORT, LMFDB_PGDATABASE,
LMFDB_PGUSER, and LMFDB_PGPASSWORD.`;
}

function parseArguments(argv) {
  const options = {
    mode: null,
    excludeLabels: null,
    expectedExcludedDigest: EXPECTED_EXCLUDED_LABELS_SHA256,
    outputDirectory: null,
    manifest: null,
    assetDirectory: null,
    capturedAt: new Date().toISOString(),
    releaseTag: DEFAULT_RELEASE_TAG,
    releaseBaseUrl: DEFAULT_RELEASE_BASE_URL,
  };
  const modes = new Map([
    ["--generate", "generate"],
    ["--check", "check"],
    ["--replay", "replay"],
    ["--selection-sql", "selection-sql"],
  ]);
  const values = new Map([
    ["--exclude-labels", "excludeLabels"],
    ["--expected-excluded-labels-sha256", "expectedExcludedDigest"],
    ["--output-dir", "outputDirectory"],
    ["--manifest", "manifest"],
    ["--asset-dir", "assetDirectory"],
    ["--captured-at", "capturedAt"],
    ["--release-tag", "releaseTag"],
    ["--release-base-url", "releaseBaseUrl"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      console.log(usage());
      process.exit(0);
    }
    if (modes.has(argument)) {
      if (options.mode !== null) fail("choose exactly one mode");
      options.mode = modes.get(argument);
      continue;
    }
    const key = values.get(argument);
    if (!key || index + 1 >= argv.length) fail(`unknown or incomplete option ${argument}`);
    options[key] = argv[(index += 1)];
  }
  if (options.mode === null) fail("choose one mode");
  if (!options.excludeLabels) fail("--exclude-labels is required");
  if (!/^[0-9a-f]{64}$/u.test(options.expectedExcludedDigest)) {
    fail("--expected-excluded-labels-sha256 must be lowercase SHA-256");
  }
  if (options.mode === "generate" && !options.outputDirectory) {
    fail("--generate requires --output-dir");
  }
  if (["check", "replay"].includes(options.mode) && !options.manifest) {
    fail(`--${options.mode} requires --manifest`);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const excluded = readExcludedLabels(
    path.resolve(options.excludeLabels),
    options.expectedExcludedDigest,
  );
  if (options.mode === "selection-sql") {
    process.stdout.write(selectionQuery(excluded));
    return null;
  }
  if (options.mode === "generate") {
    const records = queryRows(selectionQuery(excluded));
    const bundle = buildBundle(records, {
      excludedLabels: excluded,
      expectedExcludedDigest: options.expectedExcludedDigest,
      capturedAt: options.capturedAt,
      releaseTag: options.releaseTag,
      releaseBaseUrl: options.releaseBaseUrl,
    });
    const emitted = emitBundle(bundle, path.resolve(options.outputDirectory));
    console.log(emitted.manifestPath);
    return bundle.manifest;
  }
  const manifestPath = path.resolve(options.manifest);
  const manifest = readManifest(manifestPath);
  const assetDirectory = path.resolve(
    options.assetDirectory || path.dirname(manifestPath),
  );
  const checked = validateBundle(manifest, assetDirectory, excluded, {
    expectedExcludedDigest: options.expectedExcludedDigest,
  });
  if (options.mode === "check") {
    console.log(`complex cubic frontier corpus is valid (${checked.records.length} records)`);
    return checked;
  }
  const replayed = replayBundle(manifest, checked.records);
  console.log(
    `complex cubic frontier replay is exact (${replayed.records} records, ` +
      `${replayed.source_records_sha256})`,
  );
  return replayed;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  }
}

module.exports = {
  CLASS_BANDS,
  CONTROL_LABELS,
  DEFAULT_RELEASE_BASE_URL,
  DEFAULT_RELEASE_TAG,
  DISCRIMINANT_BANDS,
  EXCLUSION_DERIVATION,
  EXPECTED_EXCLUDED_LABELS_COUNT,
  EXPECTED_EXCLUDED_LABELS_SHA256,
  MANIFEST_SCHEMA,
  SELECTION_SEED,
  SOURCE_COLUMNS,
  buildBundle,
  canonicalJson,
  canonicalJsonl,
  canonicalLabels,
  canonicalSha256,
  classBand,
  compareRecords,
  discriminantBand,
  emitBundle,
  expectedStrata,
  labelsSha256,
  loadAsset,
  loadSurveyAsset,
  main,
  manifestFilename,
  manifestIdentity,
  normalizeSql,
  parseArguments,
  parseExcludedLabelsBytes,
  parseManifestBytes,
  queryRows,
  readExcludedLabels,
  readManifest,
  recordLabelsSha256,
  recordsSha256,
  replayBundle,
  replayQuery,
  selectionQuery,
  sha256,
  sourceRecord,
  sourceRecordsSha256,
  validateBundle,
  validateCorpusRecords,
  validateManifestShape,
  validateRecord,
  validateSurveyRecords,
};
