#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const presentationApi = require("./panel1_presentation_authority_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "panel1_c3_class_witness.py");
const SCHEMA = "sagejs.pari-class-group/panel1-c3-class-witness-v1";
const PRESENTATION_SHA256 = "c5442d0848ec8fb2e6d8f24e516458a15f24f3415d7a1da62d8d5848c2ab0bcf";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const DIGEST = /^[0-9a-f]{64}$/;

class Panel1ClassWitnessFailure extends Error {}
function fail(message) { throw new Panel1ClassWitnessFailure(message); }
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
  const required = ["presentation-owner", "presentation-sha256", "output-dir"];
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

function verifyWitness(owner, expectedAncestry = null) {
  if (!owner || typeof owner !== "object" || Array.isArray(owner) || owner.schema !== SCHEMA)
    fail("wrong class witness identity");
  if (expectedAncestry && JSON.stringify(owner.ancestry) !== JSON.stringify(expectedAncestry))
    fail("class witness ancestry changed");
  if (owner.ancestry?.presentationOwnerSha256 !== PRESENTATION_SHA256 ||
      !DIGEST.test(owner.ancestry?.sourceSha256 || "") ||
      !DIGEST.test(owner.ancestry?.pristineW0Sha256 || ""))
    fail("class witness ancestry is invalid");

  const descriptor = owner.descriptor || {};
  const descriptorValues = integers(descriptor.values, 16, "descriptor");
  const ideal = integers(descriptor.idealHnf, 9, "generator ideal");
  if (descriptor.terminalIndex !== 0 || descriptor.sourceIndex !== 4 || descriptor.norm !== "11" ||
      descriptorValues[0] !== "11" ||
      JSON.stringify(ideal) !== JSON.stringify(["11", "8", "6", "0", "1", "0", "0", "0", "1"]))
    fail("computed generator descriptor changed");

  const smith = owner.smithCoordinate || {};
  const projection = integers(smith.projection, 51, "Smith projection");
  if (smith.modulus !== 3 || smith.generatorCoordinate !== "1" ||
      !smith.presentationAnnihilated || smith.projectionSha256 !== arraySha(projection) ||
      BigInt(projection[descriptor.sourceIndex]) % 3n === 0n)
    fail("nonzero C3 coordinate witness changed");

  const relation = owner.orderRelation || {};
  const presentationCoordinates = integers(relation.presentationCoordinates, 51, "presentation coordinates");
  const raw = integers(relation.rawRelationCoefficients, 58, "raw relation coefficients");
  const factorExponents = integers(relation.factorBaseExponents, 51, "factor-base exponents");
  const alpha = integers(relation.principalGenerator, 3, "principal generator");
  if (JSON.stringify(presentationCoordinates) !== JSON.stringify(["1", ...Array(50).fill("0")]) ||
      factorExponents.some((entry, index) => entry !== (index === 4 ? "3" : "0")) ||
      relation.rawRelationCoefficientsSha256 !== arraySha(raw) ||
      relation.principalGeneratorSha256 !== arraySha(alpha))
    fail("source-derived order relation changed");

  const replay = owner.exactIdealReplay || {};
  const square = integers(replay.squareHnf, 9, "square HNF");
  const power = integers(replay.powerHnf, 9, "power HNF");
  const principal = integers(replay.principalHnf, 9, "principal HNF");
  if (JSON.stringify(square) !== JSON.stringify(["121", "74", "105", "0", "1", "0", "0", "0", "1"]) ||
      !replay.powerEqualsPrincipal || !replay.computedBeforeExpectedComparison ||
      JSON.stringify(power) !== JSON.stringify(principal))
    fail("P^3 principal replay changed");
  const expected = ["1331", "437", "831", "0", "1", "0", "0", "0", "1"];
  if (JSON.stringify(owner.comparison) !== JSON.stringify({ expectedPowerHnf: expected, matches: true }) ||
      JSON.stringify(power) !== JSON.stringify(expected))
    fail("post-computation ideal comparison changed");
  return true;
}

function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `panel1-c3-class-witness-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing class witness changed");
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
  if (options["presentation-sha256"] !== PRESENTATION_SHA256)
    fail("wrong presentation owner digest");
  const selected = path.resolve(options["presentation-owner"]);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== PRESENTATION_SHA256) fail("presentation owner digest changed");
  const presentation = strictParse(bytes, "presentation owner");
  presentationApi.verifyOwner(presentation, presentation.ancestry);
  const ancestry = {
    presentationOwnerSha256: PRESENTATION_SHA256,
    pristineW0Sha256: presentation.ancestry.pristineW0Sha256,
    presentationSourceSha256: presentation.ancestry.sourceSha256,
    sourceSha256: sha(fs.readFileSync(SOURCE)),
  };
  const program = String.raw`import hashlib,importlib,json,sys
data=open(sys.argv[1],'rb').read()
if hashlib.sha256(data).hexdigest()!=sys.argv[2]: raise ValueError('presentation changed after authentication')
owner=json.loads(data); ancestry=json.load(sys.stdin)
sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.panel1_c3_class_witness')
json.dump(m.compose_panel1_c3_class_witness(owner,ancestry),sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("python3", ["-c", program, selected, PRESENTATION_SHA256], {
    cwd: ROOT, input: JSON.stringify(ancestry), encoding: "utf8", timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "class witness replay");
  verifyWitness(owner, ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { Panel1ClassWitnessFailure, SCHEMA, publish, verifyWitness };
