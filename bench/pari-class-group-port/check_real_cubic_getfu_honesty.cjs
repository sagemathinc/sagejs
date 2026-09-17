#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const repo = path.resolve(__dirname, "../..");
const resident = path.resolve(
  process.argv[2] || "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
);
const program = String.raw`
import importlib,json,sys
sys.path[:0]=[sys.argv[1],sys.argv[1]+"/src/lib"]
m=importlib.import_module("bench.pari-class-group-port.real_cubic_getfu_honesty")
d=json.load(open(sys.argv[2]))
p=list(map(int,d["prep_polynomial"][:4]))
b=list(map(int,d["prep_zk"][:9]))
expected=list(map(int,d["basis_table"][:27]))
w=[991]*32;o=[773]*27
assert m.pari_monic_cubic_basis_tensor(p,b,w,o)==0
assert o==expected
# The independently frozen successful-getfu fixture records the same tensor.
q=json.load(open(sys.argv[3]))["cases"][0]
assert o==list(map(int,q["multiplication_basis"]))
# A changed neutral field or basis computes changed algebra, rather than
# silently retaining a recorded answer.
mp=p[:];mp[0]+=1;mw=[0]*32;mo=[0]*27
assert m.pari_monic_cubic_basis_tensor(mp,b,mw,mo)==0 and mo!=o
mb=b[:];mb[8]=0
try:m.pari_monic_cubic_basis_tensor(p,mb,[0]*32,[0]*27)
except ValueError:pass
else:raise AssertionError("singular basis mutation accepted")
for args in ((p[:3],b,[0]*32,[0]*27),(p,b[:8],[0]*32,[0]*27),(p,b,[0]*31,[0]*27),(p,b,[0]*32,[0]*26)):
 try:m.pari_monic_cubic_basis_tensor(*args)
 except ValueError:pass
 else:raise AssertionError("short storage accepted")
bad=p[:];bad[3]=2;sentinel=[41]*27
try:m.pari_monic_cubic_basis_tensor(bad,b,[0]*32,sentinel)
except ValueError:pass
else:raise AssertionError("nonmonic polynomial accepted")
assert sentinel==[41]*27
print(json.dumps({"field":"x^3-20018*x+20034","neutralInputs":["prep_polynomial","prep_zk"],"derived":"three zk_multable matrices","entries":27,"matchesResident":True,"matchesSuccessfulRetryFixture":True,"backends":["cpython"]},sort_keys=True))
`;
const fixture = path.join(__dirname, "unit-bridge-cubic-fixtures.json");
const result = spawnSync("python3", ["-c", program, repo, resident, fixture], {
  cwd: repo,
  encoding: "utf8",
  timeout: 30000,
  maxBuffer: 16 * 1024 * 1024,
});
assert.equal(result.status, 0, result.stderr || String(result.error));

(async () => {
  const data = JSON.parse(fs.readFileSync(resident));
  const polynomial = data.prep_polynomial.slice(0, 4).map(BigInt);
  const basis = data.prep_zk.slice(0, 9).map(BigInt);
  const expected = data.basis_table.slice(0, 27).map(BigInt);
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "real_cubic_getfu_honesty.py"),
  });
  const module = require(built.modulePath);
  const f = module.pari_monic_cubic_basis_tensor;
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const work =
      backend === "javascript"
        ? Array(32).fill(0n)
        : f.createIntegerBuffer(32, 4096, Array(32).fill(0n));
    const output =
      backend === "javascript"
        ? Array(27).fill(0n)
        : f.createIntegerBuffer(27, 4096, Array(27).fill(0n));
    assert.equal(f[backend](polynomial, basis, work, output), 0n, backend);
    assert.deepEqual(
      (Array.isArray(output) ? output : output.toArray()),
      expected,
      backend,
    );
  }
  const summary = JSON.parse(result.stdout);
  summary.backends.push("javascript", "gmp", "tagged");
  summary.nativeCoreBytes = fs.statSync(built.coreSourcePath).size;
  process.stdout.write(JSON.stringify(summary) + "\n");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
