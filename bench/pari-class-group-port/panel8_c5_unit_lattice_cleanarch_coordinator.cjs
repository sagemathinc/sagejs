#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = "sagejs.pari-class-group/panel8-c5-unit-lattice-cleanarch-v2";

function fail(message) { throw new Error(`panel-8 C5 unit lattice: ${message}`); }
function digest(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }

function argumentsOf(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(result, key)) fail(`duplicate --${key}`);
    result[key] = argv[index + 1];
  }
  const required = ["accepted-owner", "accepted-sha256", "pristine-w0", "pristine-sha256", "output-dir"];
  if (Object.keys(result).sort().join("\0") !== required.sort().join("\0")) {
    fail(`required arguments are ${required.map((key) => `--${key}`).join(", ")}`);
  }
  return result;
}

function authenticate(file, expected, label, immutable = true) {
  if (!/^[0-9a-f]{64}$/.test(expected)) fail(`${label} digest is invalid`);
  const info = fs.statSync(file);
  if (!info.isFile()) fail(`${label} is not a file`);
  if (immutable && (info.mode & 0o777) !== 0o444) fail(`${label} is not an immutable mode-0444 file`);
  const bytes = fs.readFileSync(file);
  if (digest(bytes) !== expected) fail(`${label} digest changed`);
  JSON.parse(bytes.toString("utf8"));
  return path.resolve(file);
}

function verifyOwner(owner) {
  if (owner.schema !== SCHEMA || owner.precision !== 192 || owner.state.length !== 16 ||
      owner.state[0] !== 0 || owner.state[2] !== 3 || owner.state[3] !== 0 ||
      owner.state[4] !== 0 || owner.state[11] !== 1 ||
      owner.state.slice(12).join(",") !== "9,3,2,9" ||
      Math.abs(owner.state[7]) !== 1 || Math.abs(owner.state[10]) !== 1 ||
      owner.selection.result !== "NULL" || owner.selection.selectedColumns.length !== 0 ||
      owner.u1.length !== 18 || owner.u2.length !== 4 || owner.u.length !== 18 ||
      owner.au.length !== 42 || owner.cleanA.length !== 42 || owner.a.length !== 42 ||
      owner.getfuCandidateA.length !== 42 ||
      owner.getfuFactor.length !== 4 ||
      owner.ancestry.acceptedRetryOwnerSha256 !== owner.acceptedRetryOwnerSha256 ||
      owner.ancestry.pristineW0Sha256 !== owner.pristineW0Sha256 ||
      Object.values(owner.pristineComparison).includes(false)) {
    fail("arithmetic returned an invalid complete owner");
  }
}

function main() {
  const options = argumentsOf(process.argv);
  const accepted = authenticate(options["accepted-owner"], options["accepted-sha256"], "accepted retry owner");
  const pristine = authenticate(options["pristine-w0"], options["pristine-sha256"], "pristine W0 trace", false);
  const script = String.raw`
import hashlib,importlib,json,sys
sys.path.append('src/lib');sys.path.append('src/baselib')
m=importlib.import_module('bench.pari-class-group-port.panel8_c5_unit_lattice_cleanarch')
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
accepted=load(sys.argv[1],sys.argv[3]);pristine=load(sys.argv[2],sys.argv[4])
json.dump(m.compose_authenticated_panel8_c5(accepted,pristine,sys.argv[3],sys.argv[4]),sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`;
  const run = spawnSync("python3", ["-c", script, accepted, pristine,
    options["accepted-sha256"], options["pristine-sha256"]],
  { cwd: ROOT, encoding: "utf8", timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) fail((run.stderr || `python exited ${run.status}`).trim());
  const owner = JSON.parse(run.stdout);
  verifyOwner(owner);
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const sha256 = digest(bytes);
  fs.mkdirSync(options["output-dir"], { recursive: true });
  const destination = path.join(options["output-dir"], `panel8-c5-unit-lattice-${sha256}.json`);
  if (fs.existsSync(destination)) {
    if (digest(fs.readFileSync(destination)) !== sha256 ||
        (fs.statSync(destination).mode & 0o777) !== 0o444) fail("existing output owner changed");
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
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, path: destination, sha256, bytes: bytes.length })}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { authenticate, verifyOwner };
