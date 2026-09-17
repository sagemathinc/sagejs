#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const row16Api = require("./row16_mixed_cubic_owner_coordinator.cjs");
const row18Api = require("./row18_mixed_cubic_retry_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "mixed_cubic_rank1_unit.py");
const SCHEMA = "sagejs.pari-class-group/mixed-cubic-rank1-unit-v1";
const DIGEST = /^[0-9a-f]{64}$/;
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
class MixedCubicRank1UnitFailure extends Error {}
function fail(message) { throw new MixedCubicRank1UnitFailure(message); }
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
  if (!owner || owner.schema !== SCHEMA) fail("wrong rank-one unit schema");
  if (ancestry && JSON.stringify(owner.ancestry) !== JSON.stringify(ancestry)) fail("unit ancestry changed");
  for (const value of Object.values(owner.ancestry || {})) if (!DIGEST.test(value)) fail("invalid ancestry digest");
  const expected = owner.fieldId === "3.1.1002718428660.2"
    ? { kernel: 6, relations: 54, multiples: ["0", "0", "0", "0", "0", "1"] }
    : owner.fieldId === "3.1.1005907102200.3"
      ? { kernel: 9, relations: 50, multiples: ["0", "0", "0", "0", "0", "1", "-1", "-18", "-64"] }
      : null;
  if (!expected) fail("unsupported mixed-cubic unit field");
  const clean = owner.cleanarch || {};
  integers(clean.kernelLogMultiples, expected.kernel, "log multiples");
  integers(clean.bezoutTransform, expected.kernel, "Bezout transform");
  if (JSON.stringify(clean.kernelLogMultiples) !== JSON.stringify(expected.multiples) ||
      clean.gcd !== "1" || clean.primitiveRegulatorMultiple !== "1" ||
      clean.residualBound !== "2^-128" || !clean.allResidualsCertified)
    fail("rank-one cleanarch evidence changed");
  const factorback = owner.factorback || {};
  integers(factorback.rawRelationCoefficients, expected.relations, "raw unit coefficients");
  integers(factorback.exactUnit, 3, "exact unit");
  integers(factorback.exactUnitBits, 3, "exact unit bit sizes");
  if (!factorback.relationDependencyVerified || !["-1", "1"].includes(factorback.unitNorm))
    fail("exact unit factorback changed");
  if (JSON.stringify(owner.outcome) !== JSON.stringify({status: "success", precisionBits: 192,
      precisionRetry: false, fundamentalUnitDerived: true, usedFrozenFundamentalUnit: false}))
    fail("rank-one unit outcome changed");
  return true;
}
function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `mixed-cubic-rank1-unit-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing immutable rank-one unit changed");
  } else {
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination); fs.chmodSync(destination, 0o444);
    } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { schema: SCHEMA, fieldId: owner.fieldId, path: destination,
    sha256: digest, bytes: bytes.length };
}
function main() {
  const options = argumentsOf(process.argv);
  if (!DIGEST.test(options["presentation-sha256"])) fail("invalid presentation digest");
  const selected = path.resolve(options["presentation-owner"]);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== options["presentation-sha256"] || (fs.statSync(selected).mode & 0o777) !== 0o444)
    fail("presentation owner digest or mode changed");
  const presentation = JSON.parse(bytes);
  if (presentation.field?.panelIndex === 16) row16Api.verifyOwner(presentation, presentation.ancestry);
  else if (presentation.field?.panelIndex === 18) row18Api.verifyOwner(presentation, presentation.ancestry);
  else fail("presentation is not row 16 or row 18");
  const ancestry = { presentationSha256: options["presentation-sha256"],
    sourceSha256: sha(fs.readFileSync(SOURCE)) };
  const program = String.raw`import importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.mixed_cubic_rank1_unit')
o=m.compose_mixed_cubic_rank1_unit(json.load(open(sys.argv[1])),json.load(sys.stdin))
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
module.exports = { MixedCubicRank1UnitFailure, SCHEMA, verifyOwner, publish };
