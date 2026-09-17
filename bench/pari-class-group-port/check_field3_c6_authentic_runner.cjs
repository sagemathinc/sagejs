#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const publisher = require("./field3_c6_embedding_owner_coordinator.cjs");
const runner = require("./field3_c6_authentic_runner.cjs");

const root = path.resolve(__dirname, "../..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "field3-c6-runner-"));
const output = path.join(temporary, "owners");

class BufferOwner {
  constructor(entries) { this.entries = entries.map(BigInt); }
  toArray() { return [...this.entries]; }
  get length() { return this.entries.length; }
}

function api(entry) {
  return {
    nativeAvailable: true,
    createIntegerBuffer(length, capacity, initial = []) {
      assert(capacity >= 1);
      const entries = Array(length).fill(0n);
      initial.forEach((value, index) => { entries[index] = BigInt(value); });
      return new BufferOwner(entries);
    },
    createInt64Buffer(initial) { return new BufferOwner(initial); },
    gmp: entry,
  };
}

function writeOwner(stem, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const digest = publisher.sha(bytes);
  const selected = path.join(temporary, `${stem}-${digest}.json`);
  fs.writeFileSync(selected, bytes, { mode: 0o444 });
  fs.chmodSync(selected, 0o444);
  return { path: selected, sha256: digest, value };
}

// Derive the exact tensor independently from the polynomial and integral
// basis, never from a roots/embedding answer tape.
const tensorRun = spawnSync("python3", ["-c", String.raw`
import json
from fractions import Fraction as Q
p=[-2000042,-2000022,0,0,1];den=37
z=[37,0,0,0,0,37,0,0,0,-37,37,0,-1499998,-63,14,1]
b=[[Q(z[4*j+i],den) for i in range(4)] for j in range(4)]
def mul(x,y):
 a=[Q(0) for _ in range(7)]
 for i in range(4):
  for j in range(4): a[i+j]+=x[i]*y[j]
 for d in range(6,3,-1):
  for j in range(4): a[d-4+j]-=a[d]*p[j]
 return a[:4]
def solve(v):
 a=[[b[c][r] for c in range(4)]+[v[r]] for r in range(4)]
 for c in range(4):
  q=next(r for r in range(c,4) if a[r][c]);a[c],a[q]=a[q],a[c]
  d=a[c][c];a[c]=[x/d for x in a[c]]
  for r in range(4):
   if r!=c:
    d=a[r][c];a[r]=[a[r][j]-d*a[c][j] for j in range(5)]
 return [a[r][4] for r in range(4)]
t=[]
for i in range(4):
 for j in range(4):
  q=solve(mul(b[i],b[j]));assert all(x.denominator==1 for x in q);t += [int(x) for x in q]
print(json.dumps(t))
`], { encoding: "utf8" });
assert.equal(tensorRun.status, 0, tensorRun.stderr);
const tensor = JSON.parse(tensorRun.stdout).map(String);
assert.equal(tensor.length, 64);
const preparedValue = {
  schema: publisher.SOURCE_SCHEMA,
  runIdentity: publisher.RUN,
  polynomial: ["-2000042", "-2000022", "0", "0", "1"],
  signature: ["2", "1"],
  zkden: "37",
  zk: ["37", "0", "0", "0", "0", "37", "0", "0", "0", "-37", "37", "0", "-1499998", "-63", "14", "1"],
  tensor,
  // These deliberately bogus values prove publication ignores any numerical
  // answer carried by the exact prepared capsule.
  roots: [["9"]],
  embedding: ["9"],
};
const prepared = writeOwner("prepared", preparedValue);

let embeddingCalls = 0;
const unit = 1n << 153151n;
const embeddingApi = api((polynomial, signature, basis, denominator, multiplication,
  target, scratch, rm, rp, re, em, ep, ee, state) => {
  embeddingCalls++;
  assert.equal(target, 153088n);
  assert.equal(denominator, 37n);
  const roots = [-unit, unit, unit, unit];
  for (let index = 0; index < 4; index++) {
    rm.entries[index] = roots[index]; rp.entries[index] = 153152n; re.entries[index] = 0n;
  }
  // Four realified rows by four columns.  Only the exact identity column is
  // interpreted by this transport-layer checker.
  for (let index = 0; index < 16; index++) {
    em.entries[index] = unit; ep.entries[index] = 153152n; ee.entries[index] = 0n;
  }
  for (const index of [0, 4, 8]) { em.entries[index] = 1n; ep.entries[index] = -1n; }
  em.entries[12] = 0n; ep.entries[12] = -1n;
  state.entries.splice(0, 6, 0n, 153088n, 153152n, 153664n, 2n, 1n);
  return 0n;
});
const embeddingCandidateValue = runner.runEmbedding(
  embeddingApi, preparedValue, prepared.sha256, "a".repeat(64), "focused-attempt",
);
assert.equal(embeddingCalls, 1);
const embeddingCandidate = writeOwner("embedding-candidate", embeddingCandidateValue);
const embeddingOwner = publisher.publishEmbedding(
  prepared, embeddingCandidate, output,
);
assert.equal(fs.statSync(embeddingOwner.path).mode & 0o777, 0o444);
assert.equal(
  publisher.publishEmbedding(prepared, embeddingCandidate, output).sha256,
  embeddingOwner.sha256,
);
assert.equal(embeddingOwner.value.roots[0][0], String(-unit));
assert.notDeepEqual(embeddingOwner.value.roots, preparedValue.roots);

const detached = structuredClone(embeddingCandidateValue);
detached.preparedOwnerSha256 = "0".repeat(64);
assert.throws(
  () => publisher.publishEmbedding(prepared, writeOwner("detached", detached), output),
  /ancestry changed/,
);

const zero18 = Array(18).fill("0");
const c5 = {
  schema: "sagejs.pari-class-group/field3-c5-unit-lattice-cleanarch-v1",
  field: "x^4-2000022*x-2000042",
  runIdentity: publisher.RUN,
  precision: 153088,
  generation: 7,
  getfuFactor: ["1", "0", "0", "1"],
  cleanPacked: Array(42).fill("0"),
  preparedArchReal: zero18,
  preparedArchImag: zero18,
  preparedCleanReal: zero18,
  preparedCleanImag: zero18,
  rawUnitTransform: Array(602).fill("0"),
};
let c6Calls = 0;
const terminalApi = api((...args) => {
  c6Calls++;
  assert.equal(args[9].length, 64);
  assert.equal(args[37].length, 16385); // a
  assert.equal(args[41].length, 105); // stack
  const state = args.at(-1);
  state.entries.splice(0, 12, 3n, 153088n, 7n, 0n, 0n, 1n, 16385n, 301n, 0n, 0n, 0n, 0n);
  return 3n;
});
const terminal = runner.runC6(
  terminalApi, c5, embeddingOwner.value, "b".repeat(64), embeddingOwner.sha256,
  "c".repeat(64), "focused-attempt",
);
assert.equal(c6Calls, 1);
assert.equal(terminal.candidate.status, 3);
assert.deepEqual(terminal.candidate.units, []);
assert.deepEqual(terminal.candidate.adjustedWraw, []);

// The success-side source owner is constructed only after C6 and binds every
// owner needed by the downstream exact factorback verifier.
const relationMetadata = [];
for (let column = 0; column < 301; column++) relationMetadata.push(column + 1, 0, 0);
const relation = {
  value: { authority: { owners: {
    principalGenerators: Array(1204).fill("0"),
    relationRecords: Array(86688).fill("0"),
    relationMetadata,
  } } },
  sha256: "d".repeat(64),
};
const c5Owner = { value: c5, sha256: "b".repeat(64) };
const c6Owner = { value: {
  schema: "sagejs.pari-class-group/field3-c6-getfu-v1",
  status: "success",
}, sha256: "e".repeat(64) };
const source = runner.factorbackSource(
  c5Owner, c6Owner, embeddingOwner, relation,
  [unit, 153088n, 1n],
);
assert.equal(source.schema, runner.SOURCE_SCHEMA);
assert.equal(source.c5OwnerSha256, c5Owner.sha256);
assert.equal(source.c6OwnerSha256, c6Owner.sha256);
assert.equal(source.relationOwnerSha256, relation.sha256);
assert.deepEqual(source.phasePeriodMultipliers, ["1", "1", "2"]);
assert.deepEqual(source.twoPi, [String(unit), "153088", "2"]);
assert.equal(source.phaseToleranceExponent, -153079);
assert.equal(source.embeddingReal.length, 36);
assert.equal(source.embeddingImag.length, 36);
assert.deepEqual(source.embeddingImag.slice(0, 6), ["0", "-1", "0", "0", "-1", "0"]);

const shortRelation = structuredClone(relation);
shortRelation.value.authority.owners.relationRecords.pop();
assert.throws(
  () => runner.factorbackSource(c5Owner, c6Owner, embeddingOwner, shortRelation, [unit, 153088n, 1n]),
  /relation records has the wrong length/,
);
assert.throws(
  () => runner.factorbackSource(c5Owner, c6Owner, embeddingOwner, relation, [unit, 153024n, 1n]),
  /pi authority/,
);

// Retain the genuine low-precision pristine-PARI differential for the exact
// arithmetic leaf, without compiling or launching the authentic 153088 run.
const low = spawnSync(process.execPath, [
  path.join(__dirname, "check_field3_high_precision_getfu.cjs"),
], { cwd: root, encoding: "utf8", timeout: 10 * 60 * 1000, maxBuffer: 256 * 1024 * 1024 });
assert.equal(low.status, 0, low.stderr || String(low.error));
const lowResult = JSON.parse(low.stdout);
assert.equal(lowResult.pristinePariDifferential, true);
assert.equal(lowResult.authentic153088Executed, false);

console.log(JSON.stringify({
  status: "pass",
  embeddingCalls,
  c6Calls,
  embeddingOwnerSha256: embeddingOwner.sha256,
  lowPrecisionDifferential: lowResult.pristinePariDifferential,
  authenticRunLaunched: false,
  factorbackSourceCells: 1204 + 86688 + 64 + 602 + 36 + 36,
}));
