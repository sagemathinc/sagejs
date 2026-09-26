#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { authenticatePreparedBundle } = require("./prepared_nf_authentication.cjs");
const {
  HISTORICAL_SOURCE_MANIFEST_SHA256,
  authenticateActiveRow11Manifest,
} = require("./row11_manifest_authority.cjs");

const ROOT = path.resolve(__dirname, "../..");
const MANIFEST = path.join(__dirname, "development-default-driver-manifest.json");
const SOURCE = path.join(__dirname, "row11_presentation_class_unit_adapter.py");
const SCHEMA = "sagejs.pari-class-group/row11-presentation-class-unit-boundary-v1";
const FIELD_ID = "generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab";
const W0_SHA256 = "6444c0501657bf0109b96fff44c50e7684b80dcb1cfa4587951d1ae4abe04165";
const DIGEST = /^[0-9a-f]{64}$/;
const INTEGER = /^-?(0|[1-9][0-9]*)$/;

class Row11CoordinatorFailure extends Error {}
function fail(message) { throw new Row11CoordinatorFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }

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
    cwd: ROOT, input: bytes, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (parsed.status !== 0) fail(`${label} is not strict JSON`);
  return JSON.parse(parsed.stdout);
}

function argumentsOf(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    values[argv[index].slice(2)] = argv[index + 1];
  }
  if (Object.keys(values).sort().join() !== ["output-dir", "pristine-sha256", "pristine-w0"].sort().join())
    fail("required arguments are --pristine-w0, --pristine-sha256, --output-dir");
  return values;
}

function integerStrings(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} has the wrong length`);
  return value.map((entry, index) => {
    if (typeof entry !== "string" || !INTEGER.test(entry)) fail(`${label}[${index}] is not canonical`);
    return entry;
  });
}

function verifyOwner(owner, ancestry = null) {
  if (!owner || owner.schema !== SCHEMA || owner.field?.id !== FIELD_ID ||
      owner.field?.panelIndex !== 11) fail("wrong row-11 owner identity");
  if (JSON.stringify(owner.field.polynomial) !== JSON.stringify(["-2000018", "-2000010", "0", "0", "1"]) ||
      JSON.stringify(owner.field.signature) !== "[2,1]") fail("row-11 field changed");
  if (ancestry && JSON.stringify(owner.ancestry) !== JSON.stringify(ancestry)) fail("row-11 ancestry changed");
  if (!owner.ancestry || Object.values(owner.ancestry).some(value => !DIGEST.test(value)))
    fail("row-11 ancestry digest changed");
  if (JSON.stringify(owner.schedule) !== JSON.stringify({
    initialRelations: 24, initialTarget: 428,
    hnf: [[427,427,2,2,3,418,1,2],[428,1,3,3,3,418,0,3],[430,2,2,2,2,419,0,2]],
    acceptance: [[1,"32"],[0,"4"]], retryTarget: 431,
  })) fail("row-11 schedule changed");
  const presentation = owner.presentation || {};
  const matrix = integerStrings(presentation.matrix, 4, "retained presentation");
  if (presentation.authority !== "authenticated-retained-exact-hnf" ||
      JSON.stringify(matrix) !== '["2","0","0","2"]' ||
      JSON.stringify(presentation.invariants) !== '["2","2"]' ||
      presentation.classNumber !== "4" || !Array.isArray(presentation.smithState) ||
      presentation.computedBeforeOracleComparison !== true ||
      presentation.oracleComparisonMatches !== true ||
      presentation.rawRelationClosureReplayed !== false ||
      presentation.matrixSha256 !== sha(Buffer.from(JSON.stringify(matrix))))
    fail("row-11 presentation changed");
  if (owner.classGenerators?.available !== false ||
      owner.classGenerators?.oracleClassOutputUsedAsAuthority !== false ||
      typeof owner.classGenerators?.blocker !== "string") fail("row-11 class-generator boundary changed");
  if (owner.units?.available !== false || owner.units?.rank !== 2 ||
      owner.units?.oracleMatricesCopied !== false || owner.units?.oracleFuWasNull !== true ||
      !DIGEST.test(owner.units?.oracleEventDigest) || typeof owner.units?.blocker !== "string")
    fail("row-11 unit boundary changed");
  if (JSON.stringify(owner.completion) !== JSON.stringify({ presentationComplete: true,
      classWitnessesComplete: false, unitsComplete: false, correspondenceComplete: false,
      publicComplete: false })) fail("row-11 completion boundary changed");
  return true;
}

function publish(owner, directory) {
  verifyOwner(owner);
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row11-presentation-class-unit-${digest}.json`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 || sha(fs.readFileSync(destination)) !== digest)
      fail("existing immutable row-11 owner changed");
  } else {
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination);
      fs.chmodSync(destination, 0o444);
    } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { schema: SCHEMA, path: destination, sha256: digest, bytes: bytes.length,
    presentationComplete: true, publicComplete: false };
}

function main() {
  const options = argumentsOf(process.argv);
  if (options["pristine-sha256"] !== W0_SHA256) fail("wrong pristine row-11 digest");
  const selected = path.resolve(options["pristine-w0"]);
  const bytes = fs.readFileSync(selected);
  if (sha(bytes) !== W0_SHA256) fail("pristine row-11 digest changed");
  const w0 = strictParse(bytes, "pristine row-11 W0");
  const manifestBytes = fs.readFileSync(MANIFEST);
  let record;
  try {
    record = authenticateActiveRow11Manifest({ manifestBytes, w0Bytes: bytes, w0, selected });
  } catch (error) {
    fail(error.message);
  }
  const prepared = authenticatePreparedBundle(w0);
  const ancestry = {
    pristineW0Sha256: W0_SHA256,
    // This is source provenance for the immutable W0, not the mutable active
    // policy gate authenticated immediately above.
    manifestSha256: HISTORICAL_SOURCE_MANIFEST_SHA256,
    preparedSha256: record.preparedSha256,
    eventsSha256: record.eventsSha256,
    terminalResultSha256: record.terminalResultSha256,
    preparedAuthoritySha256: prepared.sha256,
    sourceSha256: sha(fs.readFileSync(SOURCE)),
  };
  const program = String.raw`import hashlib,importlib,json,sys
data=open(sys.argv[1],'rb').read()
if hashlib.sha256(data).hexdigest()!=sys.argv[2]: raise ValueError('W0 changed after authentication')
w=json.loads(data);ancestry=json.load(sys.stdin);sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row11_presentation_class_unit_adapter')
json.dump(m.compose_row11_boundary(w,ancestry),sys.stdout,separators=(',',':'));print()`;
  const run = spawnSync("python3", ["-c", program, selected, W0_SHA256], {
    cwd: ROOT, input: JSON.stringify(ancestry), encoding: "utf8", timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  const owner = strictParse(Buffer.from(run.stdout), "row-11 boundary replay");
  verifyOwner(owner, ancestry);
  process.stdout.write(`${JSON.stringify(publish(owner, options["output-dir"]))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { Row11CoordinatorFailure, SCHEMA, verifyOwner, publish };
