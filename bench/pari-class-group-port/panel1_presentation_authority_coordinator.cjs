#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { authenticatePreparedBundle } = require("./prepared_nf_authentication.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "panel1_presentation_authority.py");
const MANIFEST = path.join(__dirname, "development-default-driver-manifest.json");
const SCHEMA = "sagejs.pari-class-group/panel1-presentation-authority-v1";
const FIELD_ID = "generated-sha256-dec56e7e41f5f60071249da2e66871ed837a3c6e65d821c328e7b4c57adaff3f";
const W0_SHA256 = "f043f34a7c732269791a3c8c16cb3b30767b84ecec3c340659433d53f05aeb72";
const DIGEST = /^[0-9a-f]{64}$/;
const INTEGER = /^-?(0|[1-9][0-9]*)$/;

class Panel1PresentationFailure extends Error {}
function fail(message) { throw new Panel1PresentationFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function arraySha(values) { return sha(Buffer.from(values.join("\n"))); }

function argumentsOf(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(result, key)) fail(`duplicate --${key}`);
    result[key] = argv[index + 1];
  }
  const required = ["pristine-w0", "pristine-sha256", "output-dir"];
  if (Object.keys(result).sort().join("\0") !== required.sort().join("\0"))
    fail(`required arguments are ${required.map(key => `--${key}`).join(", ")}`);
  return result;
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
    if ((typeof entry !== "string" && typeof entry !== "number") ||
        !INTEGER.test(String(entry)) ||
        (typeof entry === "number" && (!Number.isSafeInteger(entry) || String(entry) !== String(Number(entry)))))
      fail(`${label}[${index}] is not canonical integer data`);
    return String(entry);
  });
}

function verifyOwner(owner, expectedAncestry = null) {
  if (!owner || typeof owner !== "object" || Array.isArray(owner) || owner.schema !== SCHEMA ||
      owner.field?.id !== FIELD_ID) fail("wrong presentation identity");
  if (JSON.stringify(owner.field.polynomial) !== JSON.stringify(["20018", "-20010", "0", "1"]) ||
      JSON.stringify(owner.field.signature) !== JSON.stringify([3, 0]) ||
      owner.field.discriminant !== "3559689395028" || owner.field.index !== "3")
    fail("field identity changed");
  integers(owner.field.basis, 9, "integral basis");
  integers(owner.field.multiplicationTensor, 27, "multiplication tensor");
  integers(owner.field.embeddingM, 27, "embedding M");
  integers(owner.field.embeddingG, 27, "embedding G");
  integers(owner.field.roundedEmbedding, 9, "rounded embedding");
  if (JSON.stringify(owner.field.rootIntervals) !== JSON.stringify([
    ["-142", "-141"], ["1", "2"], ["140", "141"],
  ])) fail("root isolation changed");
  const dimensions = owner.dimensions;
  if (JSON.stringify(dimensions) !== JSON.stringify({
    degree: 3, places: 3, factorBaseSize: 51, relationCount: 58,
    kernelRank: 7, unitRank: 2,
  })) fail("presentation dimensions changed");
  if (expectedAncestry && JSON.stringify(owner.ancestry) !== JSON.stringify(expectedAncestry))
    fail("presentation ancestry changed");
  for (const value of Object.values(owner.ancestry || {}))
    if (!DIGEST.test(value)) fail("presentation ancestry contains an invalid digest");

  const factors = owner.factorBase || {};
  if (factors.descriptorWidth !== 16 || factors.idealShape?.join(",") !== "3,3,51")
    fail("factor-base shape changed");
  const descriptors = integers(factors.descriptors, 16 * 51, "Vbase descriptors");
  const ideals = integers(factors.ideals, 9 * 51, "factor ideals");
  integers(factors.norms, 51, "factor norms");
  if (factors.descriptorsSha256 !== arraySha(descriptors) ||
      factors.idealsSha256 !== arraySha(ideals)) fail("factor-base digest changed");

  const relations = owner.relations || {};
  if (relations.matrixShape?.join(",") !== "51,58" ||
      relations.principalGeneratorsShape?.join(",") !== "3,58" ||
      relations.packedLogsShape?.join(",") !== "3,58,7") fail("relation shape changed");
  const matrix = integers(relations.matrix, 51 * 58, "relation matrix");
  const generators = integers(relations.principalGenerators, 3 * 58, "principal generators");
  const logs = integers(relations.packedLogs, 3 * 58 * 7, "raw packed logs");
  if (relations.matrixSha256 !== arraySha(matrix) ||
      relations.principalGeneratorsSha256 !== arraySha(generators) ||
      relations.packedLogsSha256 !== arraySha(logs)) fail("relation digest changed");

  const presentation = owner.presentation || {};
  if (presentation.matrixShape?.join(",") !== "51,51" ||
      presentation.relationToPresentationShape?.join(",") !== "58,51" ||
      presentation.rawToKernelShape?.join(",") !== "58,7" ||
      presentation.kernelLogsShape?.join(",") !== "3,7,7" ||
      presentation.relationLatticeShape?.join(",") !== "2,7")
    fail("presentation shape changed");
  const full = integers(presentation.matrix, 51 * 51, "full presentation");
  const relationToPresentation = integers(presentation.relationToPresentation, 58 * 51, "presentation transform");
  const kernel = integers(presentation.rawToKernel, 58 * 7, "raw-to-kernel transform");
  integers(presentation.kernelLogs, 3 * 7 * 7, "kernel logs");
  integers(presentation.relationLattice, 2 * 7, "relation lattice");
  integers(presentation.packedRegulator, 3, "packed regulator");
  if (presentation.classNumber !== "3" || JSON.stringify(presentation.invariants) !== '["3"]')
    fail("computed class presentation changed");
  if (presentation.matrixSha256 !== arraySha(full) ||
      presentation.rawToKernelSha256 !== arraySha(kernel)) fail("presentation digest changed");
  const R = matrix.map(BigInt), T = kernel.map(BigInt), V = relationToPresentation.map(BigInt);
  for (let column = 0; column < 7; column += 1) for (let row = 0; row < 51; row += 1) {
    let value = 0n;
    for (let source = 0; source < 58; source += 1)
      value += R[51 * source + row] * T[58 * column + source];
    if (value !== 0n) fail("relation times kernel is not zero");
  }
  for (let column = 0; column < 51; column += 1) for (let row = 0; row < 51; row += 1) {
    let value = 0n;
    for (let source = 0; source < 58; source += 1)
      value += R[51 * source + row] * V[58 * column + source];
    if (value !== BigInt(full[51 * column + row])) fail("relation presentation witness changed");
  }

  const replay = owner.replay || {};
  const cleanup = integers(replay.cleanupTransform, 58 * 58, "cleanup transform");
  const active = integers(replay.activeRelation, 6 * 13, "active relation");
  const activeHnf = integers(replay.activeFullHnf, 6 * 13, "active HNF");
  const activeTransform = integers(replay.activeTransform, 13 * 13, "active transform");
  integers(replay.activeDiagonal, 6, "active diagonal");
  integers(replay.terminalPermutation, 51, "terminal permutation");
  if (replay.cleanupTransformSha256 !== arraySha(cleanup) ||
      replay.activeRelationSha256 !== arraySha(active) ||
      replay.activeFullHnfSha256 !== arraySha(activeHnf) ||
      replay.activeTransformSha256 !== arraySha(activeTransform))
    fail("retained transform digest changed");
  if (JSON.stringify(replay.hnfState) !== JSON.stringify([1, 8, 50, 0, 7, 5, 0, 58, 0]) ||
      !replay.all51DescriptorsReconstructed || !replay.all58PrincipalRelationsReplayed ||
      !replay.rawRelationsTimesKernelZero || !replay.computedBeforeExpectedComparison)
    fail("presentation replay changed");
  if (JSON.stringify(owner.comparison) !== JSON.stringify({
    expectedClassNumber: "3", expectedInvariants: ["3"], matches: true,
  })) fail("post-computation comparison changed");
  return true;
}

function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `panel1-presentation-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 ||
        sha(fs.readFileSync(destination)) !== digest) fail("existing presentation changed");
  } else {
    const temporary = path.join(directory,
      `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
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
  if (!DIGEST.test(options["pristine-sha256"]) || options["pristine-sha256"] !== W0_SHA256)
    fail("wrong pristine W0 digest");
  const selected = path.resolve(options["pristine-w0"]);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== W0_SHA256) fail("pristine W0 digest changed");
  const w0 = strictParse(bytes, "pristine W0");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST));
  const record = manifest.records.find(entry => entry.panelIndex === 1);
  if (!record || record.sha256 !== W0_SHA256 || record.bytes !== bytes.length ||
      path.basename(selected) !== record.filename || sha(Buffer.from(JSON.stringify(w0.prepared))) !== record.preparedSha256 ||
      sha(Buffer.from(JSON.stringify(w0.events))) !== record.eventsSha256 ||
      sha(Buffer.from(JSON.stringify(w0.events.at(-1)))) !== record.terminalResultSha256)
    fail("W0 is detached from the frozen development manifest");
  const prepared = authenticatePreparedBundle(w0);
  const ancestry = {
    pristineW0Sha256: W0_SHA256,
    preparedSha256: record.preparedSha256,
    eventsSha256: record.eventsSha256,
    terminalResultSha256: record.terminalResultSha256,
    preparedAuthoritySha256: prepared.sha256,
    sourceSha256: sha(fs.readFileSync(SOURCE)),
  };
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
m=importlib.import_module('bench.pari-class-group-port.panel1_presentation_authority')
json.dump(m.compose_authenticated_panel1_presentation(w,ancestry),sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("python3", ["-c", program, selected, W0_SHA256], {
    cwd: ROOT, input: JSON.stringify(ancestry), encoding: "utf8", timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "presentation replay");
  verifyOwner(owner, ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { Panel1PresentationFailure, SCHEMA, arraySha, publish, verifyOwner };
