#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const presentationApi = require("./row34_real_cubic_presentation_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row4_rank2_unit_authority.py");
const SCHEMA = "sagejs.pari-class-group/row4-rank2-unit-authority-v1";
const PRESENTATION_SHA256 = "122f1a9f8731f3c6d7202426c4f1c9b133bff815091aff55dce0166c6c53bcfa";
const W0_SHA256 = "acebe2f9f4bdfc0c3da76ab6d9ad1aa409a1fb0bfd4113ebec9b825c432e2cb8";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const DIGEST = /^[0-9a-f]{64}$/;

class Row4UnitFailure extends Error {}
function fail(message) { throw new Row4UnitFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function arraySha(values) { return sha(Buffer.from(values.join("\n"))); }

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(
    key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function canonicalSha(value) { return sha(Buffer.from(canonical(value))); }

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

function argumentsOf(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(values, key)) fail(`duplicate --${key}`);
    values[key] = argv[index + 1];
  }
  const required = ["presentation", "presentation-sha256", "pristine-w0",
    "pristine-sha256", "output-dir"];
  if (Object.keys(values).sort().join("\0") !== required.sort().join("\0"))
    fail(`required arguments are ${required.map(key => `--${key}`).join(", ")}`);
  return values;
}

function verifyOwner(owner, presentation, expectedAncestry = null) {
  if (owner?.schema !== SCHEMA || owner.field?.id !== presentation.field?.id ||
      owner.field?.panelIndex !== 4) fail("wrong row-4 unit identity");
  if (JSON.stringify(owner.field) !== JSON.stringify(presentation.field) ||
      JSON.stringify(owner.dimensions) !== JSON.stringify(presentation.dimensions))
    fail("row-4 unit field owner changed");
  const ancestry = owner.ancestry || {};
  if (ancestry.presentationAuthoritySha256 !== PRESENTATION_SHA256 ||
      ancestry.pristineW0Sha256 !== W0_SHA256 ||
      ancestry.producerSourceSha256 !== sha(fs.readFileSync(SOURCE)) ||
      JSON.stringify(ancestry.presentation) !== JSON.stringify(presentation.ancestry))
    fail("row-4 unit ancestry changed");
  if (expectedAncestry && JSON.stringify(ancestry) !== JSON.stringify(expectedAncestry))
    fail("row-4 expected ancestry changed");
  for (const value of [ancestry.presentationAuthoritySha256, ancestry.pristineW0Sha256,
    ancestry.producerSourceSha256])
    if (!DIGEST.test(value)) fail("invalid row-4 ancestry digest");

  const logs = owner.sourceLogs || {};
  const kernelLogs = integers(logs.kernelLogs, 147, "kernel logs");
  if (logs.frozenW0UsedAsInput !== true || logs.preparedNfLiveRoot !== false ||
      logs.qualifiedTiming !== false ||
      logs.rawPackedLogsSha256 !== presentation.relations.packedLogsSha256 ||
      logs.kernelLogsShape?.join(",") !== "3,7,7" ||
      logs.kernelLogsSha256 !== arraySha(kernelLogs)) fail("row-4 log owner changed");

  const units = owner.units || {};
  const transform = integers(units.unitKernelTransform, 14, "unit kernel transform").map(BigInt);
  const provenance = integers(units.rawUnitProvenance, 1134, "raw unit provenance").map(BigInt);
  const norms = integers(units.unitNorms, 2, "unit norms");
  const signs = integers(units.unitRealSigns, 6, "unit real signs").map(Number);
  if (units.materialization !== "not_given(LARGE)" || units.reason !== "LARGE" ||
      units.unitKernelTransformShape?.join(",") !== "7,2" ||
      units.rawUnitProvenanceShape?.join(",") !== "567,2" ||
      units.factoredUnitBasis !== "authenticated principalGenerators" ||
      norms.join(",") !== "-1,1" || signs.some(value => value !== -1 && value !== 1))
    fail("row-4 compact unit result changed");
  for (let unit = 0; unit < 2; unit += 1) {
    let nonzero = 0;
    for (let relation = 0; relation < 567; relation += 1) {
      let expected = 0n;
      for (let kernel = 0; kernel < 7; kernel += 1)
        expected += BigInt(presentation.presentation.rawToKernel[kernel * 567 + relation]) *
          transform[unit * 7 + kernel];
      if (provenance[unit * 567 + relation] !== expected)
        fail("raw factored provenance is detached from kernel ancestry");
      if (expected !== 0n) nonzero += 1;
    }
    if (units.nonzeroRelationFactors?.[unit] !== nonzero)
      fail("factored unit support changed");
    let signProduct = 1;
    for (let place = 0; place < 3; place += 1) signProduct *= signs[3 * unit + place];
    if (String(signProduct) !== norms[unit]) fail("unit signs disagree with norm");
  }
  const records = presentation.relations.matrix.map(BigInt);
  for (let unit = 0; unit < 2; unit += 1) for (let row = 0; row < 560; row += 1) {
    let value = 0n;
    for (let relation = 0; relation < 567; relation += 1)
      value += records[relation * 560 + row] * provenance[unit * 567 + relation];
    if (value !== 0n) fail("R times factored-unit provenance is nonzero");
  }
  const replay = owner.replay || {};
  if (JSON.stringify(replay.hnfState) !== "[1,8,559,0,7,65,0,567,0]" ||
      replay.bridgeStatus !== 4 || JSON.stringify(replay.bridgeState) !== "[0,0,2,-1,-1]" ||
      replay.getfuStatus !== 2 || replay.getfuState?.[0] !== 2 || replay.getfuState?.[3] <= 20 ||
      !replay.rawRelationsTimesUnitsZero || !replay.allPrincipalRelationNormsReplayed ||
      !replay.allPrincipalGeneratorSignsProved || replay.fundamentalUnitEventRead !== false ||
      replay.terminalResultEventRead !== false) fail("row-4 replay evidence changed");
  const arithmetic = { kernelLogs, unitKernelTransform: transform.map(String),
    rawUnitProvenance: provenance.map(String), unitNorms: norms,
    unitRealSigns: signs, packedRegulator: owner.regulator?.packed };
  if (replay.arithmeticSha256 !== canonicalSha(arithmetic)) fail("row-4 arithmetic digest changed");
  if (owner.regulator?.source !== "accepted relation lattice and source-scheduled kernel logs" ||
      owner.regulator?.computedFloat !== owner.regulator?.expectedFloat)
    fail("row-4 regulator authority changed");
  const completion = { compactFactoredUnitsRetained: true, exactExpandedUnitsPublished: false,
    exactSuffixComplete: true, inputBoundaryComplete: false,
    correspondenceComplete: false, publicComplete: false };
  if (JSON.stringify(owner.completion) !== JSON.stringify(completion)) fail("row-4 completion boundary changed");
  return true;
}

function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row4-rank2-unit-authority-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing immutable row-4 unit owner changed");
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
  if (options["presentation-sha256"] !== PRESENTATION_SHA256 ||
      options["pristine-sha256"] !== W0_SHA256) fail("wrong immutable input digest");
  const presentationPath = path.resolve(options.presentation);
  const w0Path = path.resolve(options["pristine-w0"]);
  const presentationBytes = fs.readFileSync(presentationPath);
  const w0Bytes = fs.readFileSync(w0Path);
  if (sha(presentationBytes) !== PRESENTATION_SHA256 || sha(w0Bytes) !== W0_SHA256)
    fail("immutable row-4 input changed");
  const presentation = strictParse(presentationBytes, "row-4 presentation");
  const w0 = strictParse(w0Bytes, "pristine row-4 W0");
  presentationApi.verifyOwner(presentation, presentation.ancestry);
  const program = String.raw`import importlib,json,sys
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate JSON key: '+key)
  out[key]=value
 return out
p=json.load(open(sys.argv[1]),object_pairs_hook=strict)
w=json.load(open(sys.argv[3]),object_pairs_hook=strict)
sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row4_rank2_unit_authority')
o=m.compose_row4_rank2_unit_authority(p,sys.argv[2],w,sys.argv[4])
json.dump(o,sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("python3", ["-c", program, presentationPath, PRESENTATION_SHA256,
    w0Path, W0_SHA256], { cwd: ROOT, encoding: "utf8", timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "row-4 unit output");
  verifyOwner(owner, presentation, owner.ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { PRESENTATION_SHA256, Row4UnitFailure, SCHEMA, W0_SHA256, publish, verifyOwner };
