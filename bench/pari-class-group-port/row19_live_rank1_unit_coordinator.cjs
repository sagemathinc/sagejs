#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row19_live_rank1_unit.py");
const SCHEMA = "sagejs.pari-class-group/row19-live-rank1-unit-v1";
const SOURCE_SCHEMA = "sagejs.pari-class-group/row19-terminal-continuation-owner-v1";
const ROWS = 424, COLUMNS = 430, KERNEL = 6;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => sha(Buffer.from(JSON.stringify(value)));
const integer = /^-?(0|[1-9][0-9]*)$/;

function integers(value, length, label) {
  assert(Array.isArray(value) && value.length === length, `${label} length changed`);
  return value.map((entry, index) => {
    assert(integer.test(String(entry)), `${label}[${index}] is not canonical`);
    return String(entry);
  });
}

function readTerminal(descriptor) {
  const compressed = fs.readFileSync(descriptor.path);
  assert.equal(sha(compressed), descriptor.compressedSha256);
  assert.equal(fs.statSync(descriptor.path).mode & 0o222, 0);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha(plain), descriptor.ownerSha256);
  const owner = JSON.parse(plain);
  assert.equal(owner.schema, SOURCE_SCHEMA);
  assert.deepEqual(owner.state, [9, 15, 415, 0, 6, 7, 0, 430, 0]);
  assert.deepEqual(owner.relationState, ["430", "4350", "0", "0", "430", "430"]);
  assert.deepEqual(owner.acceptanceState, [2, 0, 0]);
  assert.equal(owner.classNumber, "39366");
  integers(owner.regulator, 3, "regulator");
  integers(owner.relationIdentity?.records, ROWS*COLUMNS, "relations");
  integers(owner.relationIdentity?.logs, 14*COLUMNS, "logs");
  integers(owner.relationIdentity?.generators, 3*COLUMNS, "generators");
  assert.equal(owner.publication?.oracleDataConsumed, false);
  assert.equal(owner.publication?.collectionComplete, true);
  assert.equal(owner.publication?.terminalHnfComplete, true);
  assert.equal(owner.publication?.acceptanceComplete, true);
  return { owner, plain };
}

function verifyOwner(owner, ancestry) {
  assert.equal(owner.schema, SCHEMA);
  assert.equal(owner.fieldId, "3.1.1086061775432017340256300.107");
  assert.deepEqual(owner.ancestry, ancestry);
  assert.deepEqual(owner.dimensions, { factorBaseSize: ROWS, relationCount: COLUMNS,
    kernelRank: KERNEL, unitRank: 1 });
  assert.deepEqual(owner.cleanarch?.kernelRegulatorMultiples,
    ["0", "0", "1", "1", "-1", "1"]);
  assert.deepEqual(owner.cleanarch?.bezoutTransform, ["0", "0", "0", "0", "0", "1"]);
  assert.equal(owner.cleanarch?.gcd, "1");
  assert.equal(owner.cleanarch?.residualBound, "2^-120");
  assert.equal(owner.cleanarch?.allResidualsCertified, true);
  const exponents = integers(owner.factoredUnit?.relationExponents, COLUMNS, "unit exponents");
    const inverse = integers(owner.factoredUnit?.inverseRelationExponents,
      COLUMNS, "inverse exponents");
  assert.deepEqual(inverse, exponents.map(value => String(-BigInt(value))));
  assert.equal(owner.factoredUnit.nonzeroExponents, 352);
  assert.equal(owner.factoredUnit.maximumExponentBits, 20);
  assert.equal(owner.factoredUnit.relationDependencyVerified, true);
  assert.equal(owner.factoredUnit.exactNorm, "1");
  assert.equal(owner.factoredUnit.exactInverseNorm, "1");
  assert.equal(owner.factoredUnit.inverseProduct, "1");
  assert.equal(owner.factoredUnit.inverseVerified, true);
  assert.equal(owner.factoredUnit.expanded, false);
  assert.deepEqual(owner.outcome, { status: "success", precisionBits: 192,
    fundamentalUnitDerived: true, usedFrozenW0: false, usedExpandedUnit: false });
  return owner;
}

function publish(owner, outputDir) {
  const plain = Buffer.from(`${JSON.stringify(owner)}\n`);
  const ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const compressedSha256 = sha(compressed);
  fs.mkdirSync(outputDir, { recursive: true });
  const destination = path.join(outputDir, `row19-live-rank1-unit-${ownerSha256}.json.gz`);
  try { fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(fs.readFileSync(destination), compressed);
  }
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256, compressedSha256,
    bytes: plain.length, compressedBytes: compressed.length };
}

function compose(descriptor, outputDir) {
  const { owner: terminal } = readTerminal(descriptor);
  const identity = terminal.relationIdentity;
  const ancestry = {
    terminalOwnerSha256: descriptor.ownerSha256,
    terminalCompressedSha256: descriptor.compressedSha256,
    sourceSha256: sha(fs.readFileSync(SOURCE)),
    relationsSha256: hash(identity.records),
    logsSha256: hash(identity.logs),
    generatorsSha256: hash(identity.generators),
    regulatorSha256: hash(terminal.regulator),
  };
  const run = spawnSync("python3", [SOURCE], { cwd: ROOT,
    input: JSON.stringify({ terminal, ancestry }), encoding: "utf8",
    timeout: 600_000, maxBuffer: 16*1024*1024 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const unit = verifyOwner(JSON.parse(run.stdout), ancestry);
  const exponents = unit.factoredUnit.relationExponents.map(BigInt);
  const records = identity.records.map(BigInt);
  for (let row = 0; row < ROWS; row += 1) {
    let value = 0n;
    for (let column = 0; column < COLUMNS; column += 1)
      value += records[column*ROWS + row] * exponents[column];
    assert.equal(value, 0n, `dependency row ${row} changed`);
  }
  return { ...publish(unit, outputDir), ancestry,
    exponentSha256: hash(unit.factoredUnit.relationExponents),
    inverseExponentSha256: hash(unit.factoredUnit.inverseRelationExponents) };
}

function argumentsOf(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    assert(argv[index].startsWith("--") && index + 1 < argv.length, "invalid arguments");
    values[argv[index].slice(2)] = argv[index + 1];
  }
  for (const name of ["terminal-owner", "terminal-sha256", "terminal-compressed-sha256", "output-dir"])
    assert(values[name], `missing --${name}`);
  return values;
}

function main() {
  const options = argumentsOf(process.argv);
  const descriptor = { path: path.resolve(options["terminal-owner"]),
    ownerSha256: options["terminal-sha256"],
    compressedSha256: options["terminal-compressed-sha256"] };
  process.stdout.write(`${JSON.stringify(compose(descriptor,
    path.resolve(options["output-dir"]))) }\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
}

module.exports = { SCHEMA, compose, publish, readTerminal, verifyOwner };
