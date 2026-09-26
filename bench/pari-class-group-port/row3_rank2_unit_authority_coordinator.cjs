#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const presentationApi = require("./row34_real_cubic_presentation_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row3_rank2_unit_authority.py");
const SCHEMA = "sagejs.pari-class-group/row3-rank2-unit-authority-v1";
const PRESENTATION_SHA256 = "200190446c7128e2fe8d549924f76c1ddfce205f857a0d55a1d523d287dd868b";
const W0_SHA256 = "8ef5cd64a3baaf0ff6f3e57951cdb0d1a7549879aef6dd089d5a69b39da970b9";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const DIGEST = /^[0-9a-f]{64}$/;

class Row3UnitFailure extends Error {}
function fail(message) { throw new Row3UnitFailure(message); }
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
      owner.field?.panelIndex !== 3) fail("wrong row-3 unit identity");
  if (JSON.stringify(owner.field) !== JSON.stringify(presentation.field) ||
      JSON.stringify(owner.dimensions) !== JSON.stringify(presentation.dimensions))
    fail("row-3 unit field owner changed");
  const ancestry = owner.ancestry || {};
  if (expectedAncestry && JSON.stringify(ancestry) !== JSON.stringify(expectedAncestry))
    fail("row-3 unit ancestry changed");
  if (ancestry.presentationAuthoritySha256 !== PRESENTATION_SHA256 ||
      ancestry.pristineW0Sha256 !== W0_SHA256 || !DIGEST.test(ancestry.producerSourceSha256) ||
      JSON.stringify(ancestry.presentation) !== JSON.stringify(presentation.ancestry))
    fail("row-3 unit ancestry is incomplete");

  const source = owner.sourceLogs || {};
  const kernel = integers(source.kernelLogs, 147, "kernel logs");
  if (source.frozenW0UsedAsInput !== true || source.preparedNfLiveRoot !== false ||
      source.qualifiedTiming !== false || JSON.stringify(source.kernelLogsShape) !== "[3,7,7]" ||
      source.kernelLogsSha256 !== arraySha(kernel) ||
      source.rawPackedLogsSha256 !== "dc2782dc43578a3b77428c6b92ed092dc66a1f244b5d5fbd7e8dee3c791e6e4c" ||
      source.kernelLogsSha256 !== "83d347d22716a2942fc4a76d7e4215c5aabc559a9a609ac83b9eacc95704a11e")
    fail("row-3 source-log boundary changed");

  const units = owner.units || {};
  const transform = integers(units.unitKernelTransform, 14, "unit transform");
  const provenance = integers(units.rawUnitProvenance, 1350, "raw unit provenance");
  if (units.materialization !== "not_given(LARGE)" || units.reason !== "LARGE" ||
      JSON.stringify(units.unitKernelTransformShape) !== "[7,2]" ||
      JSON.stringify(units.rawUnitProvenanceShape) !== "[675,2]" ||
      units.factoredUnitBasis !== "authenticated principalGenerators" ||
      JSON.stringify(units.nonzeroRelationFactors) !== "[443,443]" ||
      JSON.stringify(units.unitNorms) !== '["1","-1"]' ||
      JSON.stringify(units.unitRealSignsShape) !== "[3,2]" ||
      JSON.stringify(units.unitRealSigns) !== "[1,1,1,-1,-1,-1]" ||
      JSON.stringify(transform) !== '["3","-2","3","0","0","0","0","-2","1","-2","0","0","0","0"]' ||
      arraySha(provenance) !== "2d2ec2a83277b446b128e641741c0814042d2ac9c5652c7db933856fc70386e8")
    fail("row-3 compact unit authority changed");

  const regulator = owner.regulator || {};
  const packed = integers(regulator.packed, 3, "packed regulator");
  if (!Number.isFinite(regulator.computedFloat) || regulator.computedFloat <= 0 ||
      regulator.computedFloat !== regulator.expectedFloat ||
      regulator.computedFloat !== 199131804364643.8 ||
      JSON.stringify(packed) !== '["81918072897404054831103600241830063086672896646654055466097137320357977066393","256","47"]')
    fail("row-3 regulator authority changed");
  const replay = owner.replay || {};
  integers(replay.u1, 14, "integer transform");
  integers(replay.u2, 4, "real transform");
  integers(replay.getfuFactor, 4, "getfu factor");
  if (JSON.stringify(replay.hnfState) !== "[2,9,666,0,7,69,0,675,0]" ||
      replay.bridgeStatus !== 4 || JSON.stringify(replay.bridgeState) !== "[0,0,2,-1,-1]" ||
      replay.getfuStatus !== 2 || JSON.stringify(replay.getfuState) !== "[2,0,0,22,0,0,0,0]" ||
      replay.rawRelationsTimesUnitsZero !== true ||
      replay.allPrincipalRelationNormsReplayed !== true ||
      replay.allPrincipalGeneratorSignsProved !== true ||
      replay.fundamentalUnitEventRead !== false || replay.terminalResultEventRead !== false)
    fail("row-3 unit replay evidence changed");
  const arithmetic = { kernelLogs: kernel, unitKernelTransform: transform,
    rawUnitProvenance: provenance, unitNorms: units.unitNorms,
    unitRealSigns: units.unitRealSigns, packedRegulator: packed };
  if (replay.arithmeticSha256 !== canonicalSha(arithmetic) ||
      replay.arithmeticSha256 !== "9ddcbe6978531144129fc650a272646462634c33a7bb97a3c1de6ab545fc38a7")
    fail("row-3 arithmetic digest changed");

  const completion = { compactFactoredUnitsRetained: true,
    exactExpandedUnitsPublished: false, exactSuffixComplete: true,
    inputBoundaryComplete: false, correspondenceComplete: false, publicComplete: false };
  if (JSON.stringify(owner.completion) !== JSON.stringify(completion))
    fail("row-3 unit completion boundary changed");
  return true;
}

function publish(owner, directory) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row3-rank2-unit-authority-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing immutable row-3 unit authority changed");
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
      options["pristine-sha256"] !== W0_SHA256) fail("wrong row-3 immutable digest");
  const presentationPath = path.resolve(options.presentation);
  const w0Path = path.resolve(options["pristine-w0"]);
  const presentationBytes = fs.readFileSync(presentationPath);
  const w0Bytes = fs.readFileSync(w0Path);
  if (sha(presentationBytes) !== PRESENTATION_SHA256 || sha(w0Bytes) !== W0_SHA256)
    fail("immutable row-3 input changed");
  const presentation = strictParse(presentationBytes, "row-3 presentation");
  const w0 = strictParse(w0Bytes, "pristine row-3 W0");
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
m=importlib.import_module('bench.pari-class-group-port.row3_rank2_unit_authority')
o=m.compose_row3_rank2_unit_authority(p,sys.argv[2],w,sys.argv[4])
json.dump(o,sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("timeout", ["600", "prlimit", "--as=4294967296",
    "--rss=4294967296", "--cpu=600", "--", "python3", "-c", program,
    presentationPath, PRESENTATION_SHA256, w0Path, W0_SHA256], {
    cwd: ROOT, encoding: "utf8", timeout: 610_000, maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "row-3 unit output");
  verifyOwner(owner, presentation, owner.ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { PRESENTATION_SHA256, Row3UnitFailure, SCHEMA, W0_SHA256, publish, verifyOwner };
