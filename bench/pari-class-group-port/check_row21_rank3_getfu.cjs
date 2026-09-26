#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row21_rank3_getfu.py");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-21-6966124ec38a3af1.json";
const W0_SHA256 = "45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a";

const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function python(source, input = "") {
  const result = spawnSync("python3", ["-c", source, ROOT, W0_SHA256], {
    cwd: ROOT, input, encoding: "utf8", timeout: 180_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout);
}
function values(value) {
  if (Array.isArray(value)) return value;
  return value.toArray ? value.toArray() : Array.from(value);
}

(async () => {
  const bytes = fs.readFileSync(W0);
  assert.equal(digest(bytes), W0_SHA256);
  const probeScript = String.raw`
import importlib,json,sys
sys.path.extend([sys.argv[1],sys.argv[1]+'/src/lib'])
m=importlib.import_module('bench.pari-class-group-port.row21_rank3_getfu')
json.dump(m.probe_row21_rank3_getfu(json.load(sys.stdin),sys.argv[2]),sys.stdout,separators=(',',':'))
`;
  const first = python(probeScript, bytes);
  const second = python(probeScript, bytes);
  assert.deepEqual(second, first);
  assert.equal(first.publishable, false);
  assert.equal(first.correspondenceComplete, false);
  assert.equal(first.postcomputeDifferential.referenceFuImported, false);
  assert.deepEqual(first.getfuState, [0, 5, -185, 0, -130, 2, 3, 1]);
  assert.deepEqual(first.exactUnitProofs.map(proof => proof.norm), ["-1", "-1", "-1"]);
  assert.deepEqual(first.exactUnitProofs.map(proof => proof.realSigns),
    [[-1, 1, 1], [1, -1, 1], [1, -1, 1]]);
  assert(first.exactUnitProofs.every(proof =>
    JSON.stringify(proof.principalIdealProductBasis) === JSON.stringify(["1", "0", "0", "0", "0"])));

  const inputScript = String.raw`
import importlib,json,sys
sys.path.extend([sys.argv[1],sys.argv[1]+'/src/lib'])
l=importlib.import_module('bench.pari-class-group-port.row21_rank3_unit_lattice')
z=json.load(sys.stdin);p=l.probe_row21_rank3_unit_lattice(z,sys.argv[2]);Z=lambda n:[0]*n
clean=list(map(int,p['cleanLogs']));factor=list(map(int,p['privateGetfuFactor']))
out=[Z(n) for n in (84,84,84,36,36,36,36)];l.pari_prepare_getfu_31_quintic(clean,factor,*out)
def pack(v):
 return [int(v['value']),-1,0] if v['kind']=='integer' else [int(v['mantissa']),int(v['precision']),int(v['exponent'])]
em=z['prepared']['embeddingM'];er=[];ei=[]
for column in range(5):
 for row in range(4):
  er+=pack(em[5*row+column]);ei+=([0,-1,0] if row<3 else pack(em[20+column]))
json.dump({'archReal':out[3],'archImag':out[4],'cleanReal':out[5],'cleanImag':out[6],
 'factor':factor,'embeddingReal':er,'embeddingImag':ei,
 'tensor':list(map(int,z['prepared']['multiplicationTensor']))},sys.stdout,separators=(',',':'))
`;
  const input = python(inputScript, bytes);
  const built = await compileKernel({ sourcePath: SOURCE });
  const f = require(built.modulePath).pari_getfu_rank3_mixed_quintic;
  assert(f.nativeAvailable);
  const lengths = [36, 36, 75, 45, 75, 45, 45, 15, 25, 5, 15, 15, 36, 36];
  const backends = ["javascript", "gmp", "tagged"];
  for (const backend of backends) {
    const pack = array => backend === "javascript" ? array.map(BigInt) :
      f.createIntegerBuffer(array.length, 2048, array.map(BigInt));
    const zero = length => backend === "javascript" ? Array(length).fill(0n) :
      f.createIntegerBuffer(length, 2048);
    const outputs = lengths.map(zero);
    const state = backend === "javascript" ? Array(8).fill(0n) : f.createInt64Buffer(8);
    const pivots = backend === "javascript" ? Array(5).fill(0n) : f.createInt64Buffer(5);
    const args = [pack(input.archReal), pack(input.archImag), pack(input.cleanReal),
      pack(input.cleanImag), pack(input.factor), pack(input.embeddingReal),
      pack(input.embeddingImag), pack(input.tensor), 192n,
      outputs[0], outputs[1], outputs[2], outputs[3], outputs[4], outputs[5],
      outputs[6], outputs[7], outputs[8], outputs[9], outputs[10], outputs[11],
      outputs[12], outputs[13], state, pivots, zero(3), zero(3), zero(512),
      zero(512), zero(512), zero(512), zero(91)];
    const status = f[backend](...args);
    assert.equal(status, 0n, `${backend}: ${values(state)}`);
    assert.deepEqual(values(state), [0n, 5n, -185n, 0n, -2n, 2n, 3n, 1n],
      `${backend}: state`);
    assert.deepEqual(values(outputs[11]), first.exactUnitBasis.map(BigInt), `${backend}: units`);
  }

  const mutation = structuredClone(JSON.parse(bytes));
  mutation.events.find(event => event.event === "fundamental_units")
    .fu.values[0].coefficients[0].left.value = "0";
  const failed = spawnSync("python3", ["-c", probeScript, ROOT, W0_SHA256], {
    cwd: ROOT, input: JSON.stringify(mutation), encoding: "utf8", timeout: 180_000,
  });
  assert.notEqual(failed.status, 0);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row21-rank3-getfu-check-v1",
    backends,
    getfuState: first.getfuState,
    exactNorms: first.exactUnitProofs.map(proof => proof.norm),
    exactRealSigns: first.exactUnitProofs.map(proof => proof.realSigns),
    oracleIsolation: "reference unit event read only after arithmetic and exact replay",
    publishable: false,
    remainingOwnerDependency: first.remainingOwnerDependency,
    native: { cacheKey: built.cacheKey, coreBytes: fs.statSync(built.coreSourcePath).size },
  })}\n`);
})().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
