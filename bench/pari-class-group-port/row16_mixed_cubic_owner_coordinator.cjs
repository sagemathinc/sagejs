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
const FIELD_ID = "3.1.1002718428660.2";
const PANEL_INDEX = 16;
const W0_SHA256 = "8ec0387525e4e3f34eb6431ede35b7438b19c4a8f208dc76da682821a14756ce";
const DIGEST = /^[0-9a-f]{64}$/;
const INTEGER = /^-?(0|[1-9][0-9]*)$/;

class Row16OwnerFailure extends Error {}
function fail(message) { throw new Row16OwnerFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function arraySha(values) { return sha(Buffer.from(values.join("\n"))); }

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

function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} has the wrong length`);
  return value.map((entry, index) => {
    if (!INTEGER.test(String(entry))) fail(`${label}[${index}] is not canonical integer data`);
    return String(entry);
  });
}

function verifyOwner(owner, ancestry = null) {
  if (!owner || owner.schema !== SCHEMA || owner.field?.id !== FIELD_ID ||
      owner.field?.panelIndex !== PANEL_INDEX) fail("wrong row-16 owner identity");
  if (JSON.stringify(owner.field.polynomial) !== JSON.stringify(["-73393658", "-146523", "0", "1"]) ||
      JSON.stringify(owner.field.signature) !== "[1,1]" || owner.field.discriminant !== "-1002718428660")
    fail("row-16 field identity changed");
  if (ancestry && JSON.stringify(owner.ancestry) !== JSON.stringify(ancestry))
    fail("row-16 ancestry changed");
  for (const value of Object.values(owner.ancestry || {})) if (!DIGEST.test(value))
    fail("row-16 ancestry digest is invalid");
  const d = owner.dimensions || {};
  if (JSON.stringify(d) !== JSON.stringify({degree: 3, places: 2, factorBaseSize: 48,
      relationCount: 54, kernelRank: 6, unitRank: 1, subfactorCount: 3}))
    fail("row-16 dimensions changed");
  const factors = owner.factorBase || {};
  const descriptors = integers(factors.descriptors, 16 * 48, "factor descriptors");
  const ideals = integers(factors.ideals, 9 * 48, "factor ideals");
  integers(factors.norms, 48, "factor norms");
  if (factors.descriptorsSha256 !== arraySha(descriptors) || factors.idealsSha256 !== arraySha(ideals))
    fail("row-16 factor owner digest changed");
  const relations = owner.relations || {};
  const matrix = integers(relations.matrix, 48 * 54, "relation matrix");
  integers(relations.principalGenerators, 3 * 54, "principal generators");
  integers(relations.packedLogs, 2 * 54 * 7, "packed logs");
  if (relations.matrixSha256 !== arraySha(matrix) || relations.scalarPrefixCount !== 15)
    fail("row-16 relation owner changed");
  const presentation = owner.presentation || {};
  const P = integers(presentation.matrix, 48 * 48, "presentation").map(BigInt);
  const T = integers(presentation.rawToKernel, 54 * 6, "kernel map").map(BigInt);
  const V = integers(presentation.relationToPresentation, 54 * 48, "presentation map").map(BigInt);
  integers(presentation.kernelLogs, 2 * 6 * 7, "kernel logs");
  integers(presentation.relationLattice, 6, "rank-one lattice");
  if (presentation.classNumber !== "27" || JSON.stringify(presentation.invariants) !== '["3","3","3"]')
    fail("row-16 computed class presentation changed");
  const R = matrix.map(BigInt);
  for (let column = 0; column < 6; column += 1) for (let row = 0; row < 48; row += 1) {
    let value = 0n;
    for (let source = 0; source < 54; source += 1) value += R[54 * 0 + 48 * source + row] * T[54 * column + source];
    if (value !== 0n) fail("R*T is not zero");
  }
  for (let column = 0; column < 48; column += 1) for (let row = 0; row < 48; row += 1) {
    let value = 0n;
    for (let source = 0; source < 54; source += 1) value += R[48 * source + row] * V[54 * column + source];
    if (value !== P[48 * column + row]) fail("R*V is not P");
  }
  if (JSON.stringify(owner.replay?.hnfState) !== "[3,9,45,0,6,3,0,54,0]" ||
      !owner.replay?.allDescriptorsReconstructed || !owner.replay?.allPrincipalRelationsReplayed ||
      !owner.replay?.computedBeforeExpectedComparison) fail("row-16 replay evidence changed");
  if (JSON.stringify(owner.completion) !== JSON.stringify({presentationComplete: true,
      classWitnessesComplete: false, unitsComplete: false, correspondenceComplete: false,
      publicComplete: false})) fail("row-16 completion boundary changed");
  return true;
}

function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row16-mixed-cubic-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing immutable row-16 owner changed");
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
  if (options["pristine-sha256"] !== W0_SHA256) fail("wrong pristine row-16 digest");
  const selected = path.resolve(options["pristine-w0"]);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== W0_SHA256) fail("pristine row-16 digest changed");
  const w0 = strictParse(bytes, "pristine row-16 W0");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST));
  const record = manifest.records.find(entry => entry.panelIndex === PANEL_INDEX);
  if (!record || record.sha256 !== W0_SHA256 || record.bytes !== bytes.length ||
      path.basename(selected) !== record.filename ||
      sha(Buffer.from(JSON.stringify(w0.prepared))) !== record.preparedSha256 ||
      sha(Buffer.from(JSON.stringify(w0.events))) !== record.eventsSha256 ||
      sha(Buffer.from(JSON.stringify(w0.events.at(-1)))) !== record.terminalResultSha256)
    fail("row-16 W0 is detached from the frozen manifest");
  const prepared = authenticatePreparedBundle(w0);
  const ancestry = { pristineW0Sha256: W0_SHA256, preparedSha256: record.preparedSha256,
    eventsSha256: record.eventsSha256, terminalResultSha256: record.terminalResultSha256,
    preparedAuthoritySha256: prepared.sha256, sourceSha256: sha(fs.readFileSync(SOURCE)) };
  const program = String.raw`import hashlib,importlib,json,sys
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate JSON key: '+key)
  out[key]=value
 return out
data=open(sys.argv[1],'rb').read()
if hashlib.sha256(data).hexdigest()!=sys.argv[2]: raise ValueError('W0 changed after authentication')
w=json.loads(data,object_pairs_hook=strict); ancestry=json.load(sys.stdin,object_pairs_hook=strict)
sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.mixed_cubic_presentation')
o=m.compose_one_pass_mixed_cubic_presentation(w,ancestry,panel_index=16,field_id='3.1.1002718428660.2',subfactor_count=3)
json.dump(o,sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("python3", ["-c", program, selected, W0_SHA256], {
    cwd: ROOT, input: JSON.stringify(ancestry), encoding: "utf8", timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "row-16 replay");
  verifyOwner(owner, ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { Row16OwnerFailure, SCHEMA, verifyOwner, publish };
