"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const fixturePath = path.join(__dirname, "unit-lattice-reduction-fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
};

function verifyPinnedSource() {
  const archive = path.resolve(
    process.argv[2] || "/home/user/upstream/pari-2.17.4.tar.gz",
  );
  assert.equal(hash(fs.readFileSync(archive)), fixtures.pari.archive_sha256);
  for (const [file, wanted] of [
    ["pari-2.17.4/src/basemath/buch2.c", fixtures.pari.buch2_sha256],
    ["pari-2.17.4/src/basemath/lll.c", fixtures.pari.lll_sha256],
  ]) {
    const source = run("tar", ["-xOf", archive, file]);
    assert.equal(hash(source), wanted);
  }
  return archive;
}

function exactIdentities(item) {
  const L = item.L.map(BigInt);
  const U1 = item.U1.map(BigInt);
  const U2 = item.U2.map(BigInt);
  const U = item.U.map(BigInt);
  const columns = 7;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < columns; i++) {
      assert.equal(
        U[j * columns + i],
        U1[i] * U2[j] + U1[columns + i] * U2[2 + j],
      );
    }
  }
  const determinant = U2[0] * U2[3] - U2[1] * U2[2];
  assert(determinant === -1n || determinant === 1n);
  const image = (matrix, transform, row, column) => {
    let total = 0n;
    for (let k = 0; k < columns; k++) {
      total += matrix[k * 2 + row] * transform[column * columns + k];
    }
    return total;
  };
  for (let row = 0; row < 2; row++) {
    const x = image(L, U1, row, 0);
    const y = image(L, U1, row, 1);
    assert.equal(x * y - y * x, 0n);
  }
}

function runCPython() {
  const script = String.raw`
import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.unit_lattice_reduction')
F=json.load(sys.stdin)
def ints(n): return [0]*n
def floats(n): return [0.0]*n
for q in F['cases']:
 c=7; sq=c*c
 a=[list(map(int,q['L'])),c,ints(14),ints(5),ints(14),ints(sq),ints(sq),floats(sq),ints(sq),floats(sq),ints(sq),floats(c),ints(c),floats(14),floats(sq),ints(c),ints(c),ints(c),floats(c),floats(c),floats(c),ints(c)]
 assert m.pari_unit_integer_lattice_rank_two(*a)==0
 assert a[3]==[5,5,2,0,0] and a[2]==list(map(int,q['U1']))
 b=[list(map(int,q['P_triples'])),3,ints(6),ints(4),ints(3),ints(6),ints(4),ints(4),floats(4),ints(4),floats(4),ints(4),floats(2),ints(2),floats(6),floats(4),ints(2),ints(3),ints(3),floats(3),floats(3),floats(3),ints(3),ints(2)]
 assert m.pari_unit_real_lattice_rank_two(*b)==0
 assert b[3]==list(map(int,q['U2'])) and b[-1]==[0,0]
 out=ints(14); assert m.pari_unit_compose_rank_two(a[2],c,b[3],out)==0
 assert out==list(map(int,q['U']))
 clean=floats(12); trace=floats(5)
 assert m.pari_cleanarchunit_real_cubic(q['AU'],2,q['regulator'],clean,trace)==0
 assert max(abs(x-y) for x,y in zip(clean,q['clean'])) < 1e-9
 assert abs(trace[2]-q['regulator']) < .5
 bad=q['AU'][:]; bad[0]+=1.0
 before=clean[:]
 assert m.pari_cleanarchunit_real_cubic(bad,2,q['regulator'],clean,trace)==1
 assert clean==before
 assert m.pari_cleanarchunit_real_cubic(q['AU'],2,q['regulator']+1.0,clean,trace)==2
for function,args in [
 (m.pari_unit_integer_lattice_rank_two, [[0]*14,7,[],[0]*5,[0]*14,[0]*49,[0]*49,[0.0]*49,[0]*49,[0.0]*49,[0]*49,[0.0]*7,[0]*7,[0.0]*14,[0.0]*49,[0]*7,[0]*7,[0]*7,[0.0]*7,[0.0]*7,[0.0]*7,[0]*7]),
 (m.pari_cleanarchunit_real_cubic, [[0.0]*12,3,1.0,[0.0]*12,[0.0]*5]),
]:
 try: function(*args)
 except ValueError: pass
 else: raise AssertionError('invalid boundary accepted')
`;
  run(
    "python3",
    ["-c", script, root, path.join(root, "src/lib")],
    { input: JSON.stringify(fixtures) },
  );
}

function arraysFor(item) {
  const ints = (n) => Array(n).fill(0n);
  const floats = (n) => Array(n).fill(0);
  const columns = 7;
  const square = 49;
  return {
    integer: [
      item.L.map(BigInt), columns, ints(14), ints(5), ints(14), ints(square),
      ints(square), floats(square), ints(square), floats(square), ints(square),
      floats(columns), ints(columns), floats(14), floats(square), ints(columns),
      ints(columns), ints(columns), floats(columns), floats(columns),
      floats(columns), ints(columns),
    ],
    real: [
      item.P_triples.map(BigInt), 3, ints(6), ints(4), ints(3), ints(6), ints(4),
      ints(4), floats(4), ints(4), floats(4), ints(4), floats(2), ints(2),
      floats(6), floats(4), ints(2), ints(3), ints(3), floats(3), floats(3),
      floats(3), ints(3), ints(2),
    ],
  };
}

function packArguments(fn, args, backend, integerIndices, floatIndices) {
  return args.map((value, index) => {
    if (integerIndices.has(index)) {
      return backend === "javascript"
        ? value
        : fn.createIntegerBuffer(value.length, 32, value);
    }
    if (floatIndices.has(index)) {
      return backend === "javascript" ? value : fn.createFloat64Buffer(value);
    }
    return BigInt(value);
  });
}

function values(value) {
  return Array.isArray(value)
    ? value
    : value.toArray
      ? value.toArray()
      : Array.from(value);
}

(async () => {
  const archive = verifyPinnedSource();
  assert.equal(fixtures.cases.length, 2);
  fixtures.cases.forEach(exactIdentities);
  runCPython();
  if (process.argv.includes("--source-only")) {
    console.log(JSON.stringify({ archive, cases: 2, cpython: true }));
    return;
  }
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "unit_lattice_reduction.py"),
  });
  const mod = require(built.modulePath);
  const integerFn = mod.pari_unit_integer_lattice_rank_two;
  const realFn = mod.pari_unit_real_lattice_rank_two;
  const composeFn = mod.pari_unit_compose_rank_two;
  const cleanFn = mod.pari_cleanarchunit_real_cubic;
  assert(integerFn.nativeAvailable && realFn.nativeAvailable && cleanFn.nativeAvailable);
  const backends = ["javascript", "gmp", "tagged"];
  for (const item of fixtures.cases) {
    for (const backend of backends) {
      const raw = arraysFor(item);
      const integerArgs = packArguments(
        integerFn, raw.integer, backend,
        new Set([0, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 17, 21]),
        new Set([7, 9, 11, 13, 14, 18, 19, 20]),
      );
      assert.equal(integerFn[backend](...integerArgs), 0n);
      assert.deepEqual(values(integerArgs[2]), item.U1.map(BigInt));
      assert.deepEqual(values(integerArgs[3]), [5n, 5n, 2n, 0n, 0n]);
      const realArgs = packArguments(
        realFn, raw.real, backend,
        new Set([0, 2, 3, 4, 5, 6, 7, 9, 11, 13, 16, 17, 18, 22, 23]),
        new Set([8, 10, 12, 14, 15, 19, 20, 21]),
      );
      assert.equal(realFn[backend](...realArgs), 0n);
      assert.deepEqual(values(realArgs[3]), item.U2.map(BigInt));
      assert.deepEqual(values(realArgs[23]), [0n, 0n]);
      const u1 = integerArgs[2];
      const u2 = realArgs[3];
      const output = backend === "javascript"
        ? Array(14).fill(0n)
        : composeFn.createIntegerBuffer(14, 32, Array(14).fill(0n));
      assert.equal(composeFn[backend](u1, 7n, u2, output), 0n);
      assert.deepEqual(values(output), item.U.map(BigInt));
      const arch = backend === "javascript" ? item.AU.slice() : cleanFn.createFloat64Buffer(item.AU);
      const clean = backend === "javascript" ? Array(12).fill(0) : cleanFn.createFloat64Buffer(Array(12).fill(0));
      const trace = backend === "javascript" ? Array(5).fill(0) : cleanFn.createFloat64Buffer(Array(5).fill(0));
      assert.equal(cleanFn[backend](arch, 2n, item.regulator, clean, trace), 0n);
      const cleanValues = values(clean);
      assert(Math.max(...cleanValues.map((x, i) => Math.abs(x - item.clean[i]))) < 1e-9);
      assert(Math.abs(values(trace)[2] - item.regulator) < 0.5);
    }
  }
  console.log(JSON.stringify({
    cases: fixtures.cases.length,
    backends,
    exactTransforms: true,
    cleanarchunit: true,
    regulatorConsistency: true,
    coreBytes: fs.statSync(built.coreSourcePath).size,
    cacheKey: built.cacheKey,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
