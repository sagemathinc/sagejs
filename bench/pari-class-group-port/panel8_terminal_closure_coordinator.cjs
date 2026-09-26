#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { authenticatePreparedBundle } = require("./prepared_nf_authentication.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "panel8_terminal_closure.py");
const SCHEMA = "sagejs.pari-class-group/panel8-terminal-closure-v1";
const FIELD_ID = "generated-sha256-0857fab7114ab0045f1b91601101549c7b8d854c5c999b91afcb190cd2863363";
const DIGEST = /^[0-9a-f]{64}$/;
const INTEGER = /^-?(0|[1-9][0-9]*)$/;

class Panel8TerminalClosureFailure extends Error {}
function fail(message) { throw new Panel8TerminalClosureFailure(message); }
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
  const required = ["accepted-owner", "accepted-sha256", "c5-owner", "c5-sha256",
    "c6-owner", "c6-sha256", "pristine-w0", "pristine-sha256", "output-dir"];
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

function authenticate(selected, expected, label, immutable = true) {
  if (!DIGEST.test(expected)) fail(`${label} digest is invalid`);
  const info = fs.statSync(selected);
  if (!info.isFile() || (immutable && (info.mode & 0o777) !== 0o444))
    fail(`${label} is not ${immutable ? "an immutable mode-0444 " : "a "}file`);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== expected) fail(`${label} digest changed`);
  return { path: path.resolve(selected), value: strictParse(bytes, label), sha256: expected };
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
      owner.field?.id !== FIELD_ID || owner.status !== "closed") fail("wrong closure identity");
  const d = owner.dimensions;
  if (d?.factorBaseSize !== 143 || d?.relationCount !== 152 || d?.kernelRank !== 9 ||
      d?.degree !== 4 || d?.places !== 3) fail("closure dimensions changed");
  if (expectedAncestry && JSON.stringify(owner.ancestry) !== JSON.stringify(expectedAncestry))
    fail("closure ancestry changed");
  for (const value of Object.values(owner.ancestry || {}))
    if (!DIGEST.test(value)) fail("closure ancestry contains an invalid digest");
  const closure = owner.relationClosure || {};
  if (closure.transformShape?.join(",") !== "152,9" ||
      closure.rightInverseShape?.join(",") !== "152,143" ||
      closure.relationTimesTransformZero !== true ||
      closure.relationTimesRightInverseIdentity !== true)
    fail("relation closure flags changed");
  const transform = integers(closure.transform, 152 * 9, "T");
  const rightInverse = integers(closure.rightInverse, 152 * 143, "Q");
  integers(closure.terminalPermutation, 143, "terminal permutation");
  if (closure.transformSha256 !== arraySha(transform) ||
      closure.rightInverseSha256 !== arraySha(rightInverse)) fail("closure digest changed");
  const exact = owner.exactRelations || {};
  if (exact.relationRecordsShape?.join(",") !== "143,152" ||
      exact.principalGeneratorsShape?.join(",") !== "4,152" ||
      exact.factorBaseIdealsShape?.join(",") !== "4,4,143") fail("exact relation shapes changed");
  const records = integers(exact.relationRecords, 143 * 152, "relations");
  const generators = integers(exact.principalGenerators, 4 * 152, "generators");
  const ideals = integers(exact.factorBaseIdeals, 16 * 143, "factor ideals");
  integers(exact.factorBaseNorms, 143, "factor norms");
  integers(exact.relationNorms, 152, "relation norms");
  if (exact.relationRecordsSha256 !== arraySha(records) ||
      exact.principalGeneratorsSha256 !== arraySha(generators) ||
      exact.factorBaseIdealsSha256 !== arraySha(ideals)) fail("exact relation digest changed");
  const replay = owner.replay || {};
  for (const key of ["w0RelationsExact", "packedLogsSourceOrderExact", "principalIdealsExact",
    "principalNormsExact", "all152RelationsReplayed"])
    if (replay[key] !== true) fail(`${key} is not exact`);
  if (!Array.isArray(replay.packedLogCheckpointSha256) ||
      replay.packedLogCheckpointSha256.length !== 3 ||
      replay.packedLogCheckpointSha256.some(value => !DIGEST.test(value)) ||
      JSON.stringify(replay.hnfStates) !== JSON.stringify([
        [0, 7, 143, 0, 7, 14, 0, 150, 0],
        [0, 8, 143, 0, 8, 0, 0, 151, 0],
        [0, 9, 143, 0, 9, 0, 0, 152, 0],
      ])) fail("HNF source replay changed");
  if (JSON.stringify(owner.assumptions) !== JSON.stringify({
    pari2174Correspondence: true, upstreamBoundsAssumed: true,
    c6Materialization: "not_given(PRECI)", publicCompletion: false,
  })) fail("closure assumptions changed");
  return true;
}

function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `panel8-terminal-closure-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 ||
        sha(fs.readFileSync(destination)) !== digest) fail("existing closure changed");
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
  const accepted = authenticate(options["accepted-owner"], options["accepted-sha256"], "accepted owner");
  const c5 = authenticate(options["c5-owner"], options["c5-sha256"], "C5 owner");
  const c6 = authenticate(options["c6-owner"], options["c6-sha256"], "C6 owner");
  const w0 = authenticate(options["pristine-w0"], options["pristine-sha256"], "pristine W0", false);
  const prepared = authenticatePreparedBundle(w0.value);
  const ancestry = {
    acceptedRetryOwnerSha256: accepted.sha256, c5OwnerSha256: c5.sha256,
    c6OwnerSha256: c6.sha256, pristineW0Sha256: w0.sha256,
    preparedAuthoritySha256: prepared.sha256, sourceSha256: sha(fs.readFileSync(SOURCE)),
  };
  const program = String.raw`import hashlib,importlib,json,sys
sys.path.extend(['src/lib','src/baselib'])
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate JSON key: '+key)
  out[key]=value
 return out
def load(path,expected):
 data=open(path,'rb').read()
 if hashlib.sha256(data).hexdigest()!=expected: raise ValueError('owner changed after authentication')
 return json.loads(data,object_pairs_hook=strict)
m=importlib.import_module('bench.pari-class-group-port.panel8_terminal_closure')
a=load(sys.argv[1],sys.argv[5]);c5=load(sys.argv[2],sys.argv[6]);c6=load(sys.argv[3],sys.argv[7]);w=load(sys.argv[4],sys.argv[8])
ancestry=json.load(sys.stdin,object_pairs_hook=strict)
json.dump(m.compose_authenticated_panel8_terminal_closure(a,c5,c6,w,ancestry),sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("python3", ["-c", program, accepted.path, c5.path, c6.path, w0.path,
    accepted.sha256, c5.sha256, c6.sha256, w0.sha256], {
    cwd: ROOT, input: JSON.stringify(ancestry), encoding: "utf8", timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "closure replay");
  verifyOwner(owner, ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { Panel8TerminalClosureFailure, SCHEMA, arraySha, authenticate, publish, verifyOwner };
