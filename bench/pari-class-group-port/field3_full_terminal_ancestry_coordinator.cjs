#!/usr/bin/env node
"use strict";

// Content-addressed publication boundary for the additive full-terminal owner.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = "sagejs.pari-class-group/field3-full-terminal-ancestry-v1";

function fail(message) {
  throw new Error(`field3 full terminal ancestry: ${message}`);
}

function digest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function argumentsOf(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) {
      fail("invalid arguments");
    }
    result[argv[index].slice(2)] = argv[index + 1];
  }
  const required = [
    "raw-owner", "raw-sha256", "protocol-owner", "protocol-sha256",
    "authority-owner", "authority-sha256", "output-dir",
  ];
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
  const raw = authenticate(options["raw-owner"], options["raw-sha256"], "raw owner");
  const protocol = authenticate(
    options["protocol-owner"], options["protocol-sha256"], "protocol owner",
  );
  const authority = authenticate(
    options["authority-owner"], options["authority-sha256"], "authority owner",
  );
  const script = String.raw`
import hashlib,importlib,json,sys
sys.path.append('src/lib');sys.path.append('src/baselib')
m=importlib.import_module('bench.pari-class-group-port.field3_full_terminal_ancestry')
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
raw=load(sys.argv[1],sys.argv[4]);protocol=load(sys.argv[2],sys.argv[5]);authority=load(sys.argv[3],sys.argv[6])
json.dump(m.transform_authenticated_owners(raw,protocol,authority),sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`;
  const run = spawnSync(
    "python3",
    ["-c", script, raw, protocol, authority, options["raw-sha256"],
      options["protocol-sha256"], options["authority-sha256"]],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 256 },
  );
  if (run.status !== 0) fail((run.stderr || `python exited ${run.status}`).trim());
  const result = JSON.parse(run.stdout);
  if (
    result.schema !== SCHEMA ||
    result.transform.length !== 301 * 15 ||
    result.packedTerminal.length !== 15 * 3 * 7 ||
    result.packedA.length !== 13 * 3 * 7 ||
    result.packedCe.length !== 2 * 3 * 7
  ) fail("transform returned an invalid complete owner");
  result.rawOwnerSha256 = options["raw-sha256"];
  result.protocolOwnerSha256 = options["protocol-sha256"];
  result.authorityOwnerSha256 = options["authority-sha256"];
  const bytes = Buffer.from(`${JSON.stringify(result)}\n`);
  const sha256 = digest(bytes);
  fs.mkdirSync(options["output-dir"], { recursive: true });
  const destination = path.join(
    options["output-dir"], `field3-full-terminal-ancestry-${sha256}.json`,
  );
  if (fs.existsSync(destination)) {
    if (
      digest(fs.readFileSync(destination)) !== sha256 ||
      (fs.statSync(destination).mode & 0o777) !== 0o444
    ) fail("existing output owner changed");
  } else {
    const temporary = path.join(
      options["output-dir"], `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`,
    );
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

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
