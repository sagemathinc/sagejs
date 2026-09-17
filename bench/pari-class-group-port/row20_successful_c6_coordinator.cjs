#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = "sagejs.pari-class-group/row20-successful-c6-v1";
const W0_SHA256 = "6ea7098d80c586a7fbf050f9f650f4a3bff258cd84dd7a2a3c7dab210d1bf468";

function fail(message) { throw new Error(`row-20 successful C6: ${message}`); }
function digest(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }

function argumentsOf(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(result, key)) fail(`duplicate --${key}`);
    result[key] = argv[index + 1];
  }
  const required = ["pristine-w0", "pristine-sha256", "output-dir"];
  if (Object.keys(result).sort().join("\0") !== required.sort().join("\0"))
    fail(`required arguments are ${required.map(key => `--${key}`).join(", ")}`);
  return result;
}

function authenticateW0(file, expected) {
  if (expected !== W0_SHA256) fail("wrong predeclared W0 digest");
  const info = fs.statSync(file);
  if (!info.isFile()) fail("W0 is not a file");
  const bytes = fs.readFileSync(file);
  if (digest(bytes) !== expected) fail("W0 digest changed");
  return { path: path.resolve(file), bytes };
}

function verifyOwner(owner) {
  if (owner.schema !== SCHEMA || owner.status !== "success" || owner.precision !== 192 ||
      owner.exactUnitsPublished !== true || owner.field?.panelIndex !== 20 ||
      owner.field?.id !== "5.1.1000000.1" || owner.field?.signature?.join(",") !== "1,2" ||
      owner.unitTransformShape?.join(",") !== "7,2" || owner.unitTransform?.length !== 14 ||
      owner.getfuFactor?.join(",") !== "0,1,1,0" ||
      owner.exactUnitBasisShape?.join(",") !== "5,2" ||
      owner.exactUnitBasis?.join(",") !== "7,-7,15,-9,9,-27,15,8,6,-9" ||
      owner.exactUnitProofs?.length !== 2 ||
      owner.exactUnitProofs.some(proof => !["-1", "1"].includes(proof.norm) ||
        proof.principalIdealProductBasis?.join(",") !== "1,0,0,0,0" ||
        proof.sevenRawGeneratorExponents?.length !== 7 || proof.powerBasis?.length !== 5) ||
      owner.c5State?.integerLll?.join(",") !== "5,5,2,0,0" ||
      owner.c5State?.cleanarch?.join(",") !== "0,2,2,-188,-185,-1" ||
      owner.c6State?.join(",") !== "0,3,-186,0,-185,1,2,-1" ||
      owner.ancestry?.pristineW0Sha256 !== W0_SHA256 ||
      owner.provenance?.referenceFuImported !== false ||
      owner.provenance?.referenceReadAfterComputation !== true) {
    fail("arithmetic returned an invalid owner");
  }
}

function atomicPublish(directory, owner) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const sha256 = digest(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row20-successful-c6-${sha256}.json`);
  if (fs.existsSync(destination)) {
    if (digest(fs.readFileSync(destination)) !== sha256 ||
        (fs.statSync(destination).mode & 0o777) !== 0o444) fail("existing output changed");
  } else {
    const temporary = path.join(directory,
      `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination);
      fs.chmodSync(destination, 0o444);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  return { schema: SCHEMA, path: destination, sha256, bytes: bytes.length };
}

function main() {
  const options = argumentsOf(process.argv);
  const w0 = authenticateW0(options["pristine-w0"], options["pristine-sha256"]);
  const script = String.raw`
import hashlib,importlib,json,sys
sys.set_int_max_str_digits(100000)
sys.path += ['src/lib','src/baselib']
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate JSON key: '+key)
  out[key]=value
 return out
data=open(sys.argv[1],'rb').read()
if hashlib.sha256(data).hexdigest()!=sys.argv[2]: raise ValueError('W0 changed after authentication')
bundle=json.loads(data,object_pairs_hook=strict)
m=importlib.import_module('bench.pari-class-group-port.row20_successful_c6')
json.dump(m.compose_authenticated_row20(bundle,sys.argv[2]),sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`;
  const run = spawnSync("python3", ["-c", script, w0.path, W0_SHA256], {
    cwd: ROOT, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `python exited ${run.status}`).trim());
  const owner = JSON.parse(run.stdout);
  verifyOwner(owner);
  process.stdout.write(`${JSON.stringify(atomicPublish(options["output-dir"], owner))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { SCHEMA, W0_SHA256, atomicPublish, authenticateW0, verifyOwner };
