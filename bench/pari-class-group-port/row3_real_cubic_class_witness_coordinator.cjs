#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const presentationApi = require("./row34_real_cubic_presentation_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row3_real_cubic_class_witness.py");
const SCHEMA = "sagejs.pari-class-group/row3-real-cubic-class-witness-v1";
const PRESENTATION_SHA256 = "200190446c7128e2fe8d549924f76c1ddfce205f857a0d55a1d523d287dd868b";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const DIGEST = /^[0-9a-f]{64}$/;

class Row3ClassWitnessFailure extends Error {}
function fail(message) { throw new Row3ClassWitnessFailure(message); }
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
  if (!owner || owner.schema !== SCHEMA) fail("wrong row-3 class-witness schema");
  const ancestry = owner.ancestry || {};
  if (expectedAncestry && JSON.stringify(ancestry) !== JSON.stringify(expectedAncestry))
    fail("row-3 class-witness ancestry changed");
  if (Object.keys(ancestry).sort().join("\0") !== "presentationSha256\0sourceSha256" ||
      ancestry.presentationSha256 !== PRESENTATION_SHA256)
    fail("row-3 class-witness ancestry is incomplete");
  for (const value of Object.values(ancestry)) if (!DIGEST.test(value)) fail("invalid ancestry digest");

  const generator = owner.generator || {};
  if (JSON.stringify(generator.presentationCoordinates) !== '["1","1"]' ||
      JSON.stringify(generator.terminalIndices) !== "[0,1]" ||
      JSON.stringify(generator.sourceIndices) !== "[4,74]") fail("row-3 class generator changed");
  const generatorIdeal = integers(generator.idealHnf, 9, "generator ideal");
  if (JSON.stringify(generatorIdeal) !== '["3839","1364","2942","0","1","0","0","0","1"]')
    fail("row-3 product generator ideal changed");
  if (!Array.isArray(generator.descriptors) || generator.descriptors.length !== 2 ||
      !Array.isArray(generator.presentationIdealHnfs) || generator.presentationIdealHnfs.length !== 2)
    fail("row-3 presentation generators changed");
  generator.descriptors.forEach((value, index) => integers(value, 16, `descriptor ${index}`));
  generator.presentationIdealHnfs.forEach((value, index) => integers(value, 9, `ideal ${index}`));

  const quotient = owner.quotient || {};
  if (JSON.stringify(quotient.presentation) !== '["3","0","0","2"]' ||
      JSON.stringify(quotient.smithInvariants) !== '["6"]' || quotient.generatorOrder !== "6" ||
      JSON.stringify(quotient.properDivisorsRejected) !== '["1","2","3"]' ||
      quotient.generatorNontrivial !== true) fail("row-3 exact-order proof changed");

  const compact = owner.compactPrincipalWitness || {};
  if (compact.kind !== "signed-retained-relation-product" ||
      compact.factorCount !== 443 ||
      compact.expandedGeneratorMaterialized !== false)
    fail("row-3 compact witness metadata changed");
  const indices = integers(compact.relationIndices, compact.factorCount, "relation indices");
  const exponents = integers(compact.relationExponents, compact.factorCount, "relation exponents");
  const generators = integers(compact.principalGenerators, 3 * compact.factorCount, "principal factors");
  if (indices.some((value, index) => Number(value) < 0 || Number(value) >= 675 ||
      (index && Number(value) <= Number(indices[index - 1]))) || exponents.some(value => value === "0"))
    fail("row-3 compact factors are not sparse canonical data");
  if (compact.relationIndicesSha256 !== arraySha(indices) ||
      compact.relationExponentsSha256 !== arraySha(exponents) ||
      compact.principalGeneratorsSha256 !== arraySha(generators) ||
      compact.relationIndicesSha256 !== "d4d0d63535e5321bea1aea33098e9fb4a71c9cb047b391c66cee98b601edcc17" ||
      compact.relationExponentsSha256 !== "7e650fd49f21db88859d4aafa22d8215bc33f46b1e7a887768a023c09f882a6f" ||
      compact.principalGeneratorsSha256 !== "f381132d2267e2e2fd7b451e05d38549681b8ad966150b55651c46971d856ccb")
    fail("row-3 compact factor digest changed");

  const relation = owner.orderRelation || {};
  const target = integers(relation.factorBaseExponents, 668, "factor-base exponents");
  const expanded = Array(675).fill("0");
  for (let index = 0; index < indices.length; index += 1) expanded[Number(indices[index])] = exponents[index];
  if (target.filter(value => value === "6").length !== 2 ||
      target.some(value => value !== "0" && value !== "6") ||
      relation.rawRelationCoefficientsSha256 !== arraySha(expanded) ||
      relation.factorBaseExponentsSha256 !== arraySha(target) ||
      relation.rawRelationCoefficientsSha256 !== "ef38c07ca2786fc6e5fec1eb2493cd7fad1c1523f91d6a82acb35a6f791c2040" ||
      relation.factorBaseExponentsSha256 !== "d3890e6251ebe094b11cae6353954f8381752818410a041bcad6260f801cc165" ||
      relation.coefficientCombinationExact !== true)
    fail("row-3 compact order relation changed");

  const replay = owner.exactIdealReplay || {};
  const power = integers(replay.powerHnf, 9, "generator sixth power");
  if (JSON.stringify(power) !== '["3201169517099311080961","2934313698540909513400","3138072947592502670932","0","1","0","0","0","1"]')
    fail("row-3 generator sixth power changed");
  if (replay.principalRelationsReplayed !== compact.factorCount ||
      replay.idealMultiplications !== 2849 ||
      replay.powerEqualsCompactPrincipalProduct !== true ||
      replay.computedBeforeFrozenPowerComparison !== true)
    fail("row-3 exact ideal replay changed");
  const completion = { classWitnessesComplete: true, compactPrincipalWitnessComplete: true,
    expandedPrincipalGeneratorMaterialized: false, unitsComplete: false,
    correspondenceComplete: false, publicComplete: false };
  if (JSON.stringify(owner.completion) !== JSON.stringify(completion))
    fail("row-3 completion boundary changed");
  return true;
}

function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row3-real-cubic-class-witness-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing immutable row-3 class witness changed");
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
  if (options["presentation-sha256"] !== PRESENTATION_SHA256)
    fail("wrong row-3 presentation digest");
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
m=importlib.import_module('bench.pari-class-group-port.row3_real_cubic_class_witness')
o=m.compose_row3_real_cubic_class_witness(owner,ancestry)
json.dump(o,sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("timeout", ["600", "prlimit", "--as=4294967296",
    "--rss=4294967296", "--cpu=600", "--", "python3", "-c", program,
    selected, PRESENTATION_SHA256], {
    cwd: ROOT, input: JSON.stringify(ancestry), encoding: "utf8", timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "row-3 class-witness replay");
  verifyOwner(owner, ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { PRESENTATION_SHA256, Row3ClassWitnessFailure, SCHEMA, publish, verifyOwner };
