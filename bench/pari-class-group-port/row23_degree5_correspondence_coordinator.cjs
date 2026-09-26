#!/usr/bin/env node
"use strict";

// Immutable coordinator for expanded row-23 ideal arithmetic.  W0 answers are
// opened only after the live owner has been composed and published.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "../..");
const SOURCE = path.join(HERE, "row23_degree5_correspondence.py");
const SCHEMA = "sagejs.pari-class-group/row23-degree5-correspondence-v1";
const CLASS_SHA256 = "beafd37a044a22ae3fdb8996993901b69aee39dec2095d444d88596344a69b50";
const FACTOR_SHA256 = "b4fa7209eb9fcd86438dc8d1f0fac9d194a32535f612de97ed605da6ca2bf439";
const PREPARED_SHA256 = "0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const canonical = value => JSON.stringify(value);

class Row23CorrespondenceFailure extends Error {}
function fail(message) { throw new Row23CorrespondenceFailure(message); }
function loadOwner(filename, expected) {
  const raw = zlib.gunzipSync(fs.readFileSync(filename));
  if (sha(raw) !== expected) fail("immutable upstream owner digest changed");
  return JSON.parse(raw);
}
function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} has wrong length`);
  return value.map((entry, index) => {
    if (!INTEGER.test(String(entry))) fail(`${label}[${index}] is not canonical`);
    return String(entry);
  });
}
function exportedInteger(value, label) {
  if (!value || value.kind !== "integer" || !INTEGER.test(String(value.value))) fail(`${label} changed`);
  return String(value.value);
}

function verifyOwner(owner) {
  if (!owner || owner.schema !== SCHEMA) fail("wrong correspondence schema");
  const a = owner.ancestry || {};
  if (a.classWitnessOwnerSha256 !== CLASS_SHA256 || a.factorOwnerSha256 !== FACTOR_SHA256 ||
      a.preparedAuthoritySha256 !== PREPARED_SHA256 || a.composerSourceSha256 !== sha(fs.readFileSync(SOURCE)))
    fail("correspondence ancestry changed");
  const witness = owner.expandedPrincipalWitness || {};
  const alpha = integers(witness.alpha, 5, "alpha");
  if (sha(Buffer.from(alpha.join("\n"))) !== witness.alphaSha256 ||
      canonical(alpha) !== '["55527","2886","-7934","-1304","695"]' ||
      witness.identity !== "J^6=(alpha)" || witness.powerIdealHnfs?.length !== 6 ||
      witness.degreeFiveIdealProductReplayComplete !== true ||
      witness.expandedPrincipalGeneratorMaterialized !== true) fail("expanded principal witness changed");
  witness.powerIdealHnfs.forEach((value, index) => integers(value, 25, `power ${index + 1}`));
  const terminal = witness.powerIdealHnfs[5];
  if (canonical(terminal) !== canonical(integers(witness.principalIdealHnf, 25, "principal ideal")))
    fail("expanded ideal identity changed");
  const reduction = owner.idealred || {};
  const reduced = integers(reduction.reducedGeneratorIdealHnf, 25, "reduced ideal");
  if (canonical(reduced) !== canonical(witness.powerIdealHnfs[0]) ||
      canonical(integers(reduction.pseudomin, 5, "pseudomin")) !== '["7","0","0","0","0"]' ||
      canonical(integers(reduction.firstLllCoefficientColumn, 5, "LLL coefficient")) !== '["1","0","0","0","0"]' ||
      reduction.scalarShortCircuit !== true || reduction.degreeFiveIdealredExecuted !== true ||
      reduction.reducedRepresentativePublished !== true) fail("degree-five idealred replay changed");
  integers(reduction.inverseScaledIdealHnf, 25, "inverse-scaled ideal");
  const sevenIdentity = Array.from({ length: 25 }, (_, index) =>
    index % 6 === 0 ? "7" : "0");
  if (canonical(integers(reduction.scaledInverseProductHnf, 25, "scaled inverse product")) !==
      canonical(sevenIdentity)) fail("scaled inverse identity changed");
  integers(reduction.roundedEmbeddingTimesInverseIdeal, 25, "GJ");
  integers(reduction.lllTransformRows, 25, "LLL transform");
  integers(reduction.lllReducedBasisRows, 25, "LLL basis");
  if (canonical(owner.completion) !== canonical({ expandedPrincipalIdentityComplete: true,
    degreeFiveIdealProductReplayComplete: true, degreeFiveIdealredComplete: true,
    reducedClassGeneratorComplete: true, postcomputeOracleConsumed: false })) fail("completion boundary changed");
  return true;
}

function compose(classOwner, factorOwner, prepared, ancestry) {
  const program = String.raw`import importlib,json,sys
sys.path.extend(['src/lib','src/baselib','.'])
m=importlib.import_module('bench.pari-class-group-port.row23_degree5_correspondence')
p=json.load(sys.stdin)
print(json.dumps(m.compose_row23_degree5_correspondence(p['classOwner'],p['factorOwner'],p['prepared'],p['ancestry']),separators=(',',':'))) `;
  const run = spawnSync("python3", ["-c", program], { cwd: ROOT, input: JSON.stringify({ classOwner, factorOwner, prepared, ancestry }),
    encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  return JSON.parse(run.stdout);
}

function publish(owner, directory) {
  verifyOwner(owner);
  const plain = Buffer.from(`${canonical(owner)}\n`), ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row23-degree5-correspondence-${ownerSha256}.json.gz`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(zlib.gunzipSync(fs.readFileSync(destination))) !== ownerSha256)
      fail("existing immutable correspondence owner changed");
  } else {
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try { fs.writeFileSync(temporary, compressed, { flag: "wx", mode: 0o400 }); fs.renameSync(temporary, destination); fs.chmodSync(destination, 0o444); }
    catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { path: destination, ownerSha256, compressedSha256: sha(compressed), owner };
}

function oracleIdeal(w0) {
  const event = w0.events?.filter(value => value?.event === "class_group_output");
  if (!Array.isArray(event) || event.length !== 1) fail("postcompute W0 class output changed");
  const matrix = event[0].clg1?.values?.[2]?.values?.[0];
  const columns = matrix?.values;
  if (!Array.isArray(columns) || columns.length !== 5) fail("postcompute W0 generator changed");
  return Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, column) =>
    exportedInteger(columns[column]?.values?.[row], "postcompute generator entry")).join("\0")).join("\0").split("\0");
}

function run(payload) {
  const allowed = ["classOwnerPath", "factorOwnerPath", "outputDirectory", "prepared", "w0Path"];
  if (!payload || canonical(Object.keys(payload).sort()) !== canonical(allowed.sort())) fail("unreviewed correspondence payload");
  const classOwner = loadOwner(payload.classOwnerPath, CLASS_SHA256);
  const factorOwner = loadOwner(payload.factorOwnerPath, FACTOR_SHA256);
  const auth = require("./prepared_nf_authentication.cjs").authenticatePreparedNf(payload.prepared);
  if (auth.sha256 !== PREPARED_SHA256) fail("prepared authority changed");
  const prepared = { multiplicationTensor: payload.prepared.basis_table.map(String),
    roundedEmbedding: payload.prepared.preparation_rounded_embedding.map(String) };
  const ancestry = { ...classOwner.ancestry, classWitnessOwnerSha256: CLASS_SHA256,
    composerSourceSha256: sha(fs.readFileSync(SOURCE)) };
  const owner = compose(classOwner, factorOwner, prepared, ancestry);
  const published = publish(owner, payload.outputDirectory);
  // This read is intentionally after publication and is not retained in owner.
  const oracle = oracleIdeal(JSON.parse(fs.readFileSync(payload.w0Path, "utf8")));
  return { ...published, postcomputeOracle: { consumedAfterPublication: true,
    reducedGeneratorMatches: canonical(oracle) === canonical(owner.idealred.reducedGeneratorIdealHnf) } };
}

module.exports = { CLASS_SHA256, FACTOR_SHA256, PREPARED_SHA256, Row23CorrespondenceFailure,
  SCHEMA, compose, loadOwner, oracleIdeal, publish, run, verifyOwner };
