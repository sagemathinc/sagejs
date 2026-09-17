#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const C4_SCHEMA = "sagejs.pari-class-group/field3-accepted-c4-v1";
const ANALYTIC_SCHEMA = "sagejs.pari-class-group/field3-analytic-accepted-owner-v1";

function fail(message) {
  throw new Error(`field3 accepted C4: ${message}`);
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
  const exact = result.operation === "accept"
    ? ["operation", "full-terminal-owner", "full-terminal-sha256", "c3-owner", "c3-sha256",
      "field-owner", "field-sha256", "catalog-owner", "catalog-sha256", "output-dir"]
    : result.operation === "project-c7"
      ? ["operation", "accepted-c4-owner", "accepted-c4-sha256", "output-dir"]
      : [];
  if (Object.keys(result).sort().join("\0") !== exact.sort().join("\0")) {
    fail(`required arguments are ${exact.map((key) => `--${key}`).join(", ")}`);
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

function python(script, args) {
  const run = spawnSync("python3", ["-c", script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.status !== 0) fail((run.stderr || `python exited ${run.status}`).trim());
  return JSON.parse(run.stdout);
}

function publish(outputDir, stem, schema, value) {
  if (value.schema !== schema) fail(`${stem} arithmetic returned the wrong schema`);
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const sha256 = digest(bytes);
  fs.mkdirSync(outputDir, { recursive: true });
  const destination = path.join(outputDir, `${stem}-${sha256}.json`);
  if (fs.existsSync(destination)) {
    const info = fs.statSync(destination);
    if (!info.isFile() || (info.mode & 0o777) !== 0o444 ||
        digest(fs.readFileSync(destination)) !== sha256) {
      fail(`existing ${stem} owner changed`);
    }
  } else {
    const temporary = path.join(
      outputDir,
      `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`,
    );
    try {
      fs.writeFileSync(temporary, bytes, { mode: 0o400, flag: "wx" });
      fs.chmodSync(temporary, 0o444);
      fs.renameSync(temporary, destination);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  return { schema, path: destination, sha256, bytes: bytes.length };
}

const loader = String.raw`
import hashlib,importlib,json,sys
sys.path.append('src/lib');sys.path.append('src/baselib')
m=importlib.import_module('bench.pari-class-group-port.field3_accepted_c4_owner')
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
`;

function project(file, sha256) {
  return python(loader + String.raw`
owner=load(sys.argv[1],sys.argv[2])
json.dump(m.project_analytic_owner(owner,sys.argv[2]),sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`, [file, sha256]);
}

function main() {
  const options = argumentsOf(process.argv);
  if (options.operation === "project-c7") {
    const accepted = authenticate(
      options["accepted-c4-owner"], options["accepted-c4-sha256"], "accepted C4 owner",
    );
    const analytic = project(accepted, options["accepted-c4-sha256"]);
    process.stdout.write(`${JSON.stringify(publish(
      options["output-dir"], "field3-analytic-accepted", ANALYTIC_SCHEMA, analytic,
    ))}\n`);
    return;
  }
  const inputs = [
    ["full-terminal-owner", "full-terminal-sha256", "full terminal owner"],
    ["c3-owner", "c3-sha256", "C3 owner"],
    ["field-owner", "field-sha256", "field owner"],
    ["catalog-owner", "catalog-sha256", "catalog owner"],
  ].map(([file, sha, label]) => authenticate(options[file], options[sha], label));
  const accepted = python(loader + String.raw`
owners=[load(sys.argv[i],sys.argv[i+4]) for i in range(1,5)]
json.dump(m.compose_authenticated_c4(*owners,*sys.argv[5:9]),sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`, [...inputs, options["full-terminal-sha256"], options["c3-sha256"],
    options["field-sha256"], options["catalog-sha256"]]);
  const c4 = publish(options["output-dir"], "field3-accepted-c4", C4_SCHEMA, accepted);
  // C7's owner is a separately authenticated projection.  It cannot contain
  // an independently handwritten regulator because its sole source is the
  // just-published immutable C4 content address.
  const analytic = project(c4.path, c4.sha256);
  const c7 = publish(
    options["output-dir"], "field3-analytic-accepted", ANALYTIC_SCHEMA, analytic,
  );
  process.stdout.write(`${JSON.stringify({ acceptedC4: c4, analyticAccepted: c7 })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
