#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { authenticatePreparedBundle } = require("./prepared_nf_authentication.cjs");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST = path.join(__dirname, "development-default-driver-manifest.json");
const SOURCE = path.join(__dirname, "mixed_cubic_presentation.py");
const SCHEMA = "sagejs.pari-class-group/mixed-cubic-presentation-v1";
const FIELD_ID = "3.1.1005907102200.3";
const W0_SHA256 = "6e872fc1cf4765b30782ac32f2a0d7db5fc21c8b22721a976276708ddb084d92";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const DIGEST = /^[0-9a-f]{64}$/;
class Row18RetryFailure extends Error {}
function fail(message) { throw new Row18RetryFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function arraySha(values) { return sha(Buffer.from(values.join("\n"))); }
function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} has the wrong length`);
  return value.map((entry, index) => {
    if (!INTEGER.test(String(entry))) fail(`${label}[${index}] is not canonical integer data`);
    return String(entry);
  });
}
function strictParse(bytes, label) {
  const program = String.raw`import json,sys
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate JSON key: '+key)
  out[key]=value
 return out
value=json.load(sys.stdin,object_pairs_hook=strict)
if not isinstance(value,dict): raise ValueError('not an object')
json.dump(value,sys.stdout,separators=(',',':'))`;
  const parsed = spawnSync("python3", ["-c", program], {
    cwd: ROOT, input: bytes, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (parsed.status !== 0) fail(`${label} is not strict JSON`);
  return JSON.parse(parsed.stdout);
}
function argumentsOf(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    values[argv[index].slice(2)] = argv[index + 1];
  }
  if (Object.keys(values).sort().join() !== ["output-dir", "pristine-sha256", "pristine-w0"].sort().join())
    fail("required arguments are --pristine-w0, --pristine-sha256, --output-dir");
  return values;
}

function verifyOwner(owner, ancestry = null) {
  if (!owner || owner.schema !== SCHEMA || owner.field?.id !== FIELD_ID || owner.field?.panelIndex !== 18)
    fail("wrong row-18 retry identity");
  if (JSON.stringify(owner.field.polynomial) !== JSON.stringify(["-7353960", "177570", "0", "1"]) ||
      JSON.stringify(owner.field.signature) !== "[1,1]" || owner.field.discriminant !== "-1005907102200")
    fail("row-18 field identity changed");
  if (ancestry && JSON.stringify(owner.ancestry) !== JSON.stringify(ancestry)) fail("row-18 ancestry changed");
  for (const value of Object.values(owner.ancestry || {})) if (!DIGEST.test(value)) fail("invalid ancestry digest");
  if (JSON.stringify(owner.dimensions) !== JSON.stringify({degree: 3, places: 2,
      factorBaseSize: 41, relationCount: 50, kernelRank: 9, unitRank: 1,
      subfactorCount: 4})) fail("row-18 dimensions changed");
  if (JSON.stringify(owner.retryPasses?.map(pass => [pass.relationCount,
      pass.newRelations || 0, pass.acceptanceCode, pass.candidateClassNumber])) !==
      JSON.stringify([[47, 0, 1, "36"], [50, 3, 0, "18"]])) fail("row-18 retry schedule changed");
  const factors = owner.factorBase || {};
  const descriptors = integers(factors.descriptors, 16 * 41, "factor descriptors");
  const ideals = integers(factors.ideals, 9 * 41, "factor ideals");
  integers(factors.norms, 41, "factor norms");
  if (factors.descriptorsSha256 !== arraySha(descriptors) || factors.idealsSha256 !== arraySha(ideals))
    fail("factor owner digest changed");
  const relations = owner.relations || {};
  const matrix = integers(relations.matrix, 41 * 50, "relations");
  integers(relations.principalGenerators, 3 * 50, "generators");
  integers(relations.packedLogs, 2 * 50 * 7, "logs");
  if (relations.matrixSha256 !== arraySha(matrix) || relations.scalarPrefixCount !== 13)
    fail("relation owner changed");
  const presentation = owner.presentation || {};
  const P = integers(presentation.matrix, 41 * 41, "presentation").map(BigInt);
  const T = integers(presentation.rawToKernel, 50 * 9, "kernel map").map(BigInt);
  const V = integers(presentation.relationToPresentation, 50 * 41, "presentation map").map(BigInt);
  integers(presentation.kernelLogs, 2 * 9 * 7, "kernel logs");
  integers(presentation.relationLattice, 9, "rank-one lattice");
  if (presentation.classNumber !== "18" || JSON.stringify(presentation.invariants) !== '["18"]')
    fail("row-18 class presentation changed");
  const R = matrix.map(BigInt);
  for (let column = 0; column < 9; column += 1) for (let row = 0; row < 41; row += 1) {
    let value = 0n;
    for (let source = 0; source < 50; source += 1) value += R[41 * source + row] * T[50 * column + source];
    if (value !== 0n) fail("R*T is not zero");
  }
  for (let column = 0; column < 41; column += 1) for (let row = 0; row < 41; row += 1) {
    let value = 0n;
    for (let source = 0; source < 50; source += 1) value += R[41 * source + row] * V[50 * column + source];
    if (value !== P[41 * column + row]) fail("R*V is not P");
  }
  if (JSON.stringify(owner.replay?.initialHnfState) !== "[3,9,38,0,6,3,0,47,0]" ||
      JSON.stringify(owner.replay?.terminalHnfState) !== "[2,11,39,0,9,1,0,50,0]" ||
      !owner.replay?.allPrincipalRelationsReplayed || !owner.replay?.computedBeforeExpectedComparison)
    fail("row-18 retry replay changed");
  if (owner.completion?.publicComplete !== false || owner.completion?.correspondenceComplete !== false ||
      owner.completion?.presentationComplete !== true) fail("row-18 completion boundary changed");
  return true;
}

function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row18-mixed-cubic-retry-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing immutable row-18 owner changed");
  } else {
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination);
      fs.chmodSync(destination, 0o444);
    } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { schema: SCHEMA, path: destination, sha256: digest, bytes: bytes.length };
}

function main() {
  const options = argumentsOf(process.argv);
  if (options["pristine-sha256"] !== W0_SHA256) fail("wrong pristine row-18 digest");
  const selected = path.resolve(options["pristine-w0"]);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== W0_SHA256) fail("pristine row-18 digest changed");
  const w0 = strictParse(bytes, "pristine row-18 W0");
  const record = JSON.parse(fs.readFileSync(MANIFEST)).records.find(entry => entry.panelIndex === 18);
  if (!record || record.sha256 !== W0_SHA256 || record.bytes !== bytes.length ||
      path.basename(selected) !== record.filename || sha(Buffer.from(JSON.stringify(w0.prepared))) !== record.preparedSha256 ||
      sha(Buffer.from(JSON.stringify(w0.events))) !== record.eventsSha256 ||
      sha(Buffer.from(JSON.stringify(w0.events.at(-1)))) !== record.terminalResultSha256)
    fail("row-18 W0 is detached from the frozen manifest");
  const prepared = authenticatePreparedBundle(w0);
  const ancestry = { pristineW0Sha256: W0_SHA256, preparedSha256: record.preparedSha256,
    eventsSha256: record.eventsSha256, terminalResultSha256: record.terminalResultSha256,
    preparedAuthoritySha256: prepared.sha256, sourceSha256: sha(fs.readFileSync(SOURCE)) };
  const program = String.raw`import hashlib,importlib,json,sys
data=open(sys.argv[1],'rb').read()
if hashlib.sha256(data).hexdigest()!=sys.argv[2]: raise ValueError('W0 changed after authentication')
w=json.loads(data); ancestry=json.load(sys.stdin);sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.mixed_cubic_presentation')
o=m.compose_two_pass_mixed_cubic_presentation(w,ancestry,panel_index=18,field_id='3.1.1005907102200.3',subfactor_count=4)
json.dump(o,sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("python3", ["-c", program, selected, W0_SHA256], { cwd: ROOT,
    input: JSON.stringify(ancestry), encoding: "utf8", timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "row-18 retry replay");
  verifyOwner(owner, ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { Row18RetryFailure, SCHEMA, verifyOwner, publish };
