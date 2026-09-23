#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "mixed_real_torsion_authority.py");
const polynomial = [-2000042n, -2000022n, 0n, 0n, 1n];
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024, ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
};
const values = value => Array.isArray(value) ? value
  : value.toArray ? value.toArray() : Array.from(value);

function cpython() {
  const program = String.raw`
import importlib,sys
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module("bench.pari-class-group-port.mixed_real_torsion_authority")
f=[-2000042,-2000022,0,0,1];o=[777];g=[777]*4;s=[0]*8
assert m.pari_exact_mixed_real_torsion(f,2,1,o,g,s)==0
assert o==[2] and g==[-1,0,0,0] and s==[0,4,2,1,23,23,529,1]
for bad in ([-1,0,0,0,1],[-2000042,-2000022,0,0,0]):
 o=[777];g=[777]*4;s=[0]*8
 try:r=m.pari_exact_mixed_real_torsion(bad,2,1,o,g,s)
 except ValueError:r=-1
 assert r!=0 and o==[777] and g==[777]*4
`;
  run("python3", ["-c", program, root, path.join(root, "src/lib")]);
}

(async () => {
  cpython();
  if (process.argv.includes("--cpython-only")) {
    console.log(JSON.stringify({ field: "x^4-2000022*x-2000042", signature: [2, 1],
      witnessPrime: 23, rootsTested: 23, quadraticsTested: 529,
      torsionOrder: 2, generator: [-1, 0, 0, 0], generatorNorm: 1,
      backends: ["cpython"] }));
    return;
  }
  const built = await compileKernel({ sourcePath });
  const fn = require(built.modulePath).pari_exact_mixed_real_torsion;
  assert(fn.nativeAvailable);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const B = data => backend === "javascript" ? data.slice()
      : fn.createIntegerBuffer(data.length, 256, data);
    const S = length => backend === "javascript" ? Array(length).fill(0n)
      : fn.createInt64Buffer(Array(length).fill(0n));
    const order = B([777n]); const generator = B(Array(4).fill(777n)); const state = S(8);
    assert.equal(fn[backend](B(polynomial), 2n, 1n, order, generator, state), 0n);
    assert.deepEqual(values(order), [2n]);
    assert.deepEqual(values(generator), [-1n, 0n, 0n, 0n]);
    assert.deepEqual(values(state), [0n, 4n, 2n, 1n, 23n, 23n, 529n, 1n]);
    const heldOrder = B([777n]); const heldGenerator = B(Array(4).fill(777n));
    assert.notEqual(fn[backend](B([-1n, 0n, 0n, 0n, 1n]), 2n, 1n,
      heldOrder, heldGenerator, S(8)), 0n);
    assert.deepEqual(values(heldOrder), [777n]);
    assert.deepEqual(values(heldGenerator), Array(4).fill(777n));
  }
  console.log(JSON.stringify({ field: "x^4-2000022*x-2000042", signature: [2, 1],
    irreducibility: "mod-23-linear-and-monic-quadratic-exhaustion",
    rootsTested: 23, quadraticsTested: 529, torsionOrder: 2,
    generator: [-1, 0, 0, 0], generatorNorm: 1, transactionalFailure: true,
    backends: ["cpython", "javascript", "gmp", "tagged"], cacheKey: built.cacheKey }));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
