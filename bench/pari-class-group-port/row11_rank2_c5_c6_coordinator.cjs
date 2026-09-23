#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const laneAApi = require("./row11_terminal_class_closure_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row11_rank2_c5_c6.py");
const SCHEMA = "sagejs.pari-class-group/row11-rank2-c5-c6-v1";
const LANE_A_SHA256 = "46d74e9bcecc768bf90e61bdee702a240fde22f75e213a7fec0b9b5212618879";
const W0_SHA256 = "6444c0501657bf0109b96fff44c50e7684b80dcb1cfa4587951d1ae4abe04165";
const FIELD_ID = "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;

class Row11Rank2Failure extends Error {}
function fail(message) { throw new Row11Rank2Failure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function arraySha(values) { return sha(Buffer.from(values.join("\n"))); }
function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} has the wrong length`);
  return value.map((entry, index) => {
    if (typeof entry !== "string" || !INTEGER.test(entry)) fail(`${label}[${index}] is not canonical`);
    return entry;
  });
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
  const parsed = spawnSync("python3", ["-c", program], { cwd: ROOT, input: bytes,
    encoding: "utf8", timeout: 60_000, maxBuffer: 256 * 1024 * 1024 });
  if (parsed.status !== 0) fail(`${label} is not strict JSON`);
  return JSON.parse(parsed.stdout);
}
function argumentsOf(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!flag?.startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = flag.slice(2);
    if (Object.hasOwn(values, key)) fail(`duplicate --${key}`);
    values[key] = argv[index + 1];
  }
  const required = ["lane-a-owner", "output-dir", "pristine-w0"];
  if (Object.keys(values).sort().join("\0") !== required.sort().join("\0"))
    fail(`required arguments are ${required.map(key => `--${key}`).join(", ")}`);
  return values;
}
function authenticateInputs(options) {
  const laneBytes = fs.readFileSync(options["lane-a-owner"]);
  if (sha(laneBytes) !== LANE_A_SHA256) fail("Lane A owner identity changed");
  const laneA = strictParse(laneBytes, "Lane A owner");
  laneAApi.verifyOwner(laneA, laneA.ancestry);
  const w0Bytes = fs.readFileSync(options["pristine-w0"]);
  if (sha(w0Bytes) !== W0_SHA256) fail("pristine W0 identity changed");
  return { laneA, w0: strictParse(w0Bytes, "pristine W0") };
}
function verifyOwner(owner, ancestry = null) {
  if (!owner || owner.schema !== SCHEMA || owner.field?.id !== FIELD_ID ||
      owner.field?.panelIndex !== 11 || owner.field?.signature?.join(",") !== "2,1")
    fail("wrong row-11 rank-two owner identity");
  if (ancestry && JSON.stringify(owner.ancestry) !== JSON.stringify(ancestry)) fail("unit ancestry changed");
  if (owner.ancestry?.laneAOwnerSha256 !== LANE_A_SHA256 ||
      owner.ancestry?.pristineW0Sha256 !== W0_SHA256 ||
      owner.ancestry?.producerSourceSha256 !== sha(fs.readFileSync(SOURCE))) fail("unit ancestry is invalid");
  if (JSON.stringify(owner.dimensions) !== JSON.stringify({ factorBaseSize: 421,
    relationCount: 430, kernelRank: 9, unitRank: 2 })) fail("unit dimensions changed");
  const source = owner.sourceLogs || {};
  integers(source.kernelLogs, 189, "kernel logs");
  if (source.sourceOrderReconstructed !== true || source.kernelLogsShape?.join(",") !== "3,9,7" ||
      source.kernelLogsSha256 !== arraySha(source.kernelLogs) || source.frozenW0UsedAsInput !== true ||
      source.preparedNfLiveRoot !== false ||
      source.rawPackedLogsSha256 !== "a4d7c7bd8de856f5e398f58b906746078558c1d98629da1fa54d66269381c79c" ||
      source.kernelLogsSha256 !== "7a245a048c84a8ceda1a126d035113ac336da6bdb2e5ea588a568ce370d33604")
    fail("source log boundary changed");
  const units = owner.units || {};
  const transform = integers(units.unitKernelTransform, 18, "unit transform");
  const provenance = integers(units.rawUnitProvenance, 860, "raw unit provenance");
  if (units.unitKernelTransformShape?.join(",") !== "9,2" ||
      units.rawUnitProvenanceShape?.join(",") !== "430,2" ||
      units.rawRelationsTimesUnitKernelZero !== true || units.rawRelationsTimesUnitsZero !== true ||
      units.factoredUnitBasis !== "Lane A authenticated principalGenerators" ||
      units.nonzeroRelationFactors?.join(",") !== "330,330" ||
      units.unitNorms?.join(",") !== "1,1" || units.unitRealSignsShape?.join(",") !== "2,2" ||
      units.unitRealSigns?.join(",") !== "1,1,-1,-1") fail("exact compact unit boundary changed");
  if (arraySha(transform) !== "a6da6d7d0f4c3b3c687162ff4bcdb9eb22dd1b757d4438278c78eb1aae0c6010" ||
      arraySha(provenance) !== "e9a0c275d534b6246296662506b815517daa1e229cf664b24cdd9b47b14f108f")
    fail("exact unit arithmetic changed");
  if (!Array.isArray(units.compactFactoredUnits) || units.compactFactoredUnits.length !== 2)
    fail("compact factored units changed");
  for (let unit = 0; unit < 2; unit += 1) {
    const compact = units.compactFactoredUnits[unit];
    if (compact?.kind !== "signed-retained-relation-product" || compact.factorCount !== 330 ||
        compact.norm !== "1" || compact.realSigns?.join(",") !== (unit ? "-1,-1" : "1,1") ||
        compact.expandedGeneratorMaterialized !== false) fail("compact unit metadata changed");
    const indices = integers(compact.relationIndices, 330, "unit relation indices");
    const exponents = integers(compact.relationExponents, 330, "unit relation exponents");
    const factors = integers(compact.principalGenerators, 1320, "unit principal factors");
    if (compact.relationIndicesSha256 !== arraySha(indices) ||
        compact.relationExponentsSha256 !== arraySha(exponents) ||
        compact.principalGeneratorsSha256 !== arraySha(factors)) fail("compact unit digest changed");
    const expected = unit === 0
      ? ["53c456358f384773daf47c04f908ee2675ebf883bc343412ee88d0e0f39c80df",
        "4c54b0292d9aed8e471afafef468d61ab9b8416694d1270af869948e8eba3669",
        "7940ff920e130c59f4e773621d2da32c8d320d85c3d6118521304c1639a807eb"]
      : ["53c456358f384773daf47c04f908ee2675ebf883bc343412ee88d0e0f39c80df",
        "0c1f3cf5dce155c23200c0ad5b0965cec52b782bd16886d60ccf2bcc49f690c2",
        "7940ff920e130c59f4e773621d2da32c8d320d85c3d6118521304c1639a807eb"];
    if ([compact.relationIndicesSha256, compact.relationExponentsSha256,
      compact.principalGeneratorsSha256].join(",") !== expected.join(","))
      fail("compact unit arithmetic changed");
    const recomposed = Array(430).fill("0");
    for (let index = 0; index < 330; index += 1) {
      const relation = Number(indices[index]);
      if (!Number.isSafeInteger(relation) || relation < 0 || relation >= 430 ||
          (index && relation <= Number(indices[index - 1])) || exponents[index] === "0")
        fail("compact unit support changed");
      recomposed[relation] = exponents[index];
    }
    if (recomposed.join("\0") !== provenance.slice(430 * unit, 430 * (unit + 1)).join("\0"))
      fail("compact unit no longer recomposes provenance");
  }
  const c5 = owner.c5 || {};
  integers(c5.u1, 18, "C5 U1"); integers(c5.u2, 4, "C5 U2");
  integers(c5.archimedeanUnits, 42, "C5 archimedean units");
  integers(c5.privateGetfuFactor, 4, "C5 private factor");
  if (c5.state?.join(",") !== "0,0,0,0,0,0,0,0,0,7,7,2,0,0,0,1,0,0,2,2,-168,-134,-1,0,1")
    fail("C5 state changed");
  if (arraySha(c5.u1) !== "a6da6d7d0f4c3b3c687162ff4bcdb9eb22dd1b757d4438278c78eb1aae0c6010" ||
      arraySha(c5.u2) !== "84b09a9f3473cf350901e0b22f276ada55be278ec9b2b5387c3a2349b20331a2" ||
      arraySha(c5.archimedeanUnits) !== "af26117c55bdb665789e5d4f92556bbaffaba49af7350e2c710aa37a0c12b199" ||
      arraySha(c5.privateGetfuFactor) !== "3232be7fa71fde20c644c668f0f21294d82084ffd9114d36f2006ad353e69fc5")
    fail("C5 arithmetic changed");
  const c6 = owner.c6 || {};
  if (c6.executions !== 1 || c6.status !== 2 || c6.reason !== "LARGE" ||
      c6.state?.join(",") !== "2,21,0,0,0,0,0,1" || c6.materialization !== "not_given(LARGE)" ||
      c6.expandedUnitsPublished !== false || JSON.stringify(c6.traceSha256) !== JSON.stringify({
        solved: "c239781a4966f313159d044aff0ac89819825fe1f55af08389e890e29c2d1f8b",
        rounded: "b3aacbaaf6dee82921fd7ce837abbe4ca30e24197dc4fceeeab2e001de049d55",
        candidateUnits: "b3aacbaaf6dee82921fd7ce837abbe4ca30e24197dc4fceeeab2e001de049d55",
      })) fail("C6 terminal policy changed");
  if (owner.regulator?.matchesAccepted !== true ||
      integers(owner.regulator?.acceptedPacked, 3, "accepted regulator").join(",") !==
        "3312459349406852470715008030762890377736385282279907980094,192,38" ||
      integers(owner.regulator?.computedPacked, 3, "computed regulator").join(",") !==
        "61104089873074652764053421275692176367538182942695015493646112046997245542485,256,38")
    fail("regulator boundary changed");
  if (owner.replay?.arithmeticSha256 !== "1dc0743f86ccbb402af35599477742fee9cba50e056c790fa9a4258753ccb38d" ||
      owner.replay?.fundamentalUnitEventRead !== false ||
      owner.replay?.comparisonPerformedByCheckerOnly !== true) fail("replay policy changed");
  if (JSON.stringify(owner.completion) !== JSON.stringify({ compactFactoredUnitsRetained: true,
    exactSuffixComplete: true, inputBoundaryComplete: false, correspondenceComplete: true,
    publicComplete: false })) fail("completion boundary changed");
  // Keep these locals live in review: their fixed digests are checked by the immutable owner hash.
  if (!transform.length || !provenance.length) fail("empty unit arithmetic");
  return true;
}
function publish(owner, directory) {
  verifyOwner(owner);
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`), digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row11-rank2-c5-c6-${digest}.json`);
  if (fs.existsSync(destination)) {
    if (sha(fs.readFileSync(destination)) !== digest || (fs.statSync(destination).mode & 0o777) !== 0o444)
      fail("existing immutable unit owner changed");
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
  const options = argumentsOf(process.argv), input = authenticateInputs(options);
  const program = String.raw`import importlib,json,sys
sys.set_int_max_str_digits(1000000);sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row11_rank2_c5_c6')
lane=json.load(open(sys.argv[1]));w0=json.load(open(sys.argv[2]))
json.dump(m.compose_row11_rank2_c5_c6(lane,m.LANE_A_SHA256,w0,m.W0_SHA256),sys.stdout,separators=(',',':'));print()`;
  const started = process.hrtime.bigint();
  const run = spawnSync("timeout", ["600", "prlimit", "--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", "python3", "-c", program, options["lane-a-owner"], options["pristine-w0"]],
  { cwd: ROOT, encoding: "utf8", timeout: 610_000, maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) fail((run.stderr || run.stdout || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "row-11 rank-two output");
  verifyOwner(owner, owner.ancestry);
  process.stdout.write(`${JSON.stringify({ ...publish(owner, options["output-dir"]),
    suffixElapsedMs: Number((process.hrtime.bigint() - started) / 1000000n) })}\n`);
}
if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
}
module.exports = { LANE_A_SHA256, Row11Rank2Failure, SCHEMA, W0_SHA256,
  authenticateInputs, publish, verifyOwner };
