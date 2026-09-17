#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const coordinator = path.join(__dirname, "field3_c5_unit_lattice_cleanarch_coordinator.cjs");

function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
function immutableOwner(directory, name, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const file = path.join(directory, name);
  fs.writeFileSync(file, bytes, { mode: 0o444 });
  return { file, sha256: sha(bytes) };
}
function latches(values) {
  const p1 = 2305843009213693951n, p2 = 2305843009213693921n;
  let first = BigInt(values.length), second = 3n * BigInt(values.length);
  values.forEach((text, index) => {
    const value = BigInt(text), at = BigInt(index + 1);
    first = (first * 1000003n + ((value % p1) + p1) % p1 + at) % p1;
    second = (second * 1000033n + ((value % p2) + p2) % p2 + at) % p2;
  });
  return [String(first), String(second)];
}

const zero = ["1", "0", "-1", "0", "0", "-1", "0"];
const triple = (mantissa, exponent = 0) => ["1", String(mantissa), "64", String(exponent), "0", "-1", "0"];
const packedA = Array.from({ length: 39 }, () => zero).flat();
const columns = [
  [triple(1n << 63n), triple(1n << 63n), triple(-((1n << 64n) - 1n))],
  [triple(1n << 63n), triple(1n << 63n, 1), triple(-(3n * (1n << 62n) - 1n), 1)],
];
for (let column = 0; column < 2; column++) for (let row = 0; row < 3; row++) {
  packedA.splice((column * 3 + row) * 7, 7, ...columns[column][row]);
}
const transform = Array(301 * 15).fill("0");
for (let column = 0; column < 15; column++) transform[column * 301 + column] = "1";
const relations = Array(26).fill("0"); relations[0] = "1"; relations[3] = "1";
const identity = { field: "synthetic mixed quartic", runIdentity: "synthetic-c5-owner-v1" };
const full = { ...identity, schema: "sagejs.pari-class-group/field3-full-terminal-ancestry-v1",
  targetBits: 64, terminalShape: [3, 15], transformShape: [301, 15], unitColumns: 13,
  classColumns: 2, retentionState: [0, 301, 15, 293, 3, 4515, 13, 2],
  imageState: [0, 288, 301, 13, 2, 15, 3744, 576], packedCe: Array.from({ length: 6 }, () => zero).flat(), transform };
const c3 = { ...identity, schema: "sagejs.pari-class-group/field3-high-precision-A-v1",
  targetBits: 64, acceptedShape: [3, 13], transformShape: [301, 13],
  kernelState: [0, 288, 301, 13, 3744], packedA, transform: transform.slice(0, 301 * 13) };

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "field3-c5-"));
try {
  const fullOwner = immutableOwner(temporary, "full.json", full);
  const c3Owner = immutableOwner(temporary, "c3.json", c3);
  const c4 = { ...identity, schema: "sagejs.pari-class-group/field3-accepted-c4-v1",
    fullTerminalOwnerSha256: fullOwner.sha256, c3OwnerSha256: c3Owner.sha256,
    analytic: { status: "accepted", badCheckStatus: 0, fieldDerived: true,
      precisionRetryComplete: true }, candidatePublished: true, analyticPending: false,
    precision: "64", generation: "1", acceptanceState: ["0", "1", "64", "1"],
    candidateRelations: relations, candidateRegulator: [String(1n << 63n), "64", "0"],
    c3Hash: ["0", "0", "0", "0"], c3Latches: latches(packedA) };
  const c4Owner = immutableOwner(temporary, "c4.json", c4);
  const args = [coordinator, "--full-owner", fullOwner.file, "--full-sha256", fullOwner.sha256,
    "--c3-owner", c3Owner.file, "--c3-sha256", c3Owner.sha256,
    "--accepted-c4-owner", c4Owner.file, "--accepted-c4-sha256", c4Owner.sha256,
    "--output-dir", temporary];
  const first = JSON.parse(run(process.execPath, args));
  const second = JSON.parse(run(process.execPath, args));
  assert.deepEqual(second, first);
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  const output = JSON.parse(fs.readFileSync(first.path));
  assert.deepEqual(output.state, [0, 64, 3, 0, 0, 0, 0, -1, 1, 1, 301, 13, 2, 2, 15]);
  assert.deepEqual(output.getfuFactor, ["1", "0", "0", "1"]);
  assert.equal(output.rawUnitTransform.length, 602);

  // The authentic 153,088-bit owner contains canonical packed integers with
  // about 46,000 decimal digits.  Verify that the authenticated Python
  // boundary can parse them despite CPython's generic 4,300-digit guard.
  const largeIntegerProbe = String.raw`
import importlib,sys
sys.path.append('src/lib');sys.path.append('src/baselib')
m=importlib.import_module('bench.pari-class-group-port.field3_c5_unit_lattice_cleanarch')
value='1'+'0'*46103
assert m._integers([value],1,'large authenticated integer')[0] == int(value)
`;
  run("python3", ["-c", largeIntegerProbe]);

  // Every mutation is written as a new immutable owner.  Failure must not
  // create a content-addressed C5 publication.
  for (const [label, mutate] of [
    ["analytic", (x) => { x.analytic.badCheckStatus = 1; }],
    ["detached C3", (x) => { x.c3OwnerSha256 = "0".repeat(64); }],
    ["latch", (x) => { x.c3Latches[0] = String(BigInt(x.c3Latches[0]) + 1n); }],
    ["regulator", (x) => { x.candidateRegulator[0] = "0"; }],
  ]) {
    const changed = structuredClone(c4); mutate(changed);
    const owner = immutableOwner(temporary, `bad-${label.replaceAll(" ", "-")}.json`, changed);
    const before = new Set(fs.readdirSync(temporary).filter((name) => name.startsWith("field3-c5-unit-lattice-")));
    const rejected = spawnSync(process.execPath, args.map((value, index) => {
      if (index > 0 && args[index - 1] === "--accepted-c4-owner") return owner.file;
      if (index > 0 && args[index - 1] === "--accepted-c4-sha256") return owner.sha256;
      return value;
    }), { cwd: root, encoding: "utf8" });
    assert.notEqual(rejected.status, 0, `${label} mutation was accepted`);
    assert.deepEqual(new Set(fs.readdirSync(temporary).filter((name) => name.startsWith("field3-c5-unit-lattice-"))), before);
  }

  const sourcePath = path.join(__dirname, "field3_c5_unit_lattice_cleanarch.py");
  const compile = String.raw`
const path=require('node:path');const runtimeRoot=process.argv[1],sourcePath=process.argv[2];
(async()=>{const {compileKernel}=require(path.join(runtimeRoot,'tools/native-kernel/compiler.cjs'));
const built=await compileKernel({sourcePath});const api=require(built.modulePath).pari_field3_c5_unit_lattice_cleanarch;
if(!api.nativeAvailable)throw Error('C5 root unavailable');
const args=Array.from({length:81},()=>[]);args[4]=64n;
let rejected=false;try{api.javascript(...args)}catch(_){rejected=true}if(!rejected)throw Error('short owner accepted');
console.log(JSON.stringify({native:true,core:built.coreSourcePath}));})().catch(e=>{console.error(e);process.exitCode=1});`;
  const runtimeRoot = process.env.SAGEJS_REPLAY_RUNTIME_ROOT || root;
  const native = JSON.parse(run(process.execPath, ["-e", compile, runtimeRoot, sourcePath]));
  const core = fs.readFileSync(native.core, "utf8");
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);
  console.log(JSON.stringify({ schema: "field3-c5-unit-lattice-check-v1", cpython: true,
    javascriptPreflight: true, precisionCap: 153088, publication: "atomic-idempotent-0444",
    syntheticOnly: true }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
