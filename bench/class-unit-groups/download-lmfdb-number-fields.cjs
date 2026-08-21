#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "../..");
const defaultFixture = path.join(
  repositoryRoot,
  "test/fixtures/number-field-lmfdb-cubic-class-numbers.json",
);

function usage() {
  console.log(`Usage: node ${path.relative(repositoryRoot, __filename)} MODE [options]

Modes:
  --check             validate the pinned offline fixture without networking
  --download          download one bounded, deterministically ordered corpus

Options:
  --degree N          number-field degree (default: 3)
  --disc-max N        maximum absolute discriminant (default: 100000)
  --limit N           maximum records (default: 1000)
  --output PATH       output JSON (required with --download)
  --fixture PATH      fixture checked by --check
  --help              show this text

Connection overrides use LMFDB_PGHOST, LMFDB_PGPORT, LMFDB_PGDATABASE,
LMFDB_PGUSER, and LMFDB_PGPASSWORD. Defaults are the public read-only mirror
published at https://beta.lmfdb.org/api/options.`);
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
    fixture: defaultFixture,
  };
  const values = new Set(["--degree", "--disc-max", "--limit", "--output", "--fixture"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      usage();
      process.exit(0);
    } else if (argument === "--check" || argument === "--download") {
      if (options.mode !== null) throw new Error("choose exactly one mode");
      options.mode = argument.slice(2);
    } else if (values.has(argument)) {
      if (index + 1 >= argv.length) throw new Error(`${argument} needs a value`);
      const value = argv[(index += 1)];
      if (argument === "--degree") options.degree = positiveInteger(value, argument);
      else if (argument === "--disc-max") options.discMax = positiveInteger(value, argument);
      else if (argument === "--limit") options.limit = positiveInteger(value, argument);
      else if (argument === "--output") options.output = value;
      else options.fixture = value;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (options.mode === null) throw new Error("choose --check or --download");
  if (options.mode === "download" && options.output === null) {
    throw new Error("--download requires --output");
  }
  return options;
}

function validateCorpus(corpus) {
  if (
    corpus?.schema !== "sagejs.number-fields/lmfdb-class-number-corpus-v1" ||
    !Array.isArray(corpus.records)
  ) {
    throw new Error("unsupported LMFDB number-field corpus schema");
  }
  const labels = new Set();
  let previous = null;
  for (const record of corpus.records) {
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
      record.class_group.some((value) => !Number.isInteger(value) || value < 2)
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
    const key = [record.degree, BigInt(record.discriminant_absolute), record.label];
    if (
      previous !== null &&
      (key[0] < previous[0] ||
        (key[0] === previous[0] && key[1] < previous[1]) ||
        (key[0] === previous[0] && key[1] === previous[1] && key[2] < previous[2]))
    ) {
      throw new Error("LMFDB records are not canonically ordered");
    }
    previous = key;
  }
  return corpus;
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
         class_number::text AS class_number, class_group,
         regulator::text AS regulator, torsion_order, used_grh
    FROM nf_fields
   WHERE degree = ${degree} AND disc_abs <= ${discMax}
   ORDER BY degree, disc_abs, label
   LIMIT ${limit}
) record
) TO STDOUT;`;
}

function download(options) {
  const connection = {
    host: process.env.LMFDB_PGHOST || "devmirror.lmfdb.xyz",
    port: process.env.LMFDB_PGPORT || "5432",
    database: process.env.LMFDB_PGDATABASE || "lmfdb",
    user: process.env.LMFDB_PGUSER || "lmfdb",
    password: process.env.LMFDB_PGPASSWORD || "lmfdb",
  };
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
      `--command=${downloadQuery(options)}`,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: connection.password, PGCONNECT_TIMEOUT: "10" },
      maxBuffer: 256 * 1024 * 1024,
      timeout: 600000,
    },
  );
  if (run.error || run.status !== 0) {
    throw new Error(run.error?.message || run.stderr || `psql exited ${run.status}`);
  }
  const records = run.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return validateCorpus({
    schema: "sagejs.number-fields/lmfdb-class-number-corpus-v1",
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

function main(argv) {
  const options = parseArguments(argv);
  if (options.mode === "check") {
    const corpus = validateCorpus(JSON.parse(fs.readFileSync(options.fixture, "utf8")));
    console.log(`LMFDB number-field corpus is valid (${corpus.records.length} records)`);
    return;
  }
  const corpus = download(options);
  fs.writeFileSync(options.output, `${JSON.stringify(corpus, null, 2)}\n`);
  console.log(`Wrote ${corpus.records.length} LMFDB records to ${options.output}`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = { downloadQuery, parseArguments, validateCorpus };
