#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const presentationApi = require("./row16_mixed_cubic_owner_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row16_mixed_cubic_class_witness.py");
const SCHEMA = "sagejs.pari-class-group/row16-mixed-cubic-class-witness-v1";
const PRESENTATION_SHA256 = "e51d45b7a994f09bbb14ff7a707ca71d053b94bf924596f435e0f84debc97185";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const DIGEST = /^[0-9a-f]{64}$/;

class Row16ClassWitnessFailure extends Error {}
function fail(message) { throw new Row16ClassWitnessFailure(message); }
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
  const required = ["presentation-owner", "presentation-sha256", "output-dir"];
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
    if ((typeof entry !== "string" && typeof entry !== "number") ||
        !INTEGER.test(String(entry)) ||
        (typeof entry === "number" && (!Number.isSafeInteger(entry) || String(entry) !== String(Number(entry)))))
      fail(`${label}[${index}] is not canonical integer data`);
    return String(entry);
  });
}

function verifyWitness(owner, expectedAncestry = null) {
  if (!owner || typeof owner !== "object" || Array.isArray(owner) || owner.schema !== SCHEMA)
    fail("wrong row-16 class witness identity");
  if (expectedAncestry && JSON.stringify(owner.ancestry) !== JSON.stringify(expectedAncestry))
    fail("row-16 class witness ancestry changed");
  if (owner.ancestry?.presentationOwnerSha256 !== PRESENTATION_SHA256 ||
      !DIGEST.test(owner.ancestry?.sourceSha256 || "") ||
      !DIGEST.test(owner.ancestry?.pristineW0Sha256 || ""))
    fail("row-16 class witness ancestry is invalid");

  const quotient = owner.quotient || {};
  if (quotient.modulus !== 3 || quotient.dimension !== 3 ||
      !quotient.presentationAnnihilated || !Array.isArray(quotient.projections) ||
      quotient.projections.length !== 3 || !Array.isArray(quotient.projectionSha256))
    fail("row-16 quotient identity changed");
  const expectedProjectionDigests = [
    "18901e582006029029d8be17702059b0f965b274e94478bed2e8adc41b8e7271",
    "2ff0c2a9f819a753af185d6b990c7a5301c2f74b67a9f3418decfa182ccf2809",
    "8feb9d19f975b57d8fcaab9d170a724af31e7db775a388847c8a267b3e8c898d",
  ];
  quotient.projections.forEach((projection, index) => {
    const values = integers(projection, 48, `quotient projection ${index}`);
    if (arraySha(values) !== quotient.projectionSha256[index] ||
        quotient.projectionSha256[index] !== expectedProjectionDigests[index])
      fail("row-16 quotient projection changed");
  });
  if (JSON.stringify(integers(quotient.generatorCoordinateMatrix, 9, "coordinate matrix")) !==
      JSON.stringify(["1", "0", "0", "0", "1", "0", "0", "0", "1"]))
    fail("row-16 class generators are not independent");

  if (!Array.isArray(owner.witnesses) || owner.witnesses.length !== 3)
    fail("row-16 class witness count changed");
  const expected = [
    { source: 0, norm: "2", ideal: ["2", "1", "1", "0", "1", "0", "0", "0", "1"],
      square: ["2", "1", "0", "0", "1", "0", "0", "0", "2"],
      power: ["4", "1", "2", "0", "1", "0", "0", "0", "2"],
      raw: "6387526ad1fdc7705f3240c81d85d0269e9cb5828a795bb47a0782a7f306e305",
      alpha: "45c77fbde4f877876ea75f25694f4e6e4ca3cf1abb83e870cae9b74e52317e95" },
    { source: 3, norm: "5", ideal: ["5", "4", "3", "0", "1", "0", "0", "0", "1"],
      square: ["5", "0", "2", "0", "5", "1", "0", "0", "1"],
      power: ["25", "20", "2", "0", "5", "1", "0", "0", "1"],
      raw: "a4a78bfaa26b043567b270dc13fb535fa18048e9c0c440969d15062707bb0b42",
      alpha: "db6f48970ee48abe28f4e87d7cba3c050fa49925df51f619c6c88c2d505437af" },
    { source: 7, norm: "11", ideal: ["11", "7", "1", "0", "1", "0", "0", "0", "1"],
      square: ["121", "73", "111", "0", "1", "0", "0", "0", "1"],
      power: ["1331", "315", "353", "0", "1", "0", "0", "0", "1"],
      raw: "9debc762b9a812077dd66696995664106ec68675ad323bf33bc2489cea2c122d",
      alpha: "27ed2e48791a6284311939146226389392df213b22263d46d28646c292466e62" },
  ];
  owner.witnesses.forEach((witness, index) => {
    const descriptor = witness.descriptor || {};
    integers(descriptor.values, 16, `descriptor ${index}`);
    const ideal = integers(descriptor.idealHnf, 9, `generator ideal ${index}`);
    if (witness.generatorIndex !== index || descriptor.terminalIndex !== index ||
        descriptor.sourceIndex !== expected[index].source || descriptor.norm !== expected[index].norm ||
        JSON.stringify(ideal) !== JSON.stringify(expected[index].ideal) ||
        JSON.stringify(integers(witness.coordinateVector, 3, `coordinate vector ${index}`)) !==
          JSON.stringify(["0", "0", "0"].map((_, coordinate) => String(coordinate === index ? 1 : 0))))
      fail(`row-16 generator ${index} changed`);
    const relation = witness.orderRelation || {};
    const raw = integers(relation.rawRelationCoefficients, 54, `raw coefficients ${index}`);
    const exponents = integers(relation.factorBaseExponents, 48, `factor exponents ${index}`);
    const alpha = integers(relation.principalGenerator, 3, `principal generator ${index}`);
    if (relation.presentationColumn !== index || relation.rawRelationCoefficientsSha256 !== arraySha(raw) ||
        relation.rawRelationCoefficientsSha256 !== expected[index].raw ||
        relation.principalGeneratorSha256 !== arraySha(alpha) ||
        relation.principalGeneratorSha256 !== expected[index].alpha ||
        exponents.some((entry, row) => entry !== (row === expected[index].source ? "3" : "0")))
      fail(`row-16 order relation ${index} changed`);
    const replay = witness.exactIdealReplay || {};
    const square = integers(replay.squareHnf, 9, `square HNF ${index}`);
    const power = integers(replay.powerHnf, 9, `power HNF ${index}`);
    const principal = integers(replay.principalHnf, 9, `principal HNF ${index}`);
    if (JSON.stringify(square) !== JSON.stringify(expected[index].square) ||
        JSON.stringify(power) !== JSON.stringify(expected[index].power) ||
        JSON.stringify(principal) !== JSON.stringify(power) || !replay.powerEqualsPrincipal ||
        !replay.computedBeforeExpectedComparison)
      fail(`row-16 exact ideal replay ${index} changed`);
  });
  if (JSON.stringify(owner.comparison) !== JSON.stringify({
    expectedPowerHnfs: expected.map(entry => entry.power), matches: true,
  })) fail("row-16 frozen comparison changed");
  return true;
}

function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row16-mixed-cubic-class-witness-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing row-16 class witness changed");
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
    fail("wrong row-16 presentation owner digest");
  const selected = path.resolve(options["presentation-owner"]);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== PRESENTATION_SHA256) fail("row-16 presentation owner digest changed");
  const presentation = strictParse(bytes, "row-16 presentation owner");
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
m=importlib.import_module('bench.pari-class-group-port.row16_mixed_cubic_class_witness')
json.dump(m.compose_row16_mixed_cubic_class_witness(owner,ancestry),sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("python3", ["-c", program, selected, PRESENTATION_SHA256], {
    cwd: ROOT, input: JSON.stringify(ancestry), encoding: "utf8", timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "row-16 class witness replay");
  verifyWitness(owner, ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { Row16ClassWitnessFailure, SCHEMA, publish, verifyWitness };
