#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const authentication = require("./prepared_nf_authentication.cjs");
const { makeFreshInput } = require("./check_row1_resident_generated_class_attempt.cjs");

const ROOT = path.resolve(__dirname, "../..");

function rejected(payload, mutation) {
  const program = String.raw`
import collections.abc,dataclasses,decimal,fractions,hashlib,importlib,json,sys,typing
sys.set_int_max_str_digits(100000)
sys.path[:0]=[sys.argv[1],sys.argv[1]+"/src/lib"]
d=json.load(sys.stdin);v={}
for name,kind in d["names"]:
 c=bool if kind=="bool" else float if kind in ("float","Float64Buffer") else int
 value=d["input"][name];v[name]=list(map(c,value)) if isinstance(value,list) else c(value)
v.update(d["mutation"])
f=importlib.import_module("bench.pari-class-group-port.resident_generated_class_attempt").pari_resident_generated_class_attempt
try:f(**v)
except ValueError as e:print(str(e))
else:raise AssertionError("invalid cubic signature was accepted")
`;
  const run = spawnSync("python3", ["-c", program, ROOT], { cwd: ROOT,
    input: JSON.stringify({ ...payload, mutation }), encoding: "utf8",
    timeout: 600_000, maxBuffer: 128 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return run.stdout.trim();
}

function main() {
  assert.equal(process.argv.length, 3,
    "usage: check_resident_generated_cubic_signature.cjs ROW16_W0");
  const bundle = JSON.parse(fs.readFileSync(path.resolve(process.argv[2])));
  const prepared = authentication.normalizePreparedBundle(bundle);
  const payload = makeFreshInput(prepared);
  assert.equal(rejected(payload, { admission_real_count: 2 }),
    "resident generated fixed cubic frontier");
  assert.equal(rejected(payload, {
    admission_real_count: 1,
    analytic_discriminant: Math.abs(prepared.analytic_discriminant),
  }), "resident generated real-cubic metadata frontier");
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/resident-generated-cubic-signature-check-v1",
    mixedSignatureAcceptedByGenuineRow16Check: true,
    invalidRealCountRejected: true,
    discriminantSignatureMismatchRejected: true,
    realCubicRegression: "check_row1_resident_generated_class_attempt.cjs",
  })}\n`);
}

main();
