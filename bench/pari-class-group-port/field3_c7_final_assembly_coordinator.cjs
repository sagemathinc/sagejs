#!/usr/bin/env node
"use strict";

// Immutable, content-addressed C7 correspondence publication and cold replay.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = "sagejs.pari-class-group/field3-c7-correspondence-v1";

function fail(message) {
  throw new Error(`field3 C7 final assembly: ${message}`);
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
  return result;
}
function authenticate(file, expected, label) {
  if (!/^[0-9a-f]{64}$/.test(expected)) fail(`${label} digest is invalid`);
  const absolute = path.resolve(file);
  const info = fs.statSync(absolute);
  if (!info.isFile() || (info.mode & 0o777) !== 0o444) {
    fail(`${label} is not an immutable mode-0444 file`);
  }
  const bytes = fs.readFileSync(absolute);
  if (digest(bytes) !== expected) fail(`${label} digest changed`);
  return absolute;
}

const PYTHON = String.raw`
import hashlib,importlib,json,sys
sys.path.append('src/lib');sys.path.append('src/baselib')
m=importlib.import_module('bench.pari-class-group-port.field3_c7_final_assembly')
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
operation=sys.argv[1]
paths=sys.argv[2:6];hashes=sys.argv[6:10]
owners=[load(path,digest) for path,digest in zip(paths,hashes,strict=True)]
for owner,digest in zip(owners,hashes,strict=True): owner['_authenticatedSha256']=digest
result=m.assemble_authenticated_owners(*owners)
result['sourceOwners']={name:{'sha256':digest} for name,digest in zip(('full15','regulator','unit','live'),hashes,strict=True)}
result['coldReplayCapable']=True
encoded=json.dumps(result,separators=(',',':'),sort_keys=True)+'\n'
if operation=='prepare':
 sys.stdout.write(encoded)
elif operation=='replay':
 envelope=load(sys.argv[10],sys.argv[11])
 if envelope!=json.loads(encoded,object_pairs_hook=strict): raise ValueError('cold replay correspondence changed')
 print(json.dumps({'schema':'sagejs.pari-class-group/field3-c7-replay-v1','envelopeSha256':sys.argv[11],'coldReplay':True,'correspondenceComplete':True,'publicComplete':False},separators=(',',':'),sort_keys=True))
else: raise ValueError('unknown operation')
`;

function runPython(operation, owners, hashes, envelope, envelopeHash) {
  const args = ["-c", PYTHON, operation, ...owners, ...hashes];
  if (operation === "replay") args.push(envelope, envelopeHash);
  const run = spawnSync("python3", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: 240_000,
  });
  if (run.status !== 0) fail((run.stderr || `python exited ${run.status}`).trim());
  return Buffer.from(run.stdout);
}

function main() {
  const options = argumentsOf(process.argv);
  const operation = options.operation;
  const base = ["full15", "regulator", "unit", "live"];
  const required = ["operation", ...base.flatMap((name) => [name, `${name}-sha256`])];
  if (operation === "prepare") required.push("output-dir");
  else if (operation === "replay") required.push("envelope", "envelope-sha256");
  else fail("operation must be prepare or replay");
  if (Object.keys(options).sort().join("\0") !== required.sort().join("\0")) {
    fail(`wrong argument set for ${operation}`);
  }
  const owners = [];
  const hashes = [];
  for (const name of base) {
    hashes.push(options[`${name}-sha256`]);
    owners.push(authenticate(options[name], options[`${name}-sha256`], `${name} owner`));
  }
  if (operation === "replay") {
    const envelope = authenticate(options.envelope, options["envelope-sha256"], "envelope");
    process.stdout.write(runPython(operation, owners, hashes, envelope, options["envelope-sha256"]));
    return;
  }
  const bytes = runPython(operation, owners, hashes);
  const shallow = JSON.parse(bytes.toString("utf8"));
  if (shallow.schema !== SCHEMA || shallow.correspondenceComplete !== true ||
      shallow.publicComplete !== false) {
    fail("Python returned an invalid C7 envelope");
  }
  const sha256 = digest(bytes);
  fs.mkdirSync(options["output-dir"], { recursive: true });
  const destination = path.join(options["output-dir"], `field3-c7-${sha256}.json`);
  if (fs.existsSync(destination)) {
    if (digest(fs.readFileSync(destination)) !== sha256 || (fs.statSync(destination).mode & 0o777) !== 0o444) {
      fail("existing envelope changed");
    }
  } else {
    const temporary = path.join(options["output-dir"], `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination);
      fs.chmodSync(destination, 0o444);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, path: destination, sha256, bytes: bytes.length, publicComplete: false })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
