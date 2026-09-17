#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const C4_SCHEMA = "sagejs.pari-class-group/field3-accepted-c4-v1";
const ANALYTIC_SCHEMA = "sagejs.pari-class-group/field3-analytic-accepted-owner-v1";
const TEST_C4_SCHEMA = "sagejs.pari-class-group/test-field3-accepted-c4-v1";
const TEST_ANALYTIC_SCHEMA = "sagejs.pari-class-group/test-field3-analytic-accepted-owner-v1";
const FIELD_SCHEMA = "sagejs.pari-class-group/field3-analytic-field-v1";
const CATALOG_SCHEMA = "sagejs.pari-class-group/field3-analytic-prime-catalog-v1";
const TEST_FIELD_SCHEMA = "sagejs.pari-class-group/test-field3-analytic-field-v1";
const TEST_CATALOG_SCHEMA = "sagejs.pari-class-group/test-field3-analytic-prime-catalog-v1";

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
  const predecessors = ["full-terminal-owner", "full-terminal-sha256", "c3-owner", "c3-sha256",
    "field-owner", "field-sha256", "catalog-owner", "catalog-sha256"];
  const exact = result.operation === "derive-inputs"
    ? ["operation", "profile", "prepared-owner", "prepared-sha256", "initial-owner",
      "initial-sha256", "authority-owner", "authority-sha256", "output-dir"]
    : result.operation === "accept"
    ? ["operation", "full-terminal-owner", "full-terminal-sha256", "c3-owner", "c3-sha256",
      "field-owner", "field-sha256", "catalog-owner", "catalog-sha256", "output-dir"]
    : result.operation === "project-c7"
      ? ["operation", "accepted-c4-owner", "accepted-c4-sha256", ...predecessors, "output-dir"]
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

function project(file, sha256, inputs, inputDigests) {
  return python(loader + String.raw`
owner=load(sys.argv[1],sys.argv[2])
owners=[load(sys.argv[i],sys.argv[i+4]) for i in range(3,7)]
json.dump(m.project_analytic_owner(owner,sys.argv[2],*owners,*sys.argv[7:11]),sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`, [file, sha256, ...inputs, ...inputDigests]);
}

function predecessorInputs(options) {
  const specification = [
    ["full-terminal-owner", "full-terminal-sha256", "full terminal owner"],
    ["c3-owner", "c3-sha256", "C3 owner"],
    ["field-owner", "field-sha256", "field owner"],
    ["catalog-owner", "catalog-sha256", "catalog owner"],
  ];
  return {
    files: specification.map(([file, sha, label]) => authenticate(options[file], options[sha], label)),
    digests: specification.map(([, sha]) => options[sha]),
  };
}

function main() {
  const options = argumentsOf(process.argv);
  if (options.operation === "derive-inputs") {
    if (!["production", "synthetic-test"].includes(options.profile)) fail("invalid profile");
    const sources = [
      ["prepared-owner", "prepared-sha256", "prepared embedding owner"],
      ["initial-owner", "initial-sha256", "initial collector owner"],
      ["authority-owner", "authority-sha256", "catalog authority owner"],
    ];
    const files = sources.map(([file, sha, label]) => authenticate(options[file], options[sha], label));
    const derived = python(loader + String.raw`
owners=[load(sys.argv[i],sys.argv[i+3]) for i in range(1,4)]
field,catalog=m.derive_analytic_inputs(*owners,*sys.argv[4:7],sys.argv[7])
json.dump({'field':field,'catalog':catalog},sys.stdout,separators=(',',':'));sys.stdout.write('\n')
`, [...files, ...sources.map(([, sha]) => options[sha]), options.profile]);
    const production = options.profile === "production";
    const field = publish(options["output-dir"], production ? "field3-analytic-field" : "test-field3-analytic-field",
      production ? FIELD_SCHEMA : TEST_FIELD_SCHEMA, derived.field);
    derived.catalog.fieldOwnerSha256 = field.sha256;
    const catalog = publish(options["output-dir"], production ? "field3-analytic-prime-catalog" : "test-field3-analytic-prime-catalog",
      production ? CATALOG_SCHEMA : TEST_CATALOG_SCHEMA, derived.catalog);
    process.stdout.write(`${JSON.stringify({ field, catalog })}\n`);
    return;
  }
  if (options.operation === "project-c7") {
    const accepted = authenticate(
      options["accepted-c4-owner"], options["accepted-c4-sha256"], "accepted C4 owner",
    );
    const sources = predecessorInputs(options);
    const analytic = project(accepted, options["accepted-c4-sha256"], sources.files, sources.digests);
    const test = analytic.schema === TEST_ANALYTIC_SCHEMA;
    process.stdout.write(`${JSON.stringify(publish(
      options["output-dir"], test ? "test-field3-analytic-accepted" : "field3-analytic-accepted",
      test ? TEST_ANALYTIC_SCHEMA : ANALYTIC_SCHEMA, analytic,
    ))}\n`);
    return;
  }
  const sources = predecessorInputs(options);
  const result = python(loader + String.raw`
owners=[load(sys.argv[i],sys.argv[i+4]) for i in range(1,5)]
accepted=m.compose_authenticated_c4(*owners,*sys.argv[5:9])
encoded=(json.dumps(accepted,separators=(',',':'))+'\n').encode()
accepted_sha=hashlib.sha256(encoded).hexdigest()
analytic=m.project_analytic_owner(accepted,accepted_sha,*owners,*sys.argv[5:9])
json.dump({'accepted':accepted,'analytic':analytic},sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`, [...sources.files, ...sources.digests]);
  const test = result.accepted.schema === TEST_C4_SCHEMA;
  const c4 = publish(options["output-dir"], test ? "test-field3-accepted-c4" : "field3-accepted-c4",
    test ? TEST_C4_SCHEMA : C4_SCHEMA, result.accepted);
  if (result.analytic.acceptedC4OwnerSha256 !== c4.sha256) fail("C7 projection detached before publication");
  const c7 = publish(
    options["output-dir"], test ? "test-field3-analytic-accepted" : "field3-analytic-accepted",
    test ? TEST_ANALYTIC_SCHEMA : ANALYTIC_SCHEMA, result.analytic,
  );
  process.stdout.write(`${JSON.stringify({ acceptedC4: c4, analyticAccepted: c7 })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
