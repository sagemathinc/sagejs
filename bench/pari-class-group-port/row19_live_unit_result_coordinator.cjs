#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row19_live_unit_result.py");
const SCHEMA = "sagejs.pari-class-group/row19-live-unit-result-v1";
const COMPACT_SCHEMA = "sagejs.pari-class-group/row19-live-rank1-unit-v1";
const TERMINAL_SCHEMA = "sagejs.pari-class-group/row19-terminal-continuation-owner-v1";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => sha(Buffer.from(JSON.stringify(value)));
const integer = /^-?(0|[1-9][0-9]*)$/;

function fail(message) { throw new Error(`row-19 live unit result: ${message}`); }

function authenticate(descriptor, schema, label) {
  if (!/^[0-9a-f]{64}$/.test(descriptor.ownerSha256) ||
      !/^[0-9a-f]{64}$/.test(descriptor.compressedSha256)) fail(`${label} digest is invalid`);
  const info = fs.statSync(descriptor.path);
  if (!info.isFile() || (info.mode & 0o222) !== 0) fail(`${label} is not immutable`);
  const compressed = fs.readFileSync(descriptor.path);
  if (sha(compressed) !== descriptor.compressedSha256) fail(`${label} compressed digest changed`);
  const plain = zlib.gunzipSync(compressed);
  if (sha(plain) !== descriptor.ownerSha256) fail(`${label} owner digest changed`);
  const owner = JSON.parse(plain);
  if (owner.schema !== schema) fail(`${label} schema changed`);
  return owner;
}

function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} length changed`);
  return value.map((entry, index) => {
    if (!integer.test(String(entry))) fail(`${label}[${index}] is not canonical`);
    return String(entry);
  });
}

function verifyOwner(owner, ancestry) {
  if (owner.schema !== SCHEMA || owner.fieldId !== "3.1.1086061775432017340256300.107")
    fail("result identity changed");
  assert.deepEqual(owner.ancestry, ancestry);
  const unit = owner.compactAlgebraicUnit;
  const exponents = integers(unit?.relationExponents, 430, "unit exponents");
  const inverse = integers(unit?.inverseRelationExponents, 430, "inverse exponents");
  assert.deepEqual(inverse, exponents.map(value => String(-BigInt(value))));
  if (unit.representation !== "signed-product-of-principal-relation-generators" ||
      unit.relationDependencyVerified !== true || unit.principalIdeal !== "1" ||
      unit.principalIdealVerified !== true || unit.exactNorm !== "1" ||
      unit.exactInverseNorm !== "1" || unit.inverseProduct !== "1" ||
      unit.inverseVerified !== true || unit.distinctNormPrimes !== 307 ||
      unit.maximumNormPrime !== "3433" || unit.allNormValuationsZero !== true)
    fail("exact compact unit certificate changed");
  const logs = owner.logCertificate;
  if (logs.regulatorResidualBound !== "2^-120" ||
      logs.productFormulaResidualBound !== "2^-160" ||
      logs.regulatorMatched !== true || logs.productFormulaVerified !== true)
    fail("log certificate changed");
  for (const pair of [...logs.unitReal, ...logs.unitImaginary, logs.regulator,
    logs.regulatorResidual, logs.productFormulaResidual]) integers(pair, 2, "exact fraction");
  assert.deepEqual(owner.materialization, {
    tag: "not_given", reason: "LARGE", precisionBits: 192, pariReasonCode: 2,
    source: "PARI-2.17.4-buch2.c:getfu/RgM_expbitprec",
    realExponents: [21, 21], maximumAllowedRealExponent: 20,
    firstRejectingPlace: 0, rankOneLllAbsoluteFactor: 1,
    expandedUnit: null, expandedInverse: null, expandedUnitsPublished: false,
    compactFactoredUnitsRetained: true, matchedFlagZero: true,
  });
  assert.deepEqual(owner.outcome, { status: "success", correspondenceComplete: true,
    publicComplete: true, usedFrozenW0: false, expandedCoordinatesRequired: false });
  return owner;
}

function publish(owner, outputDir) {
  const plain = Buffer.from(`${JSON.stringify(owner)}\n`);
  const ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const compressedSha256 = sha(compressed);
  fs.mkdirSync(outputDir, { recursive: true });
  const destination = path.join(outputDir, `row19-live-unit-result-${ownerSha256}.json.gz`);
  try { fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(fs.readFileSync(destination), compressed);
  }
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256, compressedSha256,
    bytes: plain.length, compressedBytes: compressed.length };
}

function compose(compactDescriptor, terminalDescriptor, outputDir) {
  const compact = authenticate(compactDescriptor, COMPACT_SCHEMA, "compact owner");
  const terminal = authenticate(terminalDescriptor, TERMINAL_SCHEMA, "terminal owner");
  const identity = terminal.relationIdentity;
  const ancestry = {
    compactOwnerSha256: compactDescriptor.ownerSha256,
    compactCompressedSha256: compactDescriptor.compressedSha256,
    terminalOwnerSha256: terminalDescriptor.ownerSha256,
    terminalCompressedSha256: terminalDescriptor.compressedSha256,
    producerSourceSha256: sha(fs.readFileSync(SOURCE)),
    relationsSha256: hash(identity.records), logsSha256: hash(identity.logs),
    generatorsSha256: hash(identity.generators), regulatorSha256: hash(terminal.regulator),
  };
  const run = spawnSync("python3", [SOURCE], { cwd: ROOT, encoding: "utf8",
    input: JSON.stringify({ compact, terminal, ancestry }), timeout: 600_000,
    maxBuffer: 32*1024*1024,
    env: { ...process.env,
      PYTHONPYCACHEPREFIX: "/scratch/sagejs-row19-live-unit-result-cache/pycache" } });
  if (run.status !== 0) fail(run.stderr || String(run.error));
  const owner = verifyOwner(JSON.parse(run.stdout), ancestry);
  return { ...publish(owner, outputDir), ancestry,
    exponentSha256: hash(owner.compactAlgebraicUnit.relationExponents),
    inverseExponentSha256: hash(owner.compactAlgebraicUnit.inverseRelationExponents),
    generatorNormsSha256: owner.compactAlgebraicUnit.generatorNormsSha256 };
}

function argumentsOf(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    values[argv[index].slice(2)] = argv[index + 1];
  }
  const required = ["compact-owner", "compact-sha256", "compact-compressed-sha256",
    "terminal-owner", "terminal-sha256", "terminal-compressed-sha256", "output-dir"];
  if (Object.keys(values).sort().join("\0") !== required.sort().join("\0"))
    fail(`required arguments are ${required.map(value => `--${value}`).join(", ")}`);
  return values;
}

function main() {
  const options = argumentsOf(process.argv);
  const descriptor = prefix => ({ path: path.resolve(options[`${prefix}-owner`]),
    ownerSha256: options[`${prefix}-sha256`],
    compressedSha256: options[`${prefix}-compressed-sha256`] });
  process.stdout.write(`${JSON.stringify(compose(descriptor("compact"), descriptor("terminal"),
    path.resolve(options["output-dir"])))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
}

module.exports = { SCHEMA, authenticate, compose, publish, verifyOwner };
