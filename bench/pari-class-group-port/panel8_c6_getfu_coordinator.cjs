#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const preparedAuth = require("./prepared_nf_authentication.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = "sagejs.pari-class-group/c6-getfu-not-given-v1";
const PREPARED_SCHEMA = "sagejs.pari-class-group/panel8-c6-prepared-input-v1";
const PREPARED_AUTHORITY = "f36824d6417ced98e5d18529489801f687d61c78f9f9fdabb96d6d19099b0e01";
const SOURCE = path.join(__dirname, "panel8_c6_getfu.py");

function fail(message) { throw new Error(`panel-8 C6 getfu: ${message}`); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }

function argumentsOf(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(result, key)) fail(`duplicate --${key}`);
    result[key] = argv[index + 1];
  }
  const required = ["c5-owner", "c5-sha256", "accepted-owner", "accepted-sha256",
    "pristine-w0", "pristine-sha256", "output-dir"];
  if (Object.keys(result).sort().join("\0") !== required.sort().join("\0"))
    fail(`required arguments are ${required.map(key => `--${key}`).join(", ")}`);
  return result;
}

function authenticate(file, expected, label, immutable = true) {
  if (!/^[0-9a-f]{64}$/.test(expected)) fail(`${label} digest is invalid`);
  const info = fs.statSync(file);
  if (!info.isFile()) fail(`${label} is not a file`);
  if (immutable && (info.mode & 0o777) !== 0o444) fail(`${label} is not mode 0444`);
  const bytes = fs.readFileSync(file);
  if (sha(bytes) !== expected) fail(`${label} digest changed`);
  return { path: path.resolve(file), value: JSON.parse(bytes), sha256: expected };
}

function preparedInput(w0, w0Sha256, field) {
  const authority = preparedAuth.authenticatePreparedBundle(w0);
  if (authority.sha256 !== PREPARED_AUTHORITY) fail("prepared authority changed");
  if (authority.degree !== 4 || authority.signature.join(",") !== "2,1" ||
      authority.polynomial.join(",") !== "-20034,-20018,0,0,1")
    fail("prepared field identity changed");
  const normalized = preparedAuth.normalizePreparedBundle(w0);
  const triple = index => [normalized.admission_matrix_m[index],
    normalized.admission_matrix_p[index], normalized.admission_matrix_e[index]];
  const real = [], imaginary = [];
  for (let column = 0; column < 4; column += 1) {
    // The W0 export is row-major realification: the two real places, then
    // real and imaginary parts of the complex place.  `getfu` consumes
    // column-major triples over the three archimedean places.
    for (const row of [0, 1, 2]) real.push(...triple(4 * row + column));
    imaginary.push("0", "-1", "0", "0", "-1", "0", ...triple(12 + column));
  }
  if (real.length !== 36 || imaginary.length !== 36) fail("embedding conversion failed");
  return {
    schema: PREPARED_SCHEMA,
    field,
    w0Sha256,
    preparedAuthoritySha256: authority.sha256,
    embeddingReal: real,
    embeddingImag: imaginary,
    multiplicationTensor: normalized.basis_table,
  };
}

function verifyOwner(owner) {
  if (owner.schema !== SCHEMA || owner.precision !== 192 || owner.status !== "not_given" ||
      owner.reason !== "PRECI" || owner.matchedFlagZero !== true ||
      owner.exactUnitsPublished !== false || owner.publicComplete !== false ||
      owner.correspondenceComplete !== true || owner.materialization !== "not_given(PRECI)" ||
      owner.state.join(",") !== "3,15,-185,0,69863,0,0,1" ||
      owner.unitTransformShape.join(",") !== "9,2" || owner.unitTransform.length !== 18 ||
      owner.archimedeanUnitShape.join(",") !== "3,2" || owner.archimedeanUnits.length !== 42 ||
      owner.regulator.length !== 3 || owner.ancestry.preparedAuthoritySha256 !== PREPARED_AUTHORITY ||
      owner.arithmeticTraceSha256.archReal !==
        "e2a550f6fdce9f1fb606277a13dd94bcc8ea5b802f5312f4443496e0e9b04bc4" ||
      owner.arithmeticTraceSha256.rounded !==
        "d867a2ade06e649c3f53a11634fe5f3b4b1e72707de8831dc10414d444964d10" ||
      owner.preparedInputs.w0FieldsConsumed.join(",") !==
        "prepared.embeddingM,prepared.multiplicationTensor" ||
      owner.pristineComparison.comparedAfterComputation !== true ||
      owner.pristineComparison.intermediateArraysConsumed !== false)
    fail("arithmetic returned an invalid C6 owner");
}

function atomicPublish(directory, owner) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const digest = sha(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `c6-getfu-not-given-${digest}.json`);
  if (fs.existsSync(destination)) {
    if (sha(fs.readFileSync(destination)) !== digest ||
        (fs.statSync(destination).mode & 0o777) !== 0o444) fail("existing output changed");
  } else {
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination);
      fs.chmodSync(destination, 0o444);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  return { schema: SCHEMA, path: destination, sha256: digest, bytes: bytes.length };
}

function main() {
  const options = argumentsOf(process.argv);
  const c5 = authenticate(options["c5-owner"], options["c5-sha256"], "C5 owner");
  const accepted = authenticate(options["accepted-owner"], options["accepted-sha256"], "accepted owner");
  const w0 = authenticate(options["pristine-w0"], options["pristine-sha256"], "W0", false);
  const prepared = preparedInput(w0.value, w0.sha256, c5.value.field);
  const sourceSha256 = sha(fs.readFileSync(SOURCE));
  const script = String.raw`
import hashlib,importlib,json,sys
sys.set_int_max_str_digits(100000)
sys.path += ['src/lib','src/baselib']
m=importlib.import_module('bench.pari-class-group-port.panel8_c6_getfu')
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate JSON key: '+key)
  out[key]=value
 return out
def load(path,expected):
 data=open(path,'rb').read()
 if hashlib.sha256(data).hexdigest()!=expected: raise ValueError('owner changed after authentication')
 return json.loads(data,object_pairs_hook=strict)
c5=load(sys.argv[1],sys.argv[3]);accepted=load(sys.argv[2],sys.argv[4])
prepared=json.load(sys.stdin,object_pairs_hook=strict)
result=m.compose_authenticated_panel8_c6(c5,accepted,prepared,sys.argv[3],sys.argv[4],sys.argv[5],sys.argv[6])
json.dump(result,sys.stdout,separators=(',',':'));sys.stdout.write('\n')
`;
  const run = spawnSync("python3", ["-c", script, c5.path, accepted.path, c5.sha256,
    accepted.sha256, w0.sha256, sourceSha256], { cwd: ROOT, input: JSON.stringify(prepared),
    encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) fail((run.stderr || `python exited ${run.status}`).trim());
  const owner = JSON.parse(run.stdout);
  verifyOwner(owner);
  process.stdout.write(`${JSON.stringify(atomicPublish(options["output-dir"], owner))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { PREPARED_AUTHORITY, PREPARED_SCHEMA, SCHEMA, atomicPublish,
  authenticate, preparedInput, verifyOwner };
