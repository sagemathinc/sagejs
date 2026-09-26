#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const presentationApi = require("./row18_mixed_cubic_retry_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row18_mixed_cubic_class_witness.py");
const SCHEMA = "sagejs.pari-class-group/row18-cyclic-class-witness-v1";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const DIGEST = /^[0-9a-f]{64}$/;
class Row18ClassWitnessFailure extends Error {}
function fail(message) { throw new Row18ClassWitnessFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} has the wrong length`);
  return value.map((entry, index) => {
    if (!INTEGER.test(String(entry))) fail(`${label}[${index}] is not canonical`);
    return String(entry);
  });
}
function argumentsOf(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    values[argv[index].slice(2)] = argv[index + 1];
  }
  if (Object.keys(values).sort().join() !== ["output-dir", "presentation-owner", "presentation-sha256"].sort().join())
    fail("required presentation owner arguments are missing");
  return values;
}
function verifyOwner(owner, ancestry = null) {
  if (!owner || owner.schema !== SCHEMA) fail("wrong row-18 class witness schema");
  if (ancestry && JSON.stringify(owner.ancestry) !== JSON.stringify(ancestry)) fail("class witness ancestry changed");
  for (const value of Object.values(owner.ancestry || {})) if (!DIGEST.test(value)) fail("invalid ancestry digest");
  const generator = owner.generator || {};
  if (generator.sourceIndex !== 4 || generator.terminalIndex !== 1 || generator.norm !== "7")
    fail("selected cyclic generator changed");
  integers(generator.descriptor, 16, "descriptor");
  integers(generator.idealHnf, 9, "ideal HNF");
  const quotient = owner.quotient || {};
  integers(quotient.coordinateOrders, 41, "coordinate orders");
  if (quotient.generatorOrder !== "18" || JSON.stringify(quotient.properDivisorsRejected) !== '["1","2","3","6","9"]')
    fail("cyclic order proof changed");
  const relation = owner.orderRelation || {};
  integers(relation.presentationCoefficients, 41, "presentation coefficients");
  integers(relation.rawRelationCoefficients, 50, "raw coefficients");
  integers(relation.factorBaseExponents, 41, "factor exponents");
  integers(relation.principalGenerator, 3, "principal generator");
  const replay = owner.exactIdealReplay || {};
  const power = integers(replay.powerHnf, 9, "power HNF");
  const principal = integers(replay.principalHnf, 9, "principal HNF");
  if (JSON.stringify(power) !== JSON.stringify(principal) || !replay.powerEqualsPrincipal ||
      !owner.computedBeforeExpectedComparison) fail("exact ideal replay changed");
  return true;
}
function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row18-class-witness-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing immutable class witness changed");
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
  if (!DIGEST.test(options["presentation-sha256"])) fail("invalid presentation digest");
  const selected = path.resolve(options["presentation-owner"]);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== options["presentation-sha256"] || (fs.statSync(selected).mode & 0o777) !== 0o444)
    fail("presentation owner digest or mode changed");
  const presentation = JSON.parse(bytes);
  presentationApi.verifyOwner(presentation, presentation.ancestry);
  const ancestry = { presentationSha256: options["presentation-sha256"],
    sourceSha256: sha(fs.readFileSync(SOURCE)) };
  const program = String.raw`import importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row18_mixed_cubic_class_witness')
o=m.compose_row18_cyclic_class_witness(json.load(open(sys.argv[1])),json.load(sys.stdin))
json.dump(o,sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("python3", ["-c", program, selected], { cwd: ROOT,
    input: JSON.stringify(ancestry), encoding: "utf8", timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = JSON.parse(run.stdout); verifyOwner(owner, ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}
if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { Row18ClassWitnessFailure, SCHEMA, verifyOwner, publish };
