"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const sourcePath = path.join(__dirname, "signed_prime_ideal_reduction.py");
const rows = [
  [1n, 0n, 0n, 0n, 13340n, -2226n, 0n, -2226n, 9883456n],
  [0n, 1n, 0n, 1n, -1n, 2223n, 0n, 2223n, -1n],
  [0n, 0n, 1n, 0n, 3n, 1n, 1n, 1n, -2223n],
];
const table = Array.from({ length: 27 }, (_, q) => rows[q % 3][Math.floor(q / 3)]);
const P = [191n, 133n, 59n, 0n, 1n, 0n, 0n, 0n, 1n];
const Q = [193n, 104n, 104n, 0n, 1n, 0n, 0n, 0n, 1n];

const powers = new Map([
  [-3, {
    candidates: [36481n, 0n, 0n, -323210n, 2510n, -79n, 78n, 0n, 0n],
    matrix: [78n, 52n, 52n, 0n, 26n, 11n, 0n, 0n, 3n],
    factors: [[1n, 4472n, -11n, -3n, 1n, -1n], [0n, 78n, 0n, 0n, 1n, 1n], [0n, 1n, 0n, 0n, 78n, 1n]],
  }],
  [-2, {
    candidates: [36481n, 0n, 0n, -1122n, -7n, 0n],
    matrix: [8374n, 7338n, 6418n, 0n, 1n, 0n, 0n, 0n, 1n],
    factors: [[1n, -1122n, -7n, 0n, 1n, -1n]],
  }],
  [-1, {
    candidates: [-58n, 1n, 0n],
    matrix: [1650n, 1592n, 18n, 0n, 1n, 0n, 0n, 0n, 3n],
    factors: [[1n, -58n, 1n, 0n, 1n, -1n]],
  }],
  [1, {
    candidates: [191n, 0n, 0n], matrix: P, factors: [],
  }],
  [2, {
    candidates: [36481n, 0n, 0n],
    matrix: [36481n, 15795n, 1396n, 0n, 1n, 0n, 0n, 0n, 1n], factors: [],
  }],
  [3, {
    candidates: [36481n, 0n, 0n, -323210n, 2510n, -79n],
    matrix: [78n, 14n, 18n, 0n, 1n, 0n, 0n, 0n, 1n],
    factors: [[1n, 4472n, -11n, -3n, 1n, 1n], [0n, 78n, 0n, 0n, 1n, -1n]],
  }],
]);

const genback = {
  ideals: [...P, ...Q], exponents: [3n, -2n],
  candidates: [
    36481n, 0n, 0n, -323210n, 2510n, -79n,
    37249n, 0n, 0n, -1174n, -15n, 0n,
    -735540n, -3501n, 6n,
  ],
  matrix: [27417n, 11945n, 15915n, 0n, 1n, 0n, 0n, 0n, 1n],
  factors: [
    [1n, 4472n, -11n, -3n, 1n, 1n],
    [0n, 78n, 0n, 0n, 1n, -1n],
    [1n, -1174n, -15n, 0n, 1n, -1n],
    [1n, -78254n, 457n, -7n, 1n, 1n],
    [0n, 9139n, 0n, 0n, 1n, -1n],
  ],
};

const pariPowerText = new Map([
  [-3, "[[78,52,52;0,26,11;0,0,3],[[4472,-11,-3]~,-1;78,1;1/78,1]]"],
  [-2, "[[8374,7338,6418;0,1,0;0,0,1],Mat([[-1122,-7,0]~,-1])]"],
  [-1, "[[1650,1592,18;0,1,0;0,0,3],Mat([[-58,1,0]~,-1])]"],
  [1, "[[191,133,59;0,1,0;0,0,1],matrix(0,2)]"],
  [2, "[[36481,15795,1396;0,1,0;0,0,1],matrix(0,2)]"],
  [3, "[[78,14,18;0,1,0;0,0,1],[[4472,-11,-3]~,1;78,-1]]"],
]);
const pariTapeText = new Map([
  [-3, "[[36481,0,0]~,[-323210,2510,-79]~,[78,0,0]~]"],
  [-2, "[[36481,0,0]~,[-1122,-7,0]~]"],
  [-1, "[[-58,1,0]~]"],
  [1, "[[191,0,0]~]"],
  [2, "[[36481,0,0]~]"],
  [3, "[[36481,0,0]~,[-323210,2510,-79]~]"],
]);
const pariGenbackText = "[[27417,11945,15915;0,1,0;0,0,1],[[4472,-11,-3]~,1;78,-1;[-1174,-15,0]~,-1;[-78254,457,-7]~,1;9139,-1]]";
const pariGenbackTape = "[[36481,0,0]~,[-323210,2510,-79]~,[37249,0,0]~,[-1174,-15,0]~,[-735540,-3501,6]~]";

function normalize(value) { return value.replace(/\s+/g, ""); }
function zeroes(n) { return Array(n).fill(0n); }
function locateGp() {
  return [process.env.PARI_GP, process.argv[2],
    "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4/gp"]
    .filter(Boolean).find((candidate) => fs.existsSync(candidate));
}

function verifyPari() {
  const gp = locateGp();
  if (!gp) return { replayed: false };
  const program = `
print("VERSION|",version()); nf=nfinit(x^3-20010*x+20018); G=nf[5][3];
P=idealprimedec(nf,191)[1]; Q=idealprimedec(nf,193)[1]; tape=List();
red(X)={my(I=X[1],q=I[1,1],J=idealhnf(nf,idealinv(nf,I)*q),U=qflll(G*J),y=J*U[,1]);listput(tape,y);return(idealred(nf,X))};
pw(R,e)={my(A=[idealhnf(nf,R),factor(1)],a=abs(e));if(a>=2,A=red(idealmul(nf,A,A)));if(a==3,A=red(idealmul(nf,A,[idealhnf(nf,R),factor(1)])));if(e<0,A=red(idealinv(nf,A)),if(a==1,A=red(A)));return(A)};
for(e=-3,3,if(e,tape=List();A=pw(P,e);print("E|",e,"|",Vec(tape),"|",A,"|",idealhnf(nf,idealmul(nf,A[1],nffactorback(nf,A[2])))==idealhnf(nf,idealpow(nf,P,e)))));
tape=List();A=pw(P,3);B=pw(Q,-2);C=red(idealmul(nf,A,B));print("G|",Vec(tape),"|",C,"|",idealhnf(nf,idealmul(nf,C[1],nffactorback(nf,C[2])))==idealhnf(nf,idealmul(nf,idealpow(nf,P,3),idealpow(nf,Q,-2))));
`;
  const result = spawnSync(gp, ["-fq"], { input: program, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.match(lines.shift(), /^VERSION\|(?:2\.17\.4|\[2, 17, 4\])$/);
  for (const exponent of [-3, -2, -1, 1, 2, 3]) {
    const fields = lines.shift().split("|");
    assert.deepEqual(fields.slice(0, 2), ["E", String(exponent)]);
    assert.equal(normalize(fields[2]), pariTapeText.get(exponent));
    assert.equal(normalize(fields[3]), pariPowerText.get(exponent));
    assert.equal(fields[4], "1", `principal replay e=${exponent}`);
  }
  const fields = lines.shift().split("|");
  assert.equal(fields[0], "G");
  assert.equal(normalize(fields[1]), pariGenbackTape);
  assert.equal(normalize(fields[2]), pariGenbackText);
  assert.equal(fields[3], "1", "genback principal replay");
  return { replayed: true, gp };
}

function workspace(capacity = 32) {
  return {
    kinds: zeroes(capacity), values: zeroes(4 * capacity), factorExponents: zeroes(capacity), metadata: [0n],
    termKinds: zeroes(capacity), termValues: zeroes(4 * capacity), termExponents: zeroes(capacity), termMetadata: [0n],
    base: zeroes(9), term: zeroes(9), current: zeroes(9), matrixScratch: zeroes(9),
    generators: zeroes(27), hnfInput: zeroes(18), hnfWork: zeroes(30), hnfTriangular: zeroes(12), hnfModuli: zeroes(3), hnfIntermediate: zeroes(9),
    inverseBasis: zeroes(9), congruenceRow: zeroes(3), candidate: zeroes(3), content: zeroes(2),
    multiplicationMatrix: zeroes(9), product: zeroes(9), inverseNumerator: zeroes(3), inverseDenominator: zeroes(1), output: zeroes(9), cursor: [0n],
  };
}

function powerArguments(w, exponent, candidates) {
  return [P, BigInt(exponent), table, candidates, w.cursor,
    w.kinds, w.values, w.factorExponents, w.metadata, w.current, w.matrixScratch,
    w.generators, w.hnfInput, w.hnfWork, w.hnfTriangular, w.hnfModuli, w.hnfIntermediate,
    w.inverseBasis, w.congruenceRow, w.candidate, w.content, w.multiplicationMatrix,
    w.product, w.inverseNumerator, w.inverseDenominator, w.output];
}
function genbackArguments(w) {
  return [genback.ideals, genback.exponents, 2n, table, genback.candidates, w.cursor,
    w.kinds, w.values, w.factorExponents, w.metadata,
    w.termKinds, w.termValues, w.termExponents, w.termMetadata,
    w.base, w.term, w.current, w.matrixScratch, w.generators, w.hnfInput,
    w.hnfWork, w.hnfTriangular, w.hnfModuli, w.hnfIntermediate, w.inverseBasis,
    w.congruenceRow, w.candidate, w.content, w.multiplicationMatrix, w.product,
    w.inverseNumerator, w.inverseDenominator, w.output];
}
function expectedFactors(w, materialize) {
  const count = Number(materialize(w.metadata)[0]);
  const kinds = materialize(w.kinds), values = materialize(w.values), exponents = materialize(w.factorExponents);
  return Array.from({ length: count }, (_, i) => [kinds[i], ...values.slice(4 * i, 4 * i + 4), exponents[i]]);
}

function runBackend(api, backend) {
  const functionApi = api.pari_cubic_idealpowred_tape;
  const packed = backend === "gmp";
  const pack = (value) => packed ? functionApi.packIntegerBuffer(value, 256) : value.slice();
  const materialize = (value) => packed ? value.toArray() : value;
  const invoke = (fn, args) => api[fn][backend](...args.map((value) => Array.isArray(value) ? pack(value) : value));
  for (const [exponent, expected] of powers) {
    const raw = workspace();
    const mapped = {};
    for (const [key, value] of Object.entries(raw)) mapped[key] = pack(value);
    const args = powerArguments(mapped, exponent, pack(expected.candidates));
    args[0] = pack(P); args[2] = pack(table);
    assert.equal(api.pari_cubic_idealpowred_tape[backend](...args), 0n, `${backend} e=${exponent}`);
    assert.deepEqual(materialize(mapped.output), expected.matrix, `${backend} matrix e=${exponent}`);
    assert.deepEqual(expectedFactors(mapped, materialize), expected.factors, `${backend} factors e=${exponent}`);
    assert.deepEqual(materialize(mapped.cursor), [BigInt(expected.candidates.length / 3)]);
  }
  const raw = workspace(), mapped = {};
  for (const [key, value] of Object.entries(raw)) mapped[key] = pack(value);
  const args = genbackArguments(mapped);
  args[0] = pack(genback.ideals); args[1] = pack(genback.exponents); args[3] = pack(table); args[4] = pack(genback.candidates);
  assert.equal(api.pari_cubic_genback_tape[backend](...args), 2n, `${backend} genback`);
  assert.deepEqual(materialize(mapped.output), genback.matrix);
  assert.deepEqual(expectedFactors(mapped, materialize), genback.factors);
  assert.deepEqual(materialize(mapped.cursor), [5n]);

  assert.throws(() => invoke("pari_compact_factor_append", [zeroes(0), zeroes(0), zeroes(0), [0n], 1n, 1n, 0n, 0n, 1n, 1n]), /capacity/);
  const invalid = workspace();
  const invalidMapped = {}; for (const [key, value] of Object.entries(invalid)) invalidMapped[key] = pack(value);
  const invalidArgs = powerArguments(invalidMapped, 0, pack([])); invalidArgs[0] = pack(P); invalidArgs[2] = pack(table);
  assert.throws(() => api.pari_cubic_idealpowred_tape[backend](...invalidArgs), /exponent/);
  const short = workspace(); const shortMapped = {}; for (const [key, value] of Object.entries(short)) shortMapped[key] = pack(value);
  const shortArgs = powerArguments(shortMapped, 3, pack([36481n, 0n, 0n])); shortArgs[0] = pack(P); shortArgs[2] = pack(table);
  assert.throws(() => api.pari_cubic_idealpowred_tape[backend](...shortArgs), /tape exhausted/);
}

(async () => {
  const pari = verifyPari();
  const python = spawnSync("python3", ["-c", `
import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.signed_prime_ideal_reduction')
rows=[[1,0,0,0,13340,-2226,0,-2226,9883456],[0,1,0,1,-1,2223,0,2223,-1],[0,0,1,0,3,1,1,1,-2223]]
t=[rows[k][i*3+j] for i in range(3) for j in range(3) for k in range(3)]
P=[191,133,59,0,1,0,0,0,1];Q=[193,104,104,0,1,0,0,0,1]
cases=${JSON.stringify([...powers].map(([e, x]) => [e, x.candidates.map(Number)]))}
def space(): return dict(k=[0]*32,v=[0]*128,e=[0]*32,meta=[0],tk=[0]*32,tv=[0]*128,te=[0]*32,tm=[0],base=[0]*9,term=[0]*9,cur=[0]*9,s=[0]*9,g=[0]*27,hi=[0]*18,w=[0]*30,tr=[0]*12,mods=[0]*3,hm=[0]*9,ib=[0]*9,cr=[0]*3,c=[0]*3,cont=[0]*2,mm=[0]*9,p=[0]*9,num=[0]*3,den=[0],o=[0]*9,cursor=[0])
answer=[]
for exponent,candidates in cases:
 z=space();m.pari_cubic_idealpowred_tape(P,exponent,t,candidates,z['cursor'],z['k'],z['v'],z['e'],z['meta'],z['cur'],z['s'],z['g'],z['hi'],z['w'],z['tr'],z['mods'],z['hm'],z['ib'],z['cr'],z['c'],z['cont'],z['mm'],z['p'],z['num'],z['den'],z['o'])
 answer.append([exponent,z['o'],[[z['k'][i]]+z['v'][4*i:4*i+4]+[z['e'][i]] for i in range(z['meta'][0])],z['cursor']])
z=space();candidates=${JSON.stringify(genback.candidates.map(Number))};m.pari_cubic_genback_tape(P+Q,[3,-2],2,t,candidates,z['cursor'],z['k'],z['v'],z['e'],z['meta'],z['tk'],z['tv'],z['te'],z['tm'],z['base'],z['term'],z['cur'],z['s'],z['g'],z['hi'],z['w'],z['tr'],z['mods'],z['hm'],z['ib'],z['cr'],z['c'],z['cont'],z['mm'],z['p'],z['num'],z['den'],z['o'])
answer.append(['genback',z['o'],[[z['k'][i]]+z['v'][4*i:4*i+4]+[z['e'][i]] for i in range(z['meta'][0])],z['cursor']]);print(json.dumps(answer))
`, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")], { encoding: "utf8", timeout: 30000 });
  assert.equal(python.status, 0, python.stderr || String(python.error));
  const py = JSON.parse(python.stdout);
  for (let i = 0; i < 6; i++) {
    const [exponent, expected] = [...powers][i];
    assert.deepEqual(py[i], [exponent, expected.matrix.map(Number), expected.factors.map((r) => r.map(Number)), [expected.candidates.length / 3]]);
  }
  assert.deepEqual(py[6], ["genback", genback.matrix.map(Number), genback.factors.map((r) => r.map(Number)), [5]]);

  const built = await compileKernel({ sourcePath });
  const api = require(built.modulePath);
  for (const backend of ["javascript", "gmp", "tagged"]) runBackend(api, backend);
  assert.doesNotMatch(fs.readFileSync(built.coreSourcePath, "utf8"), /napi_call_function|PyObject_Call/);
  console.log("signed cubic idealpowred/genback matches pristine PARI 2.17.4, CPython, JS, GMP, and tagged backends");
  console.log(JSON.stringify({ modulePath: built.modulePath, pari, powers: 6, genbackTerms: 2, reductionWitnesses: 5 }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
