#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const defaultFixture = path.join(
  root,
  "test/fixtures/number-field-lmfdb-quartic-stratified.json",
);
const SCHEMA = "sagejs.number-fields/lmfdb-quartic-stratified-corpus-v1";
const SELECTION_SEED = ":sagejs-quartic-36-v1";
const DISCRIMINANT_MINIMUM = 100_000;
const DISCRIMINANT_MAXIMUM = 100_000_000;
const ROLES = Object.freeze(["smoke", "tune", "holdout"]);
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

function sourceProjectionSql(prefix) {
  return `${prefix}.label, ${prefix}.degree,
         ARRAY(SELECT coefficient::text FROM unnest(${prefix}.coeffs) coefficient)
           AS coefficients,
         ${prefix}.disc_sign,
         ${prefix}.disc_abs::text AS discriminant_absolute,
         ${prefix}.r2,
         (${prefix}.degree - 2 * ${prefix}.r2)::integer AS r1,
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

function selectionSql() {
  return normalizeSql(`COPY (
WITH base AS (
  SELECT f.label, f.r2,
         CASE WHEN f.disc_abs <= 1000000 THEN 0
              WHEN f.disc_abs <= 10000000 THEN 1
              ELSE 2 END AS discriminant_band_index,
         CASE WHEN f.disc_abs <= 1000000 THEN 'd0-1e5-1e6'
              WHEN f.disc_abs <= 10000000 THEN 'd1-1e6-1e7'
              ELSE 'd2-1e7-1e8' END AS discriminant_band,
         CASE WHEN f.class_number = 1 THEN 0
              WHEN jsonb_array_length(f.class_group) > 1 THEN 3
              WHEN f.class_number <= 4 THEN 1
              ELSE 2 END AS class_band_index,
         CASE WHEN f.class_number = 1 THEN 'h0-trivial'
              WHEN jsonb_array_length(f.class_group) > 1 THEN 'h3-noncyclic'
              WHEN f.class_number <= 4 THEN 'h1-cyclic-small'
              ELSE 'h2-cyclic-large' END AS class_band
    FROM nf_fields f
   WHERE f.degree = 4
     AND f.disc_abs > ${DISCRIMINANT_MINIMUM}
     AND f.disc_abs <= ${DISCRIMINANT_MAXIMUM}
     AND f.class_number IS NOT NULL
     AND f.class_group IS NOT NULL
), ranked AS (
  SELECT base.*,
         row_number() OVER (
           PARTITION BY r2, discriminant_band_index, class_band_index
           ORDER BY md5(label || '${SELECTION_SEED}'), label
         ) AS selection_rank
    FROM base
), selected AS (
  SELECT label, r2, discriminant_band_index, discriminant_band,
         class_band_index, class_band, selection_rank,
         CASE mod(r2 + discriminant_band_index + class_band_index, 3)
           WHEN 0 THEN 'smoke'
           WHEN 1 THEN 'tune'
           ELSE 'holdout' END AS role
    FROM ranked
   WHERE selection_rank = 1
), records AS (
  SELECT json_build_object(
           'role', selected.role,
           'stratum', 'r2-' || selected.r2::text || ':' ||
             selected.discriminant_band || ':' || selected.class_band,
           'selection_rank', selected.selection_rank::integer,
           'discriminant_band_index', selected.discriminant_band_index,
           'class_band_index', selected.class_band_index
         ) AS selection,
         ${sourceProjectionSql("f")}
    FROM selected
    JOIN nf_fields f USING (label)
   ORDER BY f.degree, f.disc_abs, f.label
)
SELECT row_to_json(records) FROM records
) TO STDOUT;`);
}

function replaySql(corpus) {
  const labels = corpus.records.map((record) => record.label);
  for (const label of labels) {
    if (!/^4\.(0|2|4)\.[1-9][0-9]*\.[1-9][0-9]*$/.test(label)) {
      throw new Error(`unsafe quartic replay label: ${label}`);
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
  const result = childProcess.spawnSync(
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
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PGPASSWORD: connection.password,
        PGCONNECT_TIMEOUT: "10",
      },
      maxBuffer: 256 * 1024 * 1024,
      timeout: 600_000,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      result.error?.message || result.stderr || `psql exited ${result.status}`,
    );
  }
  return result.stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function sourceRecord(record) {
  const { oracle: _oracle, selection: _selection, ...source } = record;
  return source;
}

function discriminantBand(value) {
  if (value <= 1_000_000n) return [0, "d0-1e5-1e6"];
  if (value <= 10_000_000n) return [1, "d1-1e6-1e7"];
  return [2, "d2-1e7-1e8"];
}

function classBand(record) {
  if (record.class_number === "1") return [0, "h0-trivial"];
  if (record.class_group.length > 1) return [3, "h3-noncyclic"];
  if (BigInt(record.class_number) <= 4n) return [1, "h1-cyclic-small"];
  return [2, "h2-cyclic-large"];
}

function expectedRole(record) {
  const value =
    (record.r2 +
      record.selection.discriminant_band_index +
      record.selection.class_band_index) %
    3;
  return ROLES[value];
}

function validateSourceRecord(record, labels, strata) {
  if (
    typeof record.label !== "string" ||
    !/^4\.(0|2|4)\.[1-9][0-9]*\.[1-9][0-9]*$/.test(record.label) ||
    labels.has(record.label)
  ) {
    throw new Error("quartic records need unique canonical LMFDB labels");
  }
  labels.add(record.label);
  if (
    record.degree !== 4 ||
    !Array.isArray(record.coefficients) ||
    record.coefficients.length !== 5 ||
    record.coefficients.some((value) => !/^-?[0-9]+$/.test(value)) ||
    record.coefficients[4] !== "1"
  ) {
    throw new Error(`${record.label}: invalid monic quartic coefficients`);
  }
  if (![0, 1, 2].includes(record.r2) || record.r1 !== 4 - 2 * record.r2) {
    throw new Error(`${record.label}: invalid signature`);
  }
  if (Number(record.label.split(".")[1]) !== record.r1) {
    throw new Error(`${record.label}: label and signature disagree`);
  }
  const discriminant = BigInt(record.discriminant_absolute);
  if (
    discriminant <= BigInt(DISCRIMINANT_MINIMUM) ||
    discriminant > BigInt(DISCRIMINANT_MAXIMUM)
  ) {
    throw new Error(`${record.label}: discriminant is outside the corpus`);
  }
  const [bandIndex, band] = discriminantBand(discriminant);
  const [classIndex, className] = classBand(record);
  const stratum = `r2-${record.r2}:${band}:${className}`;
  if (
    !record.selection ||
    record.selection.stratum !== stratum ||
    record.selection.selection_rank !== 1 ||
    record.selection.discriminant_band_index !== bandIndex ||
    record.selection.class_band_index !== classIndex ||
    record.selection.role !== expectedRole(record) ||
    strata.has(stratum)
  ) {
    throw new Error(`${record.label}: invalid stratified selection`);
  }
  strata.add(stratum);
  const order = record.class_group.reduce(
    (product, value) => product * BigInt(value),
    1n,
  );
  if (order !== BigInt(record.class_number)) {
    throw new Error(`${record.label}: class-group order mismatch`);
  }
  for (const field of [
    "discriminant_radical",
    "equation_order_index",
    "class_number",
  ]) {
    if (!/^[1-9][0-9]*$/.test(record[field])) {
      throw new Error(`${record.label}: invalid ${field}`);
    }
  }
  if (
    record.unit_rank !== 3 - record.r2 ||
    !Number.isInteger(record.torsion_order) ||
    record.torsion_order < 1 ||
    typeof record.used_grh !== "boolean"
  ) {
    throw new Error(`${record.label}: invalid unit metadata`);
  }
}

function validateOracle(record) {
  const oracle = record.oracle;
  if (
    !oracle ||
    oracle.proof !== "unconditional" ||
    oracle.field_discriminant !==
      String(BigInt(record.discriminant_absolute) * BigInt(record.disc_sign)) ||
    canonicalJson(oracle.signature) !== canonicalJson([record.r1, record.r2]) ||
    oracle.class_number !== record.class_number ||
    canonicalJson(oracle.class_group) !== canonicalJson(record.class_group)
  ) {
    throw new Error(
      `${record.label}: Sage/PARI oracle mismatch: ` +
        JSON.stringify({
          lmfdb: {
            discriminant: String(
              BigInt(record.discriminant_absolute) * BigInt(record.disc_sign),
            ),
            signature: [record.r1, record.r2],
            class_number: record.class_number,
            class_group: record.class_group,
          },
          oracle,
        }),
    );
  }
}

function validateCorpus(corpus) {
  if (corpus?.schema !== SCHEMA || !Array.isArray(corpus.records)) {
    throw new Error("unsupported stratified quartic corpus schema");
  }
  if (corpus.records.length !== 36) {
    throw new Error("the stratified quartic corpus must contain 36 records");
  }
  const labels = new Set();
  const strata = new Set();
  let previousDiscriminant = 0n;
  for (const record of corpus.records) {
    validateSourceRecord(record, labels, strata);
    validateOracle(record);
    const discriminant = BigInt(record.discriminant_absolute);
    if (discriminant < previousDiscriminant) {
      throw new Error("quartic records are not canonically ordered");
    }
    previousDiscriminant = discriminant;
  }
  const roleCounts = Object.fromEntries(
    ROLES.map((role) => [
      role,
      corpus.records.filter((record) => record.selection.role === role).length,
    ]),
  );
  if (ROLES.some((role) => roleCounts[role] !== 12)) {
    throw new Error(`invalid quartic role counts: ${JSON.stringify(roleCounts)}`);
  }
  for (const r2 of [0, 1, 2]) {
    for (const discriminantIndex of [0, 1, 2]) {
      for (const classIndex of [0, 1, 2, 3]) {
        const found = corpus.records.some(
          (record) =>
            record.r2 === r2 &&
            record.selection.discriminant_band_index === discriminantIndex &&
            record.selection.class_band_index === classIndex,
        );
        if (!found) throw new Error("quartic stratum coverage is incomplete");
      }
    }
  }
  const query = selectionSql();
  const expectedChecksums = {
    labels_sha256: sha256(
      `${corpus.records.map((record) => record.label).join("\n")}\n`,
    ),
    source_records_sha256: canonicalSha256(corpus.records.map(sourceRecord)),
    oracle_records_sha256: canonicalSha256(
      corpus.records.map((record) => record.oracle),
    ),
    records_sha256: canonicalSha256(corpus.records),
    selection_sql_sha256: sha256(query),
    source_columns_sha256: canonicalSha256(SOURCE_COLUMNS),
  };
  for (const [name, value] of Object.entries(expectedChecksums)) {
    if (corpus.checksums?.[name] !== value) {
      throw new Error(`${name} mismatch: expected ${value}`);
    }
  }
  if (
    corpus.snapshot?.selection_seed !== SELECTION_SEED ||
    corpus.snapshot?.selection_sql !== query ||
    canonicalJson(corpus.source?.columns) !== canonicalJson(SOURCE_COLUMNS) ||
    corpus.tiers?.smoke !== 12 ||
    corpus.tiers?.tune !== 12 ||
    corpus.tiers?.holdout !== 12
  ) {
    throw new Error("quartic selection provenance is stale");
  }
  return corpus;
}

function pythonJson(value) {
  return JSON.stringify(JSON.stringify(value));
}

function authenticateWithSage(records, executable) {
  const source = `from sage.all import QQ, NumberField, PolynomialRing, pari
import json, sage.version

records = json.loads(${pythonJson(records.map(sourceRecord))})
R = PolynomialRing(QQ, "x")
x = R.gen()
answers = []
for position in range(len(records)):
    record = records[position]
    polynomial = R(0)
    for exponent in range(len(record["coefficients"])):
        polynomial += int(record["coefficients"][exponent]) * x**exponent
    field = NumberField(polynomial, "a" + str(position))
    field.maximal_order()
    group = field.class_group(proof=True)
    answers.append({
        "label": record["label"],
        "proof": "unconditional",
        "field_discriminant": str(field.discriminant()),
        "signature": [int(value) for value in field.signature()],
        "class_number": str(group.order()),
        # Sage lists the chosen cyclic generators in construction order, while
        # LMFDB stores invariant factors in increasing divisibility order.
        "class_group": [str(value) for value in sorted(group.invariants())],
    })
print("QUARTIC_ORACLE|" + json.dumps({
    "sage": sage.version.version,
    "pari": str(pari.version()),
    "records": answers,
}, sort_keys=True, separators=(",", ":")))
`;
  const result = childProcess.spawnSync(path.resolve(executable), ["-python", "-"], {
    cwd: root,
    encoding: "utf8",
    input: source,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 1_800_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      result.error?.message || result.stderr || `Sage exited ${result.status}`,
    );
  }
  const line = result.stdout
    .split(/\r?\n/u)
    .findLast((value) => value.startsWith("QUARTIC_ORACLE|"));
  if (!line) throw new Error("Sage emitted no quartic oracle payload");
  return JSON.parse(line.slice("QUARTIC_ORACLE|".length));
}

function buildCorpus(records, authentication, capturedAt = new Date().toISOString()) {
  if (records.length !== authentication.records.length) {
    throw new Error("Sage did not authenticate every selected quartic");
  }
  const oracleByLabel = new Map(
    authentication.records.map((record) => [record.label, record]),
  );
  const authenticated = records.map((record) => ({
    ...record,
    oracle: oracleByLabel.get(record.label),
  }));
  if (authenticated.some((record) => record.oracle === undefined)) {
    throw new Error("Sage returned the wrong quartic labels");
  }
  const query = selectionSql();
  const corpus = {
    schema: SCHEMA,
    description:
      "Versioned higher-discriminant quartic class-number corpus with signature, discriminant, class-shape, and held-out strata.",
    source: {
      table: "nf_fields",
      api_options: "https://beta.lmfdb.org/api/options",
      api_stats: "https://beta.lmfdb.org/api/stats",
      license: "CC-BY-SA-4.0",
      columns: [...SOURCE_COLUMNS],
    },
    oracle: {
      proof: "unconditional",
      sage: authentication.sage,
      pari: authentication.pari,
    },
    snapshot: {
      captured_at: capturedAt,
      selection_seed: SELECTION_SEED,
      selection_sql: query,
      canonical_ordering: ["degree", "disc_abs", "label"],
      discriminant_absolute_minimum_exclusive: String(DISCRIMINANT_MINIMUM),
      discriminant_absolute_maximum: String(DISCRIMINANT_MAXIMUM),
    },
    tiers: {
      smoke: 12,
      tune: 12,
      holdout: 12,
      policy:
        "Develop on smoke, freeze policy after smoke+tune, and inspect holdout only afterward.",
    },
    checksums: {},
    records: authenticated,
  };
  corpus.checksums = {
    labels_sha256: sha256(
      `${authenticated.map((record) => record.label).join("\n")}\n`,
    ),
    source_records_sha256: canonicalSha256(authenticated.map(sourceRecord)),
    oracle_records_sha256: canonicalSha256(
      authenticated.map((record) => record.oracle),
    ),
    records_sha256: canonicalSha256(authenticated),
    selection_sql_sha256: sha256(query),
    source_columns_sha256: canonicalSha256(SOURCE_COLUMNS),
  };
  return validateCorpus(corpus);
}

function replay(corpus) {
  validateCorpus(corpus);
  const observed = queryRows(replaySql(corpus));
  const observedDigest = canonicalSha256(observed);
  if (
    observed.length !== corpus.records.length ||
    observedDigest !== corpus.checksums.source_records_sha256
  ) {
    throw new Error(`LMFDB quartic replay changed: ${observedDigest}`);
  }
  return observedDigest;
}

function parseArguments(argv) {
  const options = {
    mode: null,
    fixture: defaultFixture,
    output: null,
    sage: process.env.SAGE_ORACLE || "/home/user/sagelite/sage",
  };
  const modes = new Map([
    ["--check", "check"],
    ["--generate", "generate"],
    ["--replay", "replay"],
    ["--dry-run", "dry-run"],
  ]);
  const values = new Set(["--fixture", "--output", "--sage"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (modes.has(argument)) {
      if (options.mode !== null) throw new Error("choose exactly one mode");
      options.mode = modes.get(argument);
    } else if (values.has(argument)) {
      if (index + 1 >= argv.length) throw new Error(`${argument} needs a value`);
      const value = argv[(index += 1)];
      if (argument === "--fixture") options.fixture = value;
      else if (argument === "--output") options.output = value;
      else options.sage = value;
    } else if (argument === "--help") {
      console.log(`Usage: node ${path.relative(root, __filename)} MODE [options]

  --check             validate the pinned fixture without networking
  --generate          select from LMFDB and authenticate with Sage/PARI
  --replay            refetch pinned labels and compare source records
  --dry-run           print the deterministic selection plan
  --fixture PATH      fixture to check or replay
  --output PATH       generated fixture path
  --sage PATH         Sage/PARI oracle launcher`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (options.mode === null) throw new Error("choose a mode");
  if (options.mode === "generate" && options.output === null) {
    throw new Error("--generate requires --output");
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.mode === "dry-run") {
    const plan = {
      schema: `${SCHEMA}/plan`,
      records: 36,
      roles: Object.fromEntries(ROLES.map((role) => [role, 12])),
      signatures: ["(4,0)", "(2,1)", "(0,2)"],
      discriminant_bands: ["1e5-1e6", "1e6-1e7", "1e7-1e8"],
      class_bands: ["trivial", "cyclic-small", "cyclic-large", "noncyclic"],
      selection_seed: SELECTION_SEED,
      selection_sql_sha256: sha256(selectionSql()),
    };
    console.log(JSON.stringify(plan, null, 2));
    return plan;
  }
  if (options.mode === "check") {
    const corpus = validateCorpus(
      JSON.parse(fs.readFileSync(path.resolve(options.fixture), "utf8")),
    );
    console.log(`Stratified quartic corpus is valid (${corpus.records.length} records)`);
    return corpus;
  }
  if (options.mode === "replay") {
    const corpus = JSON.parse(
      fs.readFileSync(path.resolve(options.fixture), "utf8"),
    );
    const digest = replay(corpus);
    console.log(`LMFDB quartic replay is exact (${digest})`);
    return digest;
  }
  if (!fs.existsSync(path.resolve(options.sage))) {
    throw new Error(`Sage oracle does not exist: ${options.sage}`);
  }
  const records = queryRows(selectionSql());
  const authentication = authenticateWithSage(records, options.sage);
  const corpus = buildCorpus(records, authentication);
  fs.writeFileSync(
    path.resolve(options.output),
    `${JSON.stringify(corpus, null, 2)}\n`,
  );
  console.log(`Wrote ${corpus.records.length} authenticated quartics`);
  return corpus;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  DISCRIMINANT_MAXIMUM,
  DISCRIMINANT_MINIMUM,
  SCHEMA,
  SELECTION_SEED,
  SOURCE_COLUMNS,
  buildCorpus,
  canonicalJson,
  canonicalSha256,
  main,
  replaySql,
  selectionSql,
  validateCorpus,
};
