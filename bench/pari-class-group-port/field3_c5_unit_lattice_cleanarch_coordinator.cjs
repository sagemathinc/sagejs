#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = "sagejs.pari-class-group/field3-c5-unit-lattice-cleanarch-v1";

function fail(message) {
  throw new Error(`field3 C5 unit lattice: ${message}`);
}

function digest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function argumentsOf(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(result, key)) fail(`duplicate --${key}`);
    result[key] = argv[index + 1];
  }
  const required = ["full-owner", "full-sha256", "c3-owner", "c3-sha256",
    "accepted-c4-owner", "accepted-c4-sha256", "output-dir"];
  if (Object.keys(result).sort().join("\0") !== required.sort().join("\0")) {
    fail(`required arguments are ${required.map((key) => `--${key}`).join(", ")}`);
  }
  return result;
}

function authenticate(file, expected, label) {
  if (!/^[0-9a-f]{64}$/.test(expected)) fail(`${label} digest is invalid`);
  const info = fs.statSync(file);
  if (!info.isFile() || (info.mode & 0o777) !== 0o444) {
    fail(`${label} is not an immutable mode-0444 file`);
  }
  const bytes = fs.readFileSync(file);
  if (digest(bytes) !== expected) fail(`${label} digest changed`);
  JSON.parse(bytes.toString("utf8"));
  return path.resolve(file);
}

function main() {
  const options = argumentsOf(process.argv);
  const full = authenticate(options["full-owner"], options["full-sha256"], "full owner");
  const c3 = authenticate(options["c3-owner"], options["c3-sha256"], "C3 owner");
  const c4 = authenticate(options["accepted-c4-owner"], options["accepted-c4-sha256"], "accepted C4 owner");
  const script = String.raw`
import hashlib,importlib,json,sys
sys.path.append('src/lib');sys.path.append('src/baselib')
m=importlib.import_module('bench.pari-class-group-port.field3_c5_unit_lattice_cleanarch')
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
full=load(sys.argv[1],sys.argv[4]);c3=load(sys.argv[2],sys.argv[5]);c4=load(sys.argv[3],sys.argv[6])
json.dump(m.compose_authenticated_c5(full,c3,c4,sys.argv[4],sys.argv[5],sys.argv[6]),sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`;
  const run = spawnSync("python3", ["-c", script, full, c3, c4,
    options["full-sha256"], options["c3-sha256"], options["accepted-c4-sha256"]],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) fail((run.stderr || `python exited ${run.status}`).trim());
  const result = JSON.parse(run.stdout);
  if (result.schema !== SCHEMA || result.state.length !== 15 ||
      result.state[0] !== 0 || result.state[2] !== 3 || result.state[9] !== 1 ||
      Math.abs(result.state[7]) !== 1 || Math.abs(result.state[8]) !== 1 ||
      result.state.slice(10).join(",") !== "301,13,2,2,15" ||
      result.rawUnitTransform.length !== 602 || result.finalTransform.length !== 26 ||
      result.cleanPacked.length !== 42 || result.preparedArchReal.length !== 18) {
    fail("arithmetic returned an invalid complete owner");
  }
  const bytes = Buffer.from(`${JSON.stringify(result)}\n`);
  const sha256 = digest(bytes);
  fs.mkdirSync(options["output-dir"], { recursive: true });
  const destination = path.join(options["output-dir"], `field3-c5-unit-lattice-${sha256}.json`);
  if (fs.existsSync(destination)) {
    if (digest(fs.readFileSync(destination)) !== sha256 ||
        (fs.statSync(destination).mode & 0o777) !== 0o444) fail("existing output owner changed");
  } else {
    const temporary = path.join(options["output-dir"], `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
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

try { main(); } catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
