#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { authenticatePreparedBundle } = require("./prepared_nf_authentication.cjs");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST = path.join(__dirname, "development-default-driver-manifest.json");
const SOURCE = path.join(__dirname, "row34_real_cubic_presentation.py");
const SCHEMA = "sagejs.pari-class-group/row34-real-cubic-presentation-v1";
const DIGEST = /^[0-9a-f]{64}$/;
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const FIELDS = {
  3: { id: "generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9",
    filename: "panel-03-aae73048ee765ce3.json", w0: "8ef5cd64a3baaf0ff6f3e57951cdb0d1a7549879aef6dd089d5a69b39da970b9",
    polynomial: ["20000000042", "-20000000022", "0", "1"], rows: 668, columns: 675,
    width: 2, classNumber: "6", invariants: ["6"], state: [2, 9, 666, 0, 7, 69, 0, 675, 0], scalarPrefix: 116 },
  4: { id: "generated-sha256-806defcf929c9cfff7467b8e7ea7b9f939cdd042bce8c1f5a310f5688904e3b9",
    filename: "panel-04-beb19c9584069e83.json", w0: "acebe2f9f4bdfc0c3da76ab6d9ad1aa409a1fb0bfd4113ebec9b825c432e2cb8",
    polynomial: ["20000000018", "-20000000010", "0", "1"], rows: 560, columns: 567,
    width: 1, classNumber: "2", invariants: ["2"], state: [1, 8, 559, 0, 7, 65, 0, 567, 0], scalarPrefix: 107 },
};

class Row34PresentationFailure extends Error {}
function fail(message) { throw new Row34PresentationFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function arraySha(values) { return sha(Buffer.from(values.join("\n"))); }

function argumentsOf(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(values, key)) fail(`duplicate --${key}`);
    values[key] = argv[index + 1];
  }
  const required = ["panel-index", "pristine-w0", "pristine-sha256", "output-dir"];
  if (Object.keys(values).sort().join("\0") !== required.sort().join("\0"))
    fail(`required arguments are ${required.map(key => `--${key}`).join(", ")}`);
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
    cwd: ROOT, input: bytes, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
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

function verifyOwner(owner, expectedAncestry = null) {
  const config = FIELDS[owner?.field?.panelIndex];
  if (!config || owner.schema !== SCHEMA || owner.field.id !== config.id) fail("wrong row-3/4 owner identity");
  if (JSON.stringify(owner.field.polynomial) !== JSON.stringify(config.polynomial) ||
      JSON.stringify(owner.field.signature) !== "[3,0]") fail("row-3/4 field identity changed");
  if (expectedAncestry && JSON.stringify(owner.ancestry) !== JSON.stringify(expectedAncestry))
    fail("row-3/4 ancestry changed");
  for (const value of Object.values(owner.ancestry || {})) if (!DIGEST.test(value)) fail("invalid ancestry digest");
  const d = owner.dimensions || {};
  if (d.degree !== 3 || d.places !== 3 || d.factorBaseSize !== config.rows ||
      d.relationCount !== config.columns || d.kernelRank !== 7 || d.unitRank !== 2 ||
      d.classPresentationDimension !== config.width || d.subfactorCount !== 4)
    fail("row-3/4 dimensions changed");
  integers(owner.field.multiplicationTensor, 27, "multiplication tensor");
  const factors = owner.factorBase || {};
  const descriptors = integers(factors.descriptors, 16 * config.rows, "factor descriptors");
  const ideals = integers(factors.ideals, 9 * config.rows, "factor ideals");
  integers(factors.norms, config.rows, "factor norms");
  if (factors.descriptorsSha256 !== arraySha(descriptors) || factors.idealsSha256 !== arraySha(ideals))
    fail("factor-base digest changed");
  const relations = owner.relations || {};
  const matrix = integers(relations.matrix, config.rows * config.columns, "relation matrix");
  integers(relations.principalGenerators, 3 * config.columns, "principal generators");
  if (relations.matrixSha256 !== arraySha(matrix) || relations.scalarPrefixCount !== config.scalarPrefix)
    fail("relation owner changed");
  const presentation = owner.presentation || {};
  const W = integers(presentation.terminalW, config.width * config.width, "terminal W");
  const T = integers(presentation.rawToKernel, config.columns * 7, "kernel map").map(BigInt);
  const V = integers(presentation.rawToClassPresentation,
    config.columns * config.width, "class map").map(BigInt);
  if (presentation.terminalWSha256 !== arraySha(W) || presentation.rawToKernelSha256 !== arraySha(T.map(String)) ||
      presentation.rawToClassPresentationSha256 !== arraySha(V.map(String)) ||
      presentation.classNumber !== config.classNumber ||
      JSON.stringify(presentation.invariants) !== JSON.stringify(config.invariants)) fail("presentation changed");
  const R = matrix.map(BigInt);
  for (let column = 0; column < 7; column += 1) for (let row = 0; row < config.rows; row += 1) {
    let value = 0n;
    for (let source = 0; source < config.columns; source += 1)
      value += R[config.rows * source + row] * T[config.columns * column + source];
    if (value !== 0n) fail("R*T is not zero");
  }
  const permutation = integers(owner.replay?.terminalPermutation, config.rows, "terminal permutation").map(Number);
  for (let column = 0; column < config.width; column += 1) for (let row = 0; row < config.rows; row += 1) {
    let value = 0n;
    for (let source = 0; source < config.columns; source += 1)
      value += R[config.rows * source + row] * V[config.columns * column + source];
    const terminal = permutation.indexOf(row + 1);
    const expected = terminal >= 0 && terminal < config.width ? BigInt(W[config.width * column + terminal]) : 0n;
    if (value !== expected) fail("R*V is not embedded W");
  }
  if (JSON.stringify(owner.replay?.hnfState) !== JSON.stringify(config.state) ||
      !owner.replay?.allDescriptorsReconstructed || !owner.replay?.allPrincipalRelationsReplayed ||
      !owner.replay?.rawRelationsTimesKernelZero ||
      !owner.replay?.rawRelationsTimesClassMapEqualsEmbeddedW ||
      !owner.replay?.computedBeforeExpectedComparison || owner.comparison?.matches !== true)
    fail("row-3/4 replay evidence changed");
  const completion = { presentationComplete: true, classWitnessesComplete: false,
    unitsComplete: false, correspondenceComplete: false, publicComplete: false };
  if (JSON.stringify(owner.completion) !== JSON.stringify(completion)) fail("completion boundary changed");
  return true;
}

function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const row = owner.field.panelIndex;
  const destination = path.join(directory, `row${row}-real-cubic-presentation-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing immutable presentation owner changed");
  } else {
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination); fs.chmodSync(destination, 0o444);
    } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { schema: SCHEMA, panelIndex: row, path: destination, sha256: digest, bytes: bytes.length };
}

function main() {
  const options = argumentsOf(process.argv);
  const panelIndex = Number(options["panel-index"]);
  const config = FIELDS[panelIndex];
  if (!config || options["pristine-sha256"] !== config.w0) fail("wrong pristine row-3/4 digest");
  const selected = path.resolve(options["pristine-w0"]);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== config.w0) fail("pristine row-3/4 digest changed");
  const w0 = strictParse(bytes, "pristine row-3/4 W0");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST));
  const record = manifest.records.find(entry => entry.panelIndex === panelIndex);
  if (!record || record.id !== config.id || record.filename !== config.filename ||
      path.basename(selected) !== record.filename || record.sha256 !== config.w0 || record.bytes !== bytes.length ||
      sha(Buffer.from(JSON.stringify(w0.prepared))) !== record.preparedSha256 ||
      sha(Buffer.from(JSON.stringify(w0.events))) !== record.eventsSha256 ||
      sha(Buffer.from(JSON.stringify(w0.events.at(-1)))) !== record.terminalResultSha256)
    fail("row-3/4 W0 is detached from the frozen manifest");
  const prepared = authenticatePreparedBundle(w0);
  const ancestry = { pristineW0Sha256: config.w0, preparedSha256: record.preparedSha256,
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
m=importlib.import_module('bench.pari-class-group-port.row34_real_cubic_presentation')
o=m.compose_row34_real_cubic_presentation(w,ancestry,int(sys.argv[3]))
json.dump(o,sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("python3", ["-c", program, selected, config.w0, String(panelIndex)], {
    cwd: ROOT, input: JSON.stringify(ancestry), encoding: "utf8", timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "row-3/4 presentation replay");
  verifyOwner(owner, ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { FIELDS, Row34PresentationFailure, SCHEMA, publish, verifyOwner };
