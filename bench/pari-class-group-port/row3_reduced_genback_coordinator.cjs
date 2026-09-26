#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const presentationApi = require("./row34_real_cubic_presentation_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row3_reduced_genback_owner.py");
const SCHEMA = "sagejs.pari-class-group/row3-reduced-genback-owner-v1";
const PRESENTATION_SHA256 = "200190446c7128e2fe8d549924f76c1ddfce205f857a0d55a1d523d287dd868b";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const DIGEST = /^[0-9a-f]{64}$/;

class Row3ReducedGenbackFailure extends Error {}
function fail(message) { throw new Row3ReducedGenbackFailure(message); }
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
  const required = ["output-dir", "presentation-owner", "presentation-sha256"];
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
    cwd: ROOT, input: bytes, encoding: "utf8", timeout: 60_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (parsed.status !== 0) fail(`${label} is not strict JSON`);
  return JSON.parse(parsed.stdout);
}

function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} has the wrong length`);
  return value.map((entry, index) => {
    if (!INTEGER.test(String(entry))) fail(`${label}[${index}] is not canonical`);
    return String(entry);
  });
}

function verifyOwner(owner, expectedAncestry = null) {
  if (!owner || owner.schema !== SCHEMA) fail("wrong row-3 reduced-genback schema");
  const ancestry = owner.ancestry || {};
  if (expectedAncestry && JSON.stringify(ancestry) !== JSON.stringify(expectedAncestry))
    fail("row-3 reduced-genback ancestry changed");
  if (Object.keys(ancestry).sort().join("\0") !== "presentationSha256\0sourceSha256" ||
      ancestry.presentationSha256 !== PRESENTATION_SHA256)
    fail("row-3 reduced-genback ancestry is incomplete");
  for (const value of Object.values(ancestry)) if (!DIGEST.test(value)) fail("invalid ancestry digest");

  const request = owner.request || {};
  if (JSON.stringify(request.terminalIndices) !== "[0,1]" ||
      JSON.stringify(request.sourceIndices) !== "[4,74]" ||
      JSON.stringify(request.signedExponents) !== '["1","-1"]' || request.nonzeroTerms !== 2)
    fail("row-3 signed genback request changed");
  const prepared = owner.prepared || {};
  if (JSON.stringify(integers(prepared.roundedT2, 9, "rounded T2")) !==
      '["1","-70711","3333262626","1","1","-6666666672","1","70710","3333404047"]')
    fail("row-3 rounded T2 changed");
  if (!Array.isArray(prepared.selectedIdealHnfs) || prepared.selectedIdealHnfs.length !== 2 ||
      !Array.isArray(prepared.candidateTrace) || prepared.candidateTrace.length !== 3 ||
      !Array.isArray(prepared.inverseIdealTrace) || prepared.inverseIdealTrace.length !== 3 ||
      !Array.isArray(prepared.weightedBasisTrace) || prepared.weightedBasisTrace.length !== 3 ||
      !Array.isArray(prepared.lllTransformTrace) || prepared.lllTransformTrace.length !== 3)
    fail("row-3 candidate owner shape changed");
  prepared.selectedIdealHnfs.forEach((value, index) => integers(value, 9, `ideal ${index}`));
  prepared.candidateTrace.forEach((value, index) => integers(value, 3, `candidate ${index}`));
  prepared.inverseIdealTrace.forEach((value, index) => integers(value, 9, `inverse ${index}`));
  prepared.weightedBasisTrace.forEach((value, index) => integers(value, 9, `weighted ${index}`));
  prepared.lllTransformTrace.forEach((value, index) => integers(value, 9, `transform ${index}`));
  if (JSON.stringify(prepared.candidateTrace) !==
      '[["11","0","0"],["349","0","0"],["3839","0","0"]]')
    fail("row-3 computed candidate trace changed");

  const reduced = owner.reducedRepresentative || {};
  if (JSON.stringify(integers(reduced.idealHnf, 9, "reduced ideal")) !==
      '["3839","0","2150","0","349","30","0","0","1"]' ||
      JSON.stringify(reduced.factorKinds) !== "[0]" ||
      JSON.stringify(integers(reduced.factorValues, 4, "compact factor")) !==
        '["1","0","0","349"]' ||
      JSON.stringify(integers(reduced.factorExponents, 1, "factor exponent")) !== '["1"]' ||
      reduced.candidateCount !== 3)
    fail("row-3 reduced representative changed");
  const principal = owner.principalWitness || {};
  const left = integers(principal.leftHnf, 9, "cleared left ideal");
  const right = integers(principal.rightHnf, 9, "cleared right ideal");
  if (principal.identity !== "J * P_349 = (349) * P_11" || principal.exact !== true ||
      JSON.stringify(left) !== JSON.stringify(right) ||
      JSON.stringify(left) !== '["3839","0","1745","0","349","0","0","0","349"]')
    fail("row-3 exact principal witness changed");
  const order = owner.orderWitness || {};
  const target = integers(order.factorBaseExponents, 668, "order target");
  if (order.order !== "6" || JSON.stringify(order.properDivisorsRejected) !== '["1","2","3"]' ||
      order.exact !== true || target[4] !== "6" || target[74] !== "-6" ||
      target.some((value, index) => index !== 4 && index !== 74 && value !== "0") ||
      order.factorBaseExponentsSha256 !== arraySha(target) ||
      order.relationCoefficientsSha256 !== "64735c7c5c49d01ba04d149ab759158ea9c0886c1075c116b2c24aec703e405c")
    fail("row-3 exact order witness changed");
  const completion = { candidateOwnerComplete: true, genbackRequestComplete: true,
    principalWitnessComplete: true, orderWitnessComplete: true, unitsComplete: false,
    publicComplete: false };
  if (JSON.stringify(owner.completion) !== JSON.stringify(completion))
    fail("row-3 reduced-genback completion changed");
  return true;
}

function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row3-reduced-genback-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing immutable row-3 reduced-genback owner changed");
  } else {
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination); fs.chmodSync(destination, 0o444);
    } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { schema: SCHEMA, path: destination, sha256: digest, bytes: bytes.length };
}

function main() {
  const options = argumentsOf(process.argv);
  if (options["presentation-sha256"] !== PRESENTATION_SHA256) fail("wrong row-3 presentation digest");
  const selected = path.resolve(options["presentation-owner"]);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== PRESENTATION_SHA256 || (fs.statSync(selected).mode & 0o777) !== 0o444)
    fail("presentation owner digest or mode changed");
  const presentation = strictParse(bytes, "row-3 presentation owner");
  presentationApi.verifyOwner(presentation, presentation.ancestry);
  const ancestry = { presentationSha256: PRESENTATION_SHA256, sourceSha256: sha(fs.readFileSync(SOURCE)) };
  const program = String.raw`import hashlib,importlib,json,sys
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate JSON key: '+key)
  out[key]=value
 return out
data=open(sys.argv[1],'rb').read()
if hashlib.sha256(data).hexdigest()!=sys.argv[2]: raise ValueError('presentation changed after authentication')
owner=json.loads(data,object_pairs_hook=strict); ancestry=json.load(sys.stdin,object_pairs_hook=strict)
sys.set_int_max_str_digits(100000);sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row3_reduced_genback_owner')
o=m.compose_row3_reduced_genback_owner(owner,ancestry)
json.dump(o,sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("timeout", ["600", "prlimit", "--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", "python3", "-c", program, selected, PRESENTATION_SHA256], {
    cwd: ROOT, input: JSON.stringify(ancestry), encoding: "utf8", timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "row-3 reduced-genback replay");
  verifyOwner(owner, ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { PRESENTATION_SHA256, Row3ReducedGenbackFailure, SCHEMA, publish, verifyOwner };
