"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const sourcePath = path.join(__dirname, "signed_prime_ideal_reduction.py");
const prime = 191n;
const tau = [
  -59n, 753702n, 29523486n,
  57n, 6553n, 126708n,
  3n, 174n, -6671n,
];
const tableRows = [
  [1n, 0n, 0n, 0n, 13340n, -2226n, 0n, -2226n, 9883456n],
  [0n, 1n, 0n, 1n, -1n, 2223n, 0n, 2223n, -1n],
  [0n, 0n, 1n, 0n, 3n, 1n, 1n, 1n, -2223n],
];
const table = Array.from({ length: 27 }, (_, q) => {
  const pair = Math.floor(q / 3), k = q % 3;
  return tableRows[k][pair];
});
const expectedInverse = [191n, 0n, 44n, 0n, 191n, 19n, 0n, 0n, 1n];
const expectedReduced = [1650n, 1592n, 18n, 0n, 1n, 0n, 0n, 0n, 3n];

const signedControls = new Map([
  [-3, "[[78,52,52;0,26,11;0,0,3],[[4472,-11,-3]~,-1;78,1;1/78,1]]"],
  [-2, "[[8374,7338,6418;0,1,0;0,0,1],Mat([[-1122,-7,0]~,-1])]"],
  [-1, "[[1650,1592,18;0,1,0;0,0,3],Mat([[-58,1,0]~,-1])]"],
  [1, "[[191,133,59;0,1,0;0,0,1],matrix(0,2)]"],
  [2, "[[36481,15795,1396;0,1,0;0,0,1],matrix(0,2)]"],
  [3, "[[78,14,18;0,1,0;0,0,1],[[4472,-11,-3]~,1;78,-1]]"],
]);

function zeroes(n) { return Array(n).fill(0n); }
function normalize(value) { return value.replace(/\s+/g, ""); }

function locateGp() {
  const candidates = [
    process.env.PARI_GP,
    process.argv[2],
    "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4/gp",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function verifyPinnedPariControls() {
  const gp = locateGp();
  if (!gp) return { replayed: false };
  const program = `
print("VERSION|",version());
nf=nfinit(x^3-20010*x+20018); P=idealprimedec(nf,191)[1];
for(e=-3,3,if(e,F=idealpow(nf,[P,factor(1)],e,1);print(e,"|",F);print("R|",idealhnf(nf,idealmul(nf,F[1],nffactorback(nf,F[2])))==idealhnf(nf,idealpow(nf,P,e)))));
`;
  const result = spawnSync(gp, ["-fq"], {
    input: program,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.match(lines.shift(), /^VERSION\|(?:2\.17\.4|\[2, 17, 4\])$/);
  for (const exponent of [-3, -2, -1, 1, 2, 3]) {
    const line = lines.shift();
    const prefix = `${exponent}|`;
    assert.ok(line.startsWith(prefix), line);
    assert.equal(normalize(line.slice(prefix.length)), signedControls.get(exponent));
    assert.equal(lines.shift(), "R|1", `independent principal-ideal replay e=${exponent}`);
  }
  return { replayed: true, gp };
}

function makeArgs() {
  return {
    content: [0n, 0n], inverse: zeroes(9),
    inverseWork: zeroes(30), inverseTriangular: zeroes(12), inverseModuli: zeroes(3),
    kinds: zeroes(8), values: zeroes(32), exponents: zeroes(8), metadata: [0n],
    multiplicationMatrix: zeroes(9), product: zeroes(9),
    inverseNumerator: zeroes(3), inverseDenominator: [0n],
    hnfWork: zeroes(30), hnfTriangular: zeroes(12), hnfModuli: zeroes(3), output: zeroes(9),
  };
}

function calls(api, backend, values, pack) {
  const call = (name, ...args) => api[name][backend](...args);
  const b = (value, bits = 256) => pack ? api.pari_cubic_inverse_prime_init.packIntegerBuffer(value, bits) : value;
  const packed = {};
  for (const [name, value] of Object.entries(values)) packed[name] = b(value);
  assert.equal(call("pari_cubic_inverse_prime_init", b(tau), prime,
    packed.content, packed.inverseWork, packed.inverseTriangular,
    packed.inverseModuli, packed.inverse), 0n);
  const materialize = (value) => pack ? value.toArray() : value;
  assert.deepEqual(materialize(packed.inverse), expectedInverse);
  assert.deepEqual(materialize(packed.content), [1n, 191n]);
  assert.equal(call("pari_cubic_idealred_candidate",
    packed.inverse, b(table), b([-58n, 1n, 0n]), packed.content,
    packed.kinds, packed.values, packed.exponents, packed.metadata,
    packed.multiplicationMatrix, packed.product, packed.inverseNumerator,
    packed.inverseDenominator, packed.hnfWork, packed.hnfTriangular,
    packed.hnfModuli, packed.output), 0n);
  assert.deepEqual(materialize(packed.output), expectedReduced);
  assert.deepEqual(materialize(packed.metadata), [1n]);
  assert.deepEqual(materialize(packed.kinds).slice(0, 1), [1n]);
  assert.deepEqual(materialize(packed.values).slice(0, 4), [-58n, 1n, 0n, 1n]);
  assert.deepEqual(materialize(packed.exponents).slice(0, 1), [-1n]);
  assert.deepEqual(materialize(packed.inverseNumerator), [-1102n, 19n, 1n]);
  assert.deepEqual(materialize(packed.inverseDenominator), [315150n]);
  assert.deepEqual(materialize(packed.content), [1n, 1n]);
}

(async () => {
  const pari = verifyPinnedPariControls();
  const cp = spawnSync("python3", ["-c", `
import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.signed_prime_ideal_reduction')
tau=[-59,753702,29523486,57,6553,126708,3,174,-6671]
rows=[[1,0,0,0,13340,-2226,0,-2226,9883456],[0,1,0,1,-1,2223,0,2223,-1],[0,0,1,0,3,1,1,1,-2223]]
table=[rows[k][i*3+j] for i in range(3) for j in range(3) for k in range(3)]
content=[0,0]; inv=[0]*9; iw=[0]*30; it=[0]*12; im=[0]*3
assert m.pari_cubic_inverse_prime_init(tau,191,content,iw,it,im,inv)==0
k=[0]*8;v=[0]*32;e=[0]*8;meta=[0];mm=[0]*9;p=[0]*9;num=[0]*3;den=[0];w=[0]*30;t=[0]*12;mods=[0]*3;o=[0]*9
assert m.pari_cubic_idealred_candidate(inv,table,[-58,1,0],content,k,v,e,meta,mm,p,num,den,w,t,mods,o)==0
print(json.dumps([inv,content,o,meta,k[:1],v[:4],e[:1],num,den]))
`, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")], {
    encoding: "utf8", timeout: 30000,
  });
  assert.equal(cp.status, 0, cp.stderr || String(cp.error));
  assert.deepEqual(JSON.parse(cp.stdout), [
    expectedInverse.map(Number), [1, 1], expectedReduced.map(Number), [1], [1],
    [-58, 1, 0, 1], [-1], [-1102, 19, 1], [315150],
  ]);

  const built = await compileKernel({ sourcePath });
  const api = require(built.modulePath);
  assert.equal(api.pari_cubic_idealred_candidate.nativeAvailable, true);
  calls(api, "javascript", makeArgs(), false);
  calls(api, "gmp", makeArgs(), true);

  for (const backend of ["javascript", "gmp"]) {
    const f = api.pari_compact_factor_append;
    const pack = (x) => backend === "gmp" ? f.packIntegerBuffer(x, 256) : x;
    const kinds = pack(zeroes(8)), values = pack(zeroes(32));
    const exponents = pack(zeroes(8)), metadata = pack([0n]);
    for (const [kind, a, b, c, denominator, exponent] of [
      [1n, 4472n, -11n, -3n, 1n, -1n],
      [0n, 78n, 0n, 0n, 1n, 1n],
      [0n, 1n, 0n, 0n, 78n, 1n],
    ]) assert.equal(f[backend](kinds, values, exponents, metadata,
      kind, a, b, c, denominator, exponent), 0n);
    assert.equal(api.pari_compact_factor_invert[backend](exponents, metadata), 0n);
    const array = (x) => backend === "gmp" ? x.toArray() : x;
    assert.deepEqual(array(metadata), [3n]);
    assert.deepEqual(array(exponents).slice(0, 3), [1n, -1n, -1n]);
  }

  assert.doesNotMatch(fs.readFileSync(built.coreSourcePath, "utf8"), /napi_call_function|PyObject_Call/);
  console.log("restricted signed cubic inverse-prime/T2 reduction matches CPython, JS, GMP, and the PARI 2.17.4 e=-3..3 controls");
  console.log(JSON.stringify({ modulePath: built.modulePath, pari }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
