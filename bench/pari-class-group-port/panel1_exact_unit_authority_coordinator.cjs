#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = "sagejs.pari-class-group/panel1-exact-unit-authority-v1";
const W0_SHA256 = "f043f34a7c732269791a3c8c16cb3b30767b84ecec3c340659433d53f05aeb72";

function fail(message) { throw new Error(`panel-1 exact unit authority: ${message}`); }
function digest(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }

function argumentsOf(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(result, key)) fail(`duplicate --${key}`);
    result[key] = argv[index + 1];
  }
  const required = ["presentation-owner", "presentation-sha256", "pristine-w0",
    "pristine-sha256", "output-dir"];
  if (Object.keys(result).sort().join("\0") !== required.sort().join("\0")) {
    fail(`required arguments are ${required.map((key) => `--${key}`).join(", ")}`);
  }
  return result;
}

function authenticate(file, expected, label, immutable) {
  if (!/^[0-9a-f]{64}$/.test(expected)) fail(`${label} digest is invalid`);
  const info = fs.statSync(file);
  if (!info.isFile()) fail(`${label} is not a file`);
  if (immutable && (info.mode & 0o777) !== 0o444) fail(`${label} is not mode 0444`);
  const bytes = fs.readFileSync(file);
  if (digest(bytes) !== expected) fail(`${label} digest changed`);
  return { path: path.resolve(file), value: JSON.parse(bytes), sha256: expected };
}

function integer(entry, label) {
  if (!entry || entry.kind !== "integer" || !/^-?(0|[1-9][0-9]*)$/.test(entry.value)) {
    fail(`${label} is not an exported integer`);
  }
  return entry.value;
}

function integerMatrix(entry, label) {
  if (!entry || entry.kind !== "matrix" || !Array.isArray(entry.values)) {
    fail(`${label} is not an exported matrix`);
  }
  return entry.values.flatMap((column, j) => {
    if (column.kind !== "column" || !Array.isArray(column.values)) fail(`${label}[${j}] changed`);
    return column.values.map((value, i) => integer(value, `${label}[${j},${i}]`));
  });
}

function packedReal(entry, label) {
  if (!entry || entry.kind !== "real" || !/^-?(0|[1-9][0-9]*)$/.test(entry.mantissa) ||
      !Number.isSafeInteger(entry.precision) || !Number.isSafeInteger(entry.exponent)) {
    fail(`${label} is not an exported packed real`);
  }
  return [entry.mantissa, String(entry.precision), String(entry.exponent)];
}

function verifyOwner(owner) {
  if (owner.schema !== SCHEMA || owner.exactStorageBits !== 16384 ||
      owner.unitTransformShape?.join(",") !== "7,2" || owner.unitTransform?.length !== 14 ||
      owner.rawUnitProvenanceShape?.join(",") !== "58,2" ||
      owner.rawUnitProvenance?.length !== 116 || owner.exactUnitsShape?.join(",") !== "3,2" ||
      owner.exactUnits?.length !== 2 || owner.exactUnits.some((unit) => unit.length !== 3) ||
      owner.unitNorms?.join(",") !== "1,1" || owner.signPhases?.join(",") !== "0,1,1,1,1,0" ||
      owner.bridgeState?.join(",") !== "0,0,0,2,7" || owner.packedRegulator?.length !== 3 ||
      !/^[0-9a-f]{64}$/.test(owner.arithmeticSha256) ||
      owner.ancestry?.presentationAuthoritySha256 !== owner.presentationAuthoritySha256 ||
      Object.values(owner.producer || {}).includes(false) !== true ||
      owner.producer?.fundamentalUnitCoordinatesRead !== false ||
      owner.producer?.rawRelationProductsMaterialized !== true ||
      owner.pristineComparison?.referenceReadAfterComputation !== true ||
      owner.pristineComparison?.unitTransformCompared !== true ||
      owner.pristineComparison?.regulatorCompared !== true ||
      owner.pristineComparison?.referenceExactUnitsAvailable !== false ||
      owner.pristineComparison?.pristineW0Sha256 !== W0_SHA256) {
    fail("arithmetic returned an invalid complete owner");
  }
  for (const value of [...owner.unitTransform, ...owner.rawUnitProvenance,
    ...owner.exactUnits.flat(), ...owner.packedRegulator]) {
    if (!/^-?(0|[1-9][0-9]*)$/.test(value) || BigInt(value).toString() !== value ||
        (BigInt(value) < 0n ? -BigInt(value) : BigInt(value)).toString(2).length > 16383) {
      fail("published exact storage is noncanonical or oversized");
    }
  }
}

function comparePristineAfterComputation(owner, pristine) {
  const references = pristine.events?.filter((event) => event.event === "fundamental_units");
  if (!references || references.length !== 1) fail("wrong pristine fundamental-unit event count");
  const reference = references[0];
  if (owner.unitTransform.join("\0") !== integerMatrix(reference.U, "reference U").join("\0")) {
    fail("computed unit transform differs from pristine W0");
  }
  if (owner.packedRegulator.join("\0") !==
      packedReal(reference.regulator, "reference regulator").join("\0")) {
    fail("computed packed regulator differs from pristine W0");
  }
  if (reference.fu !== null) fail("row-1 W0 unexpectedly contains exact reference units");
  owner.pristineComparison = {
    pristineW0Sha256: W0_SHA256,
    referenceReadAfterComputation: true,
    unitTransformCompared: true,
    regulatorCompared: true,
    referenceExactUnitsAvailable: false,
  };
}

function main() {
  const options = argumentsOf(process.argv);
  const presentation = authenticate(options["presentation-owner"],
    options["presentation-sha256"], "presentation owner", true);
  const pristine = authenticate(options["pristine-w0"], options["pristine-sha256"],
    "pristine W0", false);
  if (pristine.sha256 !== W0_SHA256) fail("wrong pristine W0 authority");
  const script = String.raw`
import dataclasses,decimal,fractions,hashlib,importlib,json,sys,typing
sys.path[:0]=['src/lib','src/baselib']
m=importlib.import_module('bench.pari-class-group-port.panel1_exact_unit_authority')
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate JSON key: '+key)
  out[key]=value
 return out
raw=open(sys.argv[1],'rb').read()
if hashlib.sha256(raw).hexdigest()!=sys.argv[2]: raise ValueError('presentation changed after authentication')
owner=json.loads(raw,object_pairs_hook=strict)
json.dump(m.compose_panel1_exact_unit_authority(owner,sys.argv[2]),sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`;
  const run = spawnSync("python3", ["-c", script, presentation.path, presentation.sha256], {
    cwd: ROOT, encoding: "utf8", timeout: 360_000, maxBuffer: 128 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `python exited ${run.status}`).trim());
  const owner = JSON.parse(run.stdout);
  // This is deliberately after the arithmetic process has returned.  No W0
  // fundamental-unit field was present in the producer's input packet.
  comparePristineAfterComputation(owner, pristine.value);
  verifyOwner(owner);
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const sha256 = digest(bytes);
  fs.mkdirSync(options["output-dir"], { recursive: true });
  const destination = path.join(options["output-dir"], `panel1-exact-units-${sha256}.json`);
  if (fs.existsSync(destination)) {
    if (digest(fs.readFileSync(destination)) !== sha256 ||
        (fs.statSync(destination).mode & 0o777) !== 0o444) fail("existing owner changed");
  } else {
    const temporary = path.join(options["output-dir"],
      `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { mode: 0o400, flag: "wx" });
      fs.renameSync(temporary, destination);
      fs.chmodSync(destination, 0o444);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, path: destination,
    sha256, bytes: bytes.length })}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { comparePristineAfterComputation, verifyOwner };
