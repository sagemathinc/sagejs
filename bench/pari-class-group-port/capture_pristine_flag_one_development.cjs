#!/usr/bin/env node
"use strict";

// Capture exactly one untimed PARI 2.17.4 flag-one authority for an exact
// development field selected by the frozen compact manifest.  Reserve rows
// cannot pass selection, and the prepared corpus is authenticated before the
// foreign process starts.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { authenticatePreparedNf } = require("./prepared_nf_authentication.cjs");

const HERE = __dirname;
const SOURCE = path.join(HERE, "pari_compact_flag_one_development_authority.c");
const COMPACT_MANIFEST = path.join(HERE, "compact-flag-one-manifest.json");
const CORPUS_MANIFEST = path.join(HERE, "fresh-prepared-corpus-manifest.json");
const PANEL = path.join(HERE, "panel.json");
const QUALIFICATION = path.join(HERE, "class-unit-qualification-manifest.json");
const ARCHIVE_SHA256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2_SHA256 = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const LIMIT_BYTES = 4 * 1024 * 1024 * 1024;
const LIMIT_SECONDS = 600;
const AUTHORITY_SCHEMA = "sagejs.pari-class-group/pristine-development-flag-one-authority-v1";
const OUTPUT_SCHEMA = "sagejs.pari-class-group/compact-flag-one-common-output-v1";

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function fileDigest(filename) { return sha256(fs.readFileSync(filename)); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function canonicalBytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function canonicalDigest(value) { return sha256(canonicalBytes(value)); }
function readJson(filename) { return JSON.parse(fs.readFileSync(filename, "utf8")); }
function recordedCompilerArguments() {
  return ["-O3", "-Wall", "-Wextra", "-fno-strict-aliasing", "-DNDEBUG",
    "-I$PARI_ROOT/src/headers", "-I$PARI_ROOT/Olinux-x86_64",
    "bench/pari-class-group-port/pari_compact_flag_one_development_authority.c",
    "-L$PARI_ROOT/Olinux-x86_64", "-Wl,-rpath,$PARI_ROOT/Olinux-x86_64", "-lpari", "-lm",
    "-o", "$TEMPORARY/authority"];
}
function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} is not an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} keys changed`);
}

function selectDevelopment(panelIndex, preparedPath) {
  assert(Number.isSafeInteger(panelIndex) && panelIndex >= 0, "invalid panel index");
  const compact = readJson(COMPACT_MANIFEST);
  assert.equal(compact.schema, "sagejs.pari-class-group/compact-flag-one-manifest-v1");
  assert.equal(compact.targetPariVersion, "2.17.4");
  assert.deepEqual(compact.execution, { enabled: false, timingEnabled: false,
    finalRunEnabled: false, reserveOpeningEnabled: false });
  const selected = compact.fields.find(field => field.panelIndex === panelIndex);
  assert(selected, `row ${panelIndex} is not in the compact development population`);

  const panel = readJson(PANEL);
  const row = panel.rows[panelIndex];
  assert(row, `panel row ${panelIndex} does not exist`);
  assert.deepEqual(selected, { panelIndex, id: row.id, stratum: row.stratum,
    degree: row.degree, signature: row.signature, polynomialSha256: row.polynomial_sha256 });
  assert.equal(row.coefficient_order, "ascending");
  assert.equal(row.phase, "tuning");
  const qualification = readJson(QUALIFICATION);
  const qualified = qualification.fields.find(field => field.panelIndex === panelIndex);
  assert(qualified, "selected row is absent from qualification manifest");
  assert.equal(qualified.id, row.id);
  assert.equal(qualified.role, "additional-development",
    "reserve or sentinel capture is forbidden");

  const corpus = readJson(CORPUS_MANIFEST);
  assert.equal(corpus.schema, "sagejs.pari-class-group/fresh-prepared-corpus-manifest-v1");
  const corpusRow = corpus.rows.find(candidate => candidate.panelIndex === panelIndex);
  assert(corpusRow, "selected development row has no prepared authority");
  assert.equal(corpusRow.sourceId, row.id);
  const stat = fs.statSync(preparedPath);
  assert(stat.isFile() && (stat.mode & 0o777) === 0o444,
    "prepared authority must be an immutable mode-0444 file");
  const preparedBytes = fs.readFileSync(preparedPath);
  assert.equal(preparedBytes.length, corpusRow.preparedJsonBytes);
  assert.equal(sha256(preparedBytes), corpusRow.preparedJsonSha256);
  const prepared = JSON.parse(preparedBytes);
  assert.deepEqual(Object.keys(prepared).sort(), corpus.normalizedPreparedKeys,
    "prepared authority key set changed");
  assert.deepEqual(prepared.prep_polynomial, row.coefficients,
    "prepared polynomial and selected panel row disagree");
  assert.equal(prepared.n, String(row.degree));
  assert.equal(prepared.admission_real_count, String(row.signature[0]));
  const preparedAuthority = authenticatePreparedNf(prepared);
  assert.equal(preparedAuthority.sha256, corpusRow.preparedAuthoritySha256);
  return { compact, corpusRow, prepared, preparedAuthority, row };
}

function buildProducer(pariRoot, temporary) {
  const libraryDirectory = path.join(pariRoot, "Olinux-x86_64");
  const library = fs.realpathSync(path.join(libraryDirectory, "libpari.so"));
  const executable = path.join(temporary, "authority");
  const compiler = process.env.CC || "cc";
  const compilerArgs = ["-O3", "-Wall", "-Wextra", "-fno-strict-aliasing", "-DNDEBUG",
    `-I${path.join(pariRoot, "src/headers")}`, `-I${libraryDirectory}`, SOURCE,
    `-L${libraryDirectory}`, `-Wl,-rpath,${libraryDirectory}`, "-lpari", "-lm", "-o", executable];
  const recordedCompilerArgs = recordedCompilerArguments();
  const built = spawnSync(compiler, compilerArgs, { encoding: "utf8", timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024 });
  assert.equal(built.status, 0, built.stderr || String(built.error));
  return { compiler, executable, library, recordedCompilerArgs };
}

function validateRun(run, selection) {
  exactKeys(run, ["call", "classGroup", "rng", "schema", "unitGroup", "work"], "PARI run");
  assert.equal(run.schema, "sagejs.pari-class-group/pristine-development-flag-one-run-v1");
  assert.deepEqual(run.call, { boundary: "bnfinit0(prepared_nf,1,NULL,nbits2prec(192))",
    pariVersion: ["2", "17", "4"], precisionBits: "192",
    preparation: "nfinit0(polynomial,0,nbits2prec(192))", timed: false });
  exactKeys(run.classGroup, ["classNumber", "invariantFactors"], "class group");
  assert(/^[1-9][0-9]*$/.test(run.classGroup.classNumber));
  assert(Array.isArray(run.classGroup.invariantFactors));
  assert(run.classGroup.invariantFactors.every(value => /^[2-9][0-9]*$|^[1-9][0-9]+$/.test(value)));
  if (selection.row.reference_class_number !== null) {
    assert.equal(run.classGroup.classNumber, selection.row.reference_class_number);
    assert.deepEqual(run.classGroup.invariantFactors, selection.row.reference_class_invariants);
  }
  assert.deepEqual(run.unitGroup, { materialization: "exact_units",
    rank: String(selection.row.unit_rank),
    torsionOrder: selection.prepared.analytic_roots_of_unity });
  exactKeys(run.work, ["degree", "expandedUnitCount", "factorBaseSize", "logEmbeddingColumns",
    "logEmbeddingRows", "retainedClassRows"], "work");
  assert.equal(run.work.degree, String(selection.row.degree));
  assert.equal(run.work.expandedUnitCount, String(selection.row.unit_rank));
  assert.equal(run.work.logEmbeddingColumns, String(selection.row.unit_rank));
  for (const key of ["factorBaseSize", "retainedClassRows", "logEmbeddingRows"])
    assert(/^(0|[1-9][0-9]*)$/.test(run.work[key]), `${key} is not nonnegative decimal`);
  exactKeys(run.rng, ["algorithm", "seed", "terminalState"], "RNG");
  assert.equal(run.rng.algorithm, "pari-xorshift1024star-2.17.4");
  assert.equal(run.rng.seed, "1");
  assert.equal(run.rng.terminalState.length, 66);
  assert(run.rng.terminalState.every(word => /^(0|[1-9][0-9]*)$/.test(word)));
}

function validateAuthority(authority, { panelIndex, preparedPath }) {
  const selection = selectDevelopment(panelIndex, preparedPath);
  exactKeys(authority, ["diagnosticOnly", "execution", "input", "output", "outputDigest",
    "provenance", "qualifiedTiming", "run", "schema"], "authority");
  assert.equal(authority.schema, AUTHORITY_SCHEMA);
  assert.equal(authority.diagnosticOnly, true);
  assert.equal(authority.qualifiedTiming, false);
  assert.deepEqual(authority.execution, { addressSpaceLimitBytes: String(LIMIT_BYTES), calls: 1,
    coldProcess: true, cpuLimitSeconds: String(LIMIT_SECONDS), measurements: [],
    wallTimeoutSeconds: String(LIMIT_SECONDS) });
  assert.deepEqual(authority.input, { fieldId: selection.row.id, panelIndex,
    polynomialSha256: selection.row.polynomial_sha256,
    preparedAuthoritySha256: selection.corpusRow.preparedAuthoritySha256,
    preparedJsonSha256: selection.corpusRow.preparedJsonSha256 });
  exactKeys(authority.provenance, ["archiveSha256", "buch2Sha256", "captureSourceSha256",
    "compiler", "compilerArguments", "executableSha256", "librarySha256",
    "producerSourceSha256"], "provenance");
  assert.equal(authority.provenance.archiveSha256, ARCHIVE_SHA256);
  assert.equal(authority.provenance.buch2Sha256, BUCH2_SHA256);
  assert.equal(authority.provenance.captureSourceSha256, fileDigest(__filename));
  assert.equal(authority.provenance.producerSourceSha256, fileDigest(SOURCE));
  assert.deepEqual(authority.provenance.compilerArguments, recordedCompilerArguments());
  assert.equal(authority.provenance.compiler, process.env.CC || "cc");
  const pariRoot = path.resolve(process.env.SAGEJS_PARI_ROOT || "/home/user/upstream/pari-2.17.4");
  const library = fs.realpathSync(path.join(pariRoot, "Olinux-x86_64", "libpari.so"));
  assert.equal(authority.provenance.librarySha256, fileDigest(library));
  for (const key of ["executableSha256", "librarySha256"])
    assert(/^[0-9a-f]{64}$/.test(authority.provenance[key]));
  validateRun(authority.run, selection);
  const expectedOutput = { schema: OUTPUT_SCHEMA,
    field: { id: selection.row.id,
      definingPolynomialAscending: selection.row.coefficients },
    classGroup: authority.run.classGroup, unitGroup: authority.run.unitGroup };
  assert.deepEqual(authority.output, expectedOutput);
  assert.equal(authority.outputDigest, canonicalDigest(expectedOutput));
  return { outputDigest: authority.outputDigest, selection };
}

function validateAuthorityFile(filename, options) {
  const stat = fs.statSync(filename);
  assert(stat.isFile() && (stat.mode & 0o777) === 0o444,
    "authority must be an immutable mode-0444 file");
  const bytes = fs.readFileSync(filename);
  const authority = JSON.parse(bytes);
  assert(Buffer.concat([canonicalBytes(authority), Buffer.from("\n")]).equals(bytes),
    "authority is not canonical JSON plus one newline");
  return { authority, authoritySha256: sha256(bytes), ...validateAuthority(authority, options) };
}

function capture({ panelIndex, preparedPath, output }) {
  assert.equal(process.platform, "linux");
  const selection = selectDevelopment(panelIndex, preparedPath);
  const pariRoot = path.resolve(process.env.SAGEJS_PARI_ROOT || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.env.SAGEJS_PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz");
  const buch2 = path.join(pariRoot, "src/basemath/buch2.c");
  assert.equal(fileDigest(archive), ARCHIVE_SHA256, "wrong pristine PARI archive");
  assert.equal(fileDigest(buch2), BUCH2_SHA256, "wrong pristine bnfinit source");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-pristine-development-flag-one-"));
  try {
    const producer = buildProducer(pariRoot, temporary);
    const producerArguments = [String(selection.row.degree), String(selection.row.signature[0]),
      String(selection.row.signature[1]), String(selection.row.coefficients.length),
      ...selection.row.coefficients];
    const run = spawnSync("prlimit", [`--as=${LIMIT_BYTES}`, `--cpu=${LIMIT_SECONDS}`,
      producer.executable, ...producerArguments], { encoding: "utf8", timeout: LIMIT_SECONDS * 1000,
      maxBuffer: 16 * 1024 * 1024, env: { PATH: process.env.PATH, LANG: "C", LC_ALL: "C",
        OMP_NUM_THREADS: "1", OMP_DYNAMIC: "FALSE", OPENBLAS_NUM_THREADS: "1" } });
    assert.equal(run.signal, null, `authority terminated by ${run.signal}`);
    assert.equal(run.status, 0, run.stderr || String(run.error));
    const record = JSON.parse(run.stdout);
    validateRun(record, selection);
    const projected = { schema: OUTPUT_SCHEMA,
      field: { id: selection.row.id,
        definingPolynomialAscending: selection.row.coefficients },
      classGroup: record.classGroup, unitGroup: record.unitGroup };
    const authority = { schema: AUTHORITY_SCHEMA, diagnosticOnly: true, qualifiedTiming: false,
      execution: { coldProcess: true, calls: 1, addressSpaceLimitBytes: String(LIMIT_BYTES),
        cpuLimitSeconds: String(LIMIT_SECONDS), wallTimeoutSeconds: String(LIMIT_SECONDS),
        measurements: [] },
      input: { panelIndex, fieldId: selection.row.id,
        polynomialSha256: selection.row.polynomial_sha256,
        preparedJsonSha256: selection.corpusRow.preparedJsonSha256,
        preparedAuthoritySha256: selection.corpusRow.preparedAuthoritySha256 },
      provenance: { archiveSha256: ARCHIVE_SHA256, buch2Sha256: BUCH2_SHA256,
        librarySha256: fileDigest(producer.library), producerSourceSha256: fileDigest(SOURCE),
        captureSourceSha256: fileDigest(__filename), executableSha256: fileDigest(producer.executable),
        compiler: producer.compiler, compilerArguments: producer.recordedCompilerArgs },
      run: record, output: projected, outputDigest: canonicalDigest(projected) };
    validateAuthority(authority, { panelIndex, preparedPath });
    const bytes = Buffer.concat([canonicalBytes(authority), Buffer.from("\n")]);
    fs.writeFileSync(output, bytes, { flag: "wx", mode: 0o444 });
    return { bytes: bytes.length, output: path.resolve(output), sha256: sha256(bytes),
      outputDigest: authority.outputDigest };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    assert(argv[index]?.startsWith("--") && argv[index + 1], "malformed arguments");
    const key = argv[index].slice(2);
    assert(!Object.hasOwn(values, key), `duplicate --${key}`);
    values[key] = argv[index + 1];
  }
  assert.deepEqual(Object.keys(values).sort(), ["output", "panel-index", "prepared"]);
  assert(/^(0|[1-9][0-9]*)$/.test(values["panel-index"]), "invalid --panel-index");
  return { panelIndex: Number(values["panel-index"]), preparedPath: path.resolve(values.prepared),
    output: path.resolve(values.output) };
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(capture(parseArguments(process.argv)))}\n`); }
  catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { AUTHORITY_SCHEMA, OUTPUT_SCHEMA, canonicalBytes, canonicalDigest, capture,
  parseArguments, selectDevelopment, sha256, validateAuthority, validateAuthorityFile,
  validateRun };
