#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "../..");
const legacyFixture = path.join(
  repositoryRoot,
  "test/fixtures/number-field-lmfdb-cubic-class-numbers.json",
);
const stratifiedFixture = path.join(
  repositoryRoot,
  "test/fixtures/number-field-lmfdb-cubic-100.json",
);
const LEGACY_SCHEMA = "sagejs.number-fields/lmfdb-class-number-corpus-v1";
const STRATIFIED_SCHEMA =
  "sagejs.number-fields/lmfdb-cubic-stratified-corpus-v2";
const SELECTION_SEED = ":sagejs-cubic-100-v1";
const CANARY_LABEL = "3.3.961.1";
const LEGACY_LABELS = Object.freeze([
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

function usage() {
  console.log(`Usage: node ${path.relative(repositoryRoot, __filename)} MODE [options]

Modes:
  --check                 validate a pinned fixture without networking
  --download              download one bounded, ordered legacy corpus
  --generate-cubic-100    generate the versioned stratified cubic corpus
  --replay                refetch pinned labels and verify their source digest

Options:
  --degree N          number-field degree (default: 3)
  --disc-max N        maximum absolute discriminant (default: 100000)
  --limit N           maximum records (default: 1000)
  --output PATH       output JSON (required for download/generate)
  --fixture PATH      fixture checked or replayed
  --help              show this text

Connection overrides use LMFDB_PGHOST, LMFDB_PGPORT, LMFDB_PGDATABASE,
LMFDB_PGUSER, and LMFDB_PGPASSWORD. Defaults are the public read-only mirror
published at https://beta.lmfdb.org/api/options.`);
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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

function positiveInteger(value, name) {
  if (!/^[1-9][0-9]*$/.test(String(value))) {
    throw new Error(`${name} must be a positive decimal integer`);
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${name} is too large`);
  return result;
}

function parseArguments(argv) {
  const options = {
    mode: null,
    degree: 3,
    discMax: 100000,
    limit: 1000,
    output: null,
    fixture: legacyFixture,
    fixtureProvided: false,
  };
  const values = new Set([
    "--degree",
    "--disc-max",
    "--limit",
    "--output",
    "--fixture",
  ]);
  const modes = new Map([
    ["--check", "check"],
    ["--download", "download"],
    ["--generate-cubic-100", "generate-cubic-100"],
    ["--replay", "replay"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      usage();
      process.exit(0);
    } else if (modes.has(argument)) {
      if (options.mode !== null) throw new Error("choose exactly one mode");
      options.mode = modes.get(argument);
    } else if (values.has(argument)) {
      if (index + 1 >= argv.length) throw new Error(`${argument} needs a value`);
      const value = argv[(index += 1)];
      if (argument === "--degree") options.degree = positiveInteger(value, argument);
      else if (argument === "--disc-max") {
        options.discMax = positiveInteger(value, argument);
      } else if (argument === "--limit") {
        options.limit = positiveInteger(value, argument);
      } else if (argument === "--output") options.output = value;
      else {
        options.fixture = value;
        options.fixtureProvided = true;
      }
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (options.mode === null) throw new Error("choose a mode");
  if (
    ["download", "generate-cubic-100"].includes(options.mode) &&
    options.output === null
  ) {
    throw new Error(`--${options.mode} requires --output`);
  }
  if (options.mode === "replay" && !options.fixtureProvided) {
    options.fixture = stratifiedFixture;
  }
  return options;
}

function validateCommonRecord(record, labels) {
  if (typeof record.label !== "string" || labels.has(record.label)) {
    throw new Error("LMFDB records need unique string labels");
  }
  labels.add(record.label);
  if (
    !Number.isInteger(record.degree) ||
    record.degree < 1 ||
    !Array.isArray(record.coefficients) ||
    record.coefficients.length !== record.degree + 1 ||
    record.coefficients.some((value) => !/^-?[0-9]+$/.test(value)) ||
    record.coefficients.at(-1) !== "1"
  ) {
    throw new Error(`${record.label}: invalid monic coefficient vector`);
  }
  if (!/^[1-9][0-9]*$/.test(record.discriminant_absolute)) {
    throw new Error(`${record.label}: invalid absolute discriminant`);
  }
  if (record.disc_sign !== -1 && record.disc_sign !== 1) {
    throw new Error(`${record.label}: invalid discriminant sign`);
  }
  if (!/^[1-9][0-9]*$/.test(record.class_number)) {
    throw new Error(`${record.label}: invalid class number`);
  }
  if (
    !Array.isArray(record.class_group) ||
    record.class_group.some(
      (value) => !/^[1-9][0-9]*$/.test(value) || BigInt(value) < 2n,
    )
  ) {
    throw new Error(`${record.label}: invalid class-group invariants`);
  }
  const order = record.class_group.reduce(
    (product, value) => product * BigInt(value),
    1n,
  );
  if (order !== BigInt(record.class_number)) {
    throw new Error(`${record.label}: class invariants have the wrong order`);
  }
  if (
    !Number.isInteger(record.r2) ||
    record.r2 < 0 ||
    2 * record.r2 > record.degree ||
    !/^[0-9]+(?:\.[0-9]+)?$/.test(record.regulator) ||
    !Number.isInteger(record.torsion_order) ||
    record.torsion_order < 1 ||
    typeof record.used_grh !== "boolean"
  ) {
    throw new Error(`${record.label}: invalid analytic metadata`);
  }
}

function compareCanonicalKey(left, right) {
  if (left.degree !== right.degree) return left.degree - right.degree;
  const leftDisc = BigInt(left.discriminant_absolute);
  const rightDisc = BigInt(right.discriminant_absolute);
  if (leftDisc !== rightDisc) return leftDisc < rightDisc ? -1 : 1;
  return left.label.localeCompare(right.label);
}

function sourceRecord(record) {
  const { selection: _selection, ...source } = record;
  return source;
}

function labelsDigest(records) {
  return sha256(`${records.map((record) => record.label).join("\n")}\n`);
}

function sourceRecordsDigest(records) {
  return canonicalSha256(records.map(sourceRecord));
}

function recordsDigest(records) {
  return canonicalSha256(records);
}

function validateLegacyCorpus(corpus) {
  if (!Array.isArray(corpus.records)) {
    throw new Error("unsupported LMFDB number-field corpus schema");
  }
  const labels = new Set();
  let previous = null;
  for (const record of corpus.records) {
    validateCommonRecord(record, labels);
    if (previous !== null && compareCanonicalKey(previous, record) > 0) {
      throw new Error("LMFDB records are not canonically ordered");
    }
    previous = record;
  }
  return corpus;
}

function validateStratifiedRecord(record) {
  if (record.degree !== 3 || !/^3\.(1|3)\.[1-9][0-9]*\.[1-9][0-9]*$/.test(record.label)) {
    throw new Error(`${record.label}: invalid cubic LMFDB label`);
  }
  const realPlaces = record.degree - 2 * record.r2;
  if (Number(record.label.split(".")[1]) !== realPlaces) {
    throw new Error(`${record.label}: label and signature disagree`);
  }
  if (record.disc_sign !== (record.r2 === 0 ? 1 : -1)) {
    throw new Error(`${record.label}: cubic signature and discriminant sign disagree`);
  }
  if (record.unit_rank !== record.degree - record.r2 - 1) {
    throw new Error(`${record.label}: invalid unit rank`);
  }
  for (const field of [
    "discriminant_radical",
    "equation_order_index",
  ]) {
    if (!/^[1-9][0-9]*$/.test(record[field])) {
      throw new Error(`${record.label}: invalid ${field}`);
    }
  }
  for (const field of [
    "monogenic",
    "galois_transitive_group",
    "ramified_prime_count",
  ]) {
    if (!Number.isInteger(record[field])) {
      throw new Error(`${record.label}: invalid ${field}`);
    }
  }
  if (typeof record.galois_label !== "string") {
    throw new Error(`${record.label}: invalid Galois label`);
  }
  if (
    !record.selection ||
    !["smoke", "tune", "holdout"].includes(record.selection.role) ||
    typeof record.selection.stratum !== "string" ||
    !Number.isInteger(record.selection.selection_rank) ||
    record.selection.selection_rank < 1
  ) {
    throw new Error(`${record.label}: invalid selection metadata`);
  }
  if (
    record.narrow_class_number !== null &&
    !/^[1-9][0-9]*$/.test(record.narrow_class_number)
  ) {
    throw new Error(`${record.label}: invalid narrow class number`);
  }
  if (
    record.narrow_class_group !== null &&
    (!Array.isArray(record.narrow_class_group) ||
      record.narrow_class_group.some((value) => !/^[1-9][0-9]*$/.test(value)))
  ) {
    throw new Error(`${record.label}: invalid narrow class group`);
  }
  if (
    record.unit_signature_rank !== null &&
    !Number.isInteger(record.unit_signature_rank)
  ) {
    throw new Error(`${record.label}: invalid unit signature rank`);
  }
}

function validateStratifiedCorpus(corpus) {
  if (!Array.isArray(corpus.records) || corpus.records.length !== 100) {
    throw new Error("stratified cubic corpus must contain exactly 100 records");
  }
  const labels = new Set();
  let previous = null;
  for (const record of corpus.records) {
    validateCommonRecord(record, labels);
    validateStratifiedRecord(record);
    if (previous !== null && compareCanonicalKey(previous, record) > 0) {
      throw new Error("LMFDB records are not canonically ordered");
    }
    previous = record;
  }
  const roles = Object.fromEntries(
    ["smoke", "tune", "holdout"].map((role) => [
      role,
      corpus.records.filter((record) => record.selection.role === role).length,
    ]),
  );
  if (roles.smoke !== 10 || roles.tune !== 60 || roles.holdout !== 30) {
    throw new Error(`invalid corpus tier counts: ${JSON.stringify(roles)}`);
  }
  for (const label of LEGACY_LABELS) {
    const record = corpus.records.find((candidate) => candidate.label === label);
    if (!record || record.selection.role !== "smoke") {
      throw new Error(`missing legacy smoke record ${label}`);
    }
  }
  const canary = corpus.records.find((record) => record.label === CANARY_LABEL);
  if (
    !canary ||
    canary.selection.role !== "holdout" ||
    canary.equation_order_index !== "2" ||
    canary.r2 !== 0
  ) {
    throw new Error("missing totally real index-2 holdout canary");
  }
  const query = stratifiedCubicQuery();
  const expected = {
    labels_sha256: labelsDigest(corpus.records),
    source_records_sha256: sourceRecordsDigest(corpus.records),
    records_sha256: recordsDigest(corpus.records),
    selection_sql_sha256: sha256(query),
    source_columns_sha256: canonicalSha256(SOURCE_COLUMNS),
  };
  for (const [field, value] of Object.entries(expected)) {
    if (corpus.checksums?.[field] !== value) {
      throw new Error(`${field} mismatch: expected ${value}`);
    }
  }
  if (
    corpus.snapshot?.selection_seed !== SELECTION_SEED ||
    corpus.snapshot?.selection_sql !== query ||
    canonicalJson(corpus.source?.columns) !== canonicalJson(SOURCE_COLUMNS)
  ) {
    throw new Error("stratified corpus selection provenance is stale");
  }
  if (
    corpus.tiers?.smoke !== 10 ||
    corpus.tiers?.tune !== 60 ||
    corpus.tiers?.holdout !== 30
  ) {
    throw new Error("stratified corpus tier manifest is stale");
  }
  return corpus;
}

function validateCorpus(corpus) {
  if (corpus?.schema === LEGACY_SCHEMA) return validateLegacyCorpus(corpus);
  if (corpus?.schema === STRATIFIED_SCHEMA) return validateStratifiedCorpus(corpus);
  throw new Error("unsupported LMFDB number-field corpus schema");
}

function downloadQuery(options) {
  const degree = positiveInteger(options.degree, "degree");
  const discMax = positiveInteger(options.discMax, "disc-max");
  const limit = positiveInteger(options.limit, "limit");
  return `COPY (
SELECT row_to_json(record) FROM (
  SELECT label, degree,
         ARRAY(SELECT coefficient::text FROM unnest(coeffs) coefficient) AS coefficients,
         disc_sign, disc_abs::text AS discriminant_absolute, r2,
         class_number::text AS class_number,
         ARRAY(SELECT invariant FROM jsonb_array_elements_text(class_group) invariant)
           AS class_group,
         regulator::text AS regulator, torsion_order, used_grh
    FROM nf_fields
   WHERE degree = ${degree} AND disc_abs <= ${discMax}
   ORDER BY degree, disc_abs, label
   LIMIT ${limit}
) record
) TO STDOUT;`;
}

function legacyValuesSql() {
  return LEGACY_LABELS.map(
    (label, index) => `    ('${label}', ${index + 1})`,
  ).join(",\n");
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

function stratifiedCubicQuery() {
  return normalizeSql(`COPY (
WITH legacy(label, selection_rank) AS (
  VALUES
${legacyValuesSql()}
), base AS (
  SELECT f.label, f.r2,
         CASE WHEN f.disc_abs <= 10000 THEN 'd0-le-1e4'
              WHEN f.disc_abs <= 100000 THEN 'd1-1e4-1e5'
              WHEN f.disc_abs <= 1000000 THEN 'd2-1e5-1e6'
              ELSE 'd3-1e6-1e7' END AS discriminant_band,
         CASE WHEN f.class_number = 1 THEN 'h0-trivial'
              WHEN jsonb_array_length(f.class_group) > 1 THEN 'h3-noncyclic'
              WHEN f.class_number <= 4 THEN 'h1-cyclic-small'
              ELSE 'h2-cyclic-large' END AS class_band
    FROM nf_fields f
    LEFT JOIN legacy USING (label)
   WHERE f.degree = 3
     AND f.disc_abs <= 10000000
     AND legacy.label IS NULL
     AND f.label <> '${CANARY_LABEL}'
), ranked AS (
  SELECT base.*,
         row_number() OVER (
           PARTITION BY r2, discriminant_band, class_band
           ORDER BY md5(label || '${SELECTION_SEED}'), label
         ) AS selection_rank
    FROM base
), selected AS (
  SELECT label, 'smoke'::text AS role, 'legacy-smoke'::text AS stratum,
         selection_rank::bigint
    FROM legacy
  UNION ALL
  SELECT label,
         CASE WHEN selection_rank <= 2 THEN 'tune' ELSE 'holdout' END AS role,
         'r2-' || r2::text || ':' || discriminant_band || ':' || class_band AS stratum,
         selection_rank
    FROM ranked
   WHERE selection_rank <= 3
  UNION ALL
  SELECT '${CANARY_LABEL}', 'holdout', 'canary:totally-real-index-2', 1::bigint
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

function replayQuery(corpus) {
  const labels = corpus.records.map((record) => record.label);
  for (const label of labels) {
    if (!/^3\.(1|3)\.[1-9][0-9]*\.[1-9][0-9]*$/.test(label)) {
      throw new Error(`unsafe replay label: ${label}`);
    }
  }
  const values = labels.map((label) => `('${label}')`).join(",\n    ");
  return normalizeSql(`COPY (
WITH selected_labels(label) AS (
  VALUES
    ${values}
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
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PGPASSWORD: connection.password,
        PGCONNECT_TIMEOUT: "10",
      },
      maxBuffer: 256 * 1024 * 1024,
      timeout: 600000,
    },
  );
  if (run.error || run.status !== 0) {
    throw new Error(run.error?.message || run.stderr || `psql exited ${run.status}`);
  }
  return run.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function download(options) {
  const records = queryRows(downloadQuery(options));
  return validateCorpus({
    schema: LEGACY_SCHEMA,
    description:
      "Canonical read-only LMFDB number-field records; coefficients are ascending.",
    source: {
      table: "nf_fields",
      api_options: "https://beta.lmfdb.org/api/options",
      api_stats: "https://beta.lmfdb.org/api/stats",
      license: "CC-BY-SA-4.0",
    },
    query: {
      degree: options.degree,
      discriminant_absolute_maximum: String(options.discMax),
      limit: options.limit,
      ordering: ["degree", "disc_abs", "label"],
    },
    records,
  });
}

function buildStratifiedCorpus(records, capturedAt = new Date().toISOString()) {
  const query = stratifiedCubicQuery();
  const corpus = {
    schema: STRATIFIED_SCHEMA,
    description:
      "Versioned LMFDB cubic class/unit performance corpus with smoke, tuning, and held-out tiers.",
    source: {
      table: "nf_fields",
      api_options: "https://beta.lmfdb.org/api/options",
      api_stats: "https://beta.lmfdb.org/api/stats",
      license: "CC-BY-SA-4.0",
      columns: [...SOURCE_COLUMNS],
    },
    snapshot: {
      captured_at: capturedAt,
      selection_seed: SELECTION_SEED,
      selection_sql: query,
      canonical_ordering: ["degree", "disc_abs", "label"],
      discriminant_absolute_maximum: "10000000",
    },
    tiers: {
      smoke: 10,
      tune: 60,
      holdout: 30,
      policy:
        "Tune only on smoke+tune. Observe holdout after an optimization decision is frozen.",
    },
    checksums: {
      labels_sha256: labelsDigest(records),
      source_records_sha256: sourceRecordsDigest(records),
      records_sha256: recordsDigest(records),
      selection_sql_sha256: sha256(query),
      source_columns_sha256: canonicalSha256(SOURCE_COLUMNS),
    },
    records,
  };
  return validateCorpus(corpus);
}

function generateStratifiedCorpus() {
  return buildStratifiedCorpus(queryRows(stratifiedCubicQuery()));
}

function replayStratifiedCorpus(corpus) {
  validateStratifiedCorpus(corpus);
  const replayedSources = queryRows(replayQuery(corpus));
  if (replayedSources.length !== corpus.records.length) {
    throw new Error(
      `LMFDB replay returned ${replayedSources.length} of ${corpus.records.length} records`,
    );
  }
  const expectedSources = corpus.records.map(sourceRecord);
  const expected = canonicalSha256(expectedSources);
  const observed = canonicalSha256(replayedSources);
  if (expected !== observed || observed !== corpus.checksums.source_records_sha256) {
    throw new Error(`LMFDB replay source digest changed: ${observed}`);
  }
  return { records: replayedSources.length, source_records_sha256: observed };
}

function main(argv) {
  const options = parseArguments(argv);
  if (options.mode === "check") {
    const corpus = validateCorpus(
      JSON.parse(fs.readFileSync(path.resolve(options.fixture), "utf8")),
    );
    console.log(`LMFDB number-field corpus is valid (${corpus.records.length} records)`);
    return corpus;
  }
  if (options.mode === "replay") {
    const corpus = JSON.parse(fs.readFileSync(path.resolve(options.fixture), "utf8"));
    const result = replayStratifiedCorpus(corpus);
    console.log(
      `LMFDB cubic corpus replay is exact (${result.records} records, ${result.source_records_sha256})`,
    );
    return result;
  }
  const corpus =
    options.mode === "generate-cubic-100"
      ? generateStratifiedCorpus()
      : download(options);
  fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(corpus, null, 2)}\n`);
  console.log(`Wrote ${corpus.records.length} LMFDB records to ${options.output}`);
  return corpus;
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  CANARY_LABEL,
  LEGACY_LABELS,
  LEGACY_SCHEMA,
  SELECTION_SEED,
  SOURCE_COLUMNS,
  STRATIFIED_SCHEMA,
  buildStratifiedCorpus,
  canonicalJson,
  canonicalSha256,
  downloadQuery,
  labelsDigest,
  main,
  parseArguments,
  recordsDigest,
  replayQuery,
  replayStratifiedCorpus,
  sha256,
  sourceRecord,
  sourceRecordsDigest,
  stratifiedCubicQuery,
  validateCorpus,
};
