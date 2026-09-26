#!/usr/bin/env node
"use strict";

// Content-addressed coordinator for the C2/C3 field-3 handoff.  It has no
// option for a terminal A or a low-precision checkpoint.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const OUTPUT_SCHEMA = "sagejs.pari-class-group/field3-high-precision-A-v1";

function fail(message) {
  throw new Error(`field3 high-precision HNF transform: ${message}`);
}

function args(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key.startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    result[key.slice(2)] = argv[index + 1];
  }
  const operation = result.operation;
  const exact = operation === "capture-protocol"
    ? ["operation", "authority", "authority-sha256", "initial", "initial-sha256", "output-dir"]
    : operation === "transform"
      ? ["operation", "raw-owner", "raw-sha256", "protocol-owner", "protocol-sha256", "output-dir"]
      : [];
  if (Object.keys(result).sort().join("\0") !== exact.sort().join("\0")) {
    fail(`required arguments are ${exact.map((key) => `--${key}`).join(", ")}`);
  }
  return result;
}

function digest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function owner(file, expected, label) {
  if (!/^[0-9a-f]{64}$/.test(expected)) fail(`${label} digest is invalid`);
  const stat = fs.statSync(file);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o444) fail(`${label} is not an immutable mode-0444 file`);
  const bytes = fs.readFileSync(file);
  if (digest(bytes) !== expected) fail(`${label} digest changed`);
  JSON.parse(bytes.toString("utf8"));
  return path.resolve(file);
}

function main() {
  const options = args(process.argv);
  if (options.operation === "capture-protocol") {
    const authority = owner(
      options.authority,
      options["authority-sha256"],
      "resident authority",
    );
    const initial = owner(
      options.initial,
      options["initial-sha256"],
      "initial owner",
    );
    const script = String.raw`
import importlib,json,sys
sys.path.append('src/lib');sys.path.append('src/baselib')
m=importlib.import_module('bench.pari-class-group-port.field3_high_precision_hnf_transform')
captured=m.capture_local_hnf_protocol(sys.argv[1],sys.argv[2])
json.dump(m.publish_local_hnf_protocol(sys.argv[3],captured),sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`;
    const run = spawnSync("python3", ["-c", script, authority, initial, options["output-dir"]], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8,
    });
    if (run.status !== 0) fail((run.stderr || `python exited ${run.status}`).trim());
    process.stdout.write(run.stdout);
    return;
  }
  const raw = owner(options["raw-owner"], options["raw-sha256"], "raw owner");
  const protocol = owner(
    options["protocol-owner"],
    options["protocol-sha256"],
    "local-HNF protocol owner",
  );
  const script = String.raw`
import hashlib,importlib,json,sys
sys.path.append('src/lib');sys.path.append('src/baselib')
m=importlib.import_module('bench.pari-class-group-port.field3_high_precision_hnf_transform')
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
raw=load(sys.argv[1],sys.argv[3]);protocol=load(sys.argv[2],sys.argv[4])
json.dump(m.transform_authenticated_owners(raw,protocol),sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`;
  const run = spawnSync("python3", ["-c", script, raw, protocol, options["raw-sha256"], options["protocol-sha256"]], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 256,
  });
  if (run.status !== 0) fail((run.stderr || `python exited ${run.status}`).trim());
  const result = JSON.parse(run.stdout);
  if (result.schema !== OUTPUT_SCHEMA || result.packedA.length !== 13 * 3 * 7) {
    fail("transform returned an invalid complete owner");
  }
  result.rawOwnerSha256 = options["raw-sha256"];
  result.protocolOwnerSha256 = options["protocol-sha256"];
  const bytes = Buffer.from(`${JSON.stringify(result)}\n`);
  const sha256 = digest(bytes);
  fs.mkdirSync(options["output-dir"], { recursive: true });
  const destination = path.join(options["output-dir"], `field3-high-precision-A-${sha256}.json`);
  if (fs.existsSync(destination)) {
    if (digest(fs.readFileSync(destination)) !== sha256 || (fs.statSync(destination).mode & 0o777) !== 0o444) {
      fail("existing output owner changed");
    }
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
  process.stdout.write(`${JSON.stringify({ schema: OUTPUT_SCHEMA, path: destination, sha256, bytes: bytes.length })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
