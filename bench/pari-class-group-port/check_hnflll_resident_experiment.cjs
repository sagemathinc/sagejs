"use strict";

// Frozen real post-hnfspec operand; compare packed and bounded-resident HNFLLL.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const { lowerSource } = require("../../tools/native-kernel/ir.cjs");
const { createNativeImportResolver } = require("../../tools/native-kernel/native-imports.cjs");
const { generateJavaScript } = require("../../tools/native-kernel/js-backend.cjs");

const root = path.resolve(__dirname, "../..");
const residentSource = path.join(__dirname, "hnflll_resident_experiment.py");
const baselineSource = path.join(__dirname, "hnflll.py");
const rows = 8;
const columns = 15;
const original = [
  0, 0, 0, 0, 3, 0, 0, 0, -478, -128, -64, -166, -130, -307, 48, 86,
  -1601, -426, -212, -558, -434, -1034, 160, 286, 0, 0, 1, 0, 0, 0, 2, 0,
  359, 96, 46, 125, 97, 232, -33, -68, 549, 150, 75, 191, 147, 354, -56, -96,
  777, 213, 108, 272, 208, 502, -80, -140, 957, 256, 127, 332, 259, 616, -96,
  -171, -484, -127, -63, -169, -132, -314, 47, 88, 1328, 365, 180, 463, 356,
  856, -136, -241, 38, 8, 7, 11, 9, 20, -4, -3, -1328, -363, -177, -462, -355,
  -858, 134, 239, -101, -28, -12, -35, -28, -64, 10, 19, -514, -142, -70,
  -177, -137, -328, 52, 93, -84, -15, -10, -30, -25, -56, 8, 17,
];
const expectedHashes = {
  original: "a648370ee80ae4d87aab350847ff8950d2a7214dfbf72ca06b5199d2e9046d19",
  H: "cd916dab08d092d0e6d21983fc453f24bf7b9096ce9337f048949b63906e445e",
  U: "d796c61287d5bc6848ef6fca38041723ced42e3e43d77ebc782fb46b5a22146e",
  lambda: "54971252669f2f248d09d6d9e360c7128c27d56998113b0a5a8e1298b2c90d2b",
  D: "8695d4d93511d898009cf35d4d79d41bd30c730cfdfcfeb6ad3b53471e1feb19",
  state: "e7c2b13464618ea6317564371cd07da0917e56a5bca64040a171d2ae5ffb0d0a",
};
const expectedState = [282n, 23n, 764n, 439n, 223n, 102n, 392n, 156n, 60n, 16n, 16n];
const maximumBits = 4096n;
const memoryLimit = 1n << 20n;
const temporaryLimit = 1n << 20n;

function hashArray(values) {
  const text = `[${values.map(value => BigInt(value).toString()).join(",")}]`;
  return createHash("sha256").update(text).digest("hex");
}

function hashes(result) {
  return Object.fromEntries(["H", "U", "lambda", "D", "state"].map(key => [key, hashArray(result[key])]));
}

function verifyResult(result) {
  assert.deepEqual(hashes(result), Object.fromEntries(Object.entries(expectedHashes).filter(([key]) => key !== "original")));
  assert.deepEqual(result.state.map(BigInt), expectedState);
  const A = original.map(BigInt), H = result.H.map(BigInt), U = result.U.map(BigInt);
  for (let j = 0; j < columns; j++) for (let i = 0; i < rows; i++) {
    let value = 0n;
    for (let k = 0; k < columns; k++) value += A[k * rows + i] * U[j * columns + k];
    assert.equal(value, H[j * rows + i]);
  }
}

function runPython() {
  const code = String.raw`
import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
d=json.load(sys.stdin); R=d['rows']; C=d['columns']; raw=d['original']
b=importlib.import_module('bench.pari-class-group-port.hnflll')
r=importlib.import_module('bench.pari-class-group-port.hnflll_resident_experiment')
def output(): return dict(H=[0]*(R*C),U=[0]*(C*C),lambda_=[0]*(C*C),D=[0]*(C+1),state=[0]*11)
x=output(); b.pari_hnflll(raw,R,C,x['H'],x['U'],x['lambda_'],x['D'],x['state'])
y=output(); r.pari_hnflll_resident_experiment(raw,R,C,y['H'],y['U'],y['lambda_'],y['D'],y['state'],4096,1<<20,1<<20)
assert x==y
alias=[99,99]; assert r.resident_hnflll_alias_probe(alias,4096,4096)==0 and alias==[-6,8]
published=[733]
try:r.resident_hnflll_overflow_probe(published,4096,4096)
except MemoryError:pass
else:raise AssertionError('bounded overflow accepted')
assert published==[733]
for z in (x,y):
 z['lambda']=z.pop('lambda_')
 for key in ('H','U','lambda','D','state'):z[key]=list(map(str,z[key]))
print(json.dumps(dict(baseline=x,resident=y,alias=alias,overflowAtomic=True)))
`;
  const run = spawnSync("python3", ["-c", code, root, path.join(root, "src/lib")], {
    input: JSON.stringify({ rows, columns, original }), encoding: "utf8", timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

async function javascriptModule() {
  const source = fs.readFileSync(residentSource, "utf8");
  const resolveNativeImport = createNativeImportResolver({ root, lowerSource, initialSourcePath: residentSource });
  const ir = await lowerSource(source, residentSource, { resolveNativeImport });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-resident-hnf-js-"));
  const modulePath = path.join(directory, "kernel.cjs");
  fs.writeFileSync(modulePath, generateJavaScript(ir, { sourcePath: residentSource }));
  return require(modulePath);
}

function invokeResident(module, backend) {
  const f = module.pari_hnflll_resident_experiment;
  const exact = (length, fill = 0n) => backend === "javascript" ? Array(length).fill(fill) : f.createIntegerBuffer(length, 64, Array(length).fill(fill));
  const result = { H: exact(rows * columns), U: exact(columns * columns), lambda: exact(columns * columns), D: exact(columns + 1), state: Array(11).fill(0n) };
  const input = backend === "javascript" ? original.map(BigInt) : f.createIntegerBuffer(original.length, 64, original.map(BigInt));
  assert.equal(f[backend](input, BigInt(rows), BigInt(columns), result.H, result.U, result.lambda, result.D, result.state,
    maximumBits, memoryLimit, temporaryLimit), 0n);
  for (const key of ["H", "U", "lambda", "D"]) if (backend !== "javascript") result[key] = result[key].toArray();
  return result;
}

function semantics(module, backend) {
  const aliasFunction = module.resident_hnflll_alias_probe;
  let alias = backend === "javascript" ? [99n, 99n] : aliasFunction.createIntegerBuffer(2, 4, [99n, 99n]);
  assert.equal(aliasFunction[backend](alias, 4096n, 4096n), 0n);
  assert.deepEqual(backend === "javascript" ? alias : alias.toArray(), [-6n, 8n]);
  const overflowFunction = module.resident_hnflll_overflow_probe;
  let published = backend === "javascript" ? [733n] : overflowFunction.createIntegerBuffer(1, 4, [733n]);
  assert.throws(() => overflowFunction[backend](published, 4096n, 4096n), /memory|limit/i);
  assert.deepEqual(backend === "javascript" ? published : published.toArray(), [733n]);
}

function invokeBaseline(module, backend) {
  const f = module.pari_hnflll;
  const exact = length => f.createIntegerBuffer(length, 64, Array(length).fill(0n));
  const result = { H: exact(rows * columns), U: exact(columns * columns), lambda: exact(columns * columns), D: exact(columns + 1), state: Array(11).fill(0n) };
  const input = f.createIntegerBuffer(original.length, 64, original.map(BigInt));
  assert.equal(f[backend](input, BigInt(rows), BigInt(columns), result.H, result.U, result.lambda, result.D, result.state), 0n);
  for (const key of ["H", "U", "lambda", "D"]) result[key] = result[key].toArray();
  return result;
}

function timeCalls(makeCall, repetitions) {
  for (let i = 0; i < 3; i++) makeCall();
  const start = process.hrtime.bigint();
  for (let i = 0; i < repetitions; i++) makeCall();
  return Number(process.hrtime.bigint() - start) / 1e6 / repetitions;
}

function residentTimedCall(module) {
  const f = module.pari_hnflll_resident_experiment;
  const exact = length => f.createIntegerBuffer(length, 64, Array(length).fill(0n));
  const input = f.createIntegerBuffer(original.length, 64, original.map(BigInt));
  const H = exact(rows * columns), U = exact(columns * columns), lambda = exact(columns * columns), D = exact(columns + 1), state = Array(11).fill(0n);
  return () => f.gmp(input, BigInt(rows), BigInt(columns), H, U, lambda, D, state,
    maximumBits, memoryLimit, temporaryLimit);
}

function baselineTimedCall(module) {
  const f = module.pari_hnflll;
  const exact = length => f.createIntegerBuffer(length, 64, Array(length).fill(0n));
  const input = f.createIntegerBuffer(original.length, 64, original.map(BigInt));
  const H = exact(rows * columns), U = exact(columns * columns), lambda = exact(columns * columns), D = exact(columns + 1), state = Array(11).fill(0n);
  return () => f.gmp(input, BigInt(rows), BigInt(columns), H, U, lambda, D, state);
}

async function main() {
  assert.equal(hashArray(original), expectedHashes.original);
  const python = runPython();
  verifyResult(python.baseline); verifyResult(python.resident);

  const js = await javascriptModule();
  const jsResult = invokeResident(js, "javascript");
  verifyResult(jsResult); semantics(js, "javascript");

  const [residentBuilt, baselineBuilt] = await Promise.all([
    compileKernel({ sourcePath: residentSource }), compileKernel({ sourcePath: baselineSource }),
  ]);
  const resident = require(residentBuilt.modulePath), baseline = require(baselineBuilt.modulePath);
  const backendResults = {};
  for (const backend of ["gmp", "tagged"]) {
    const residentResult = invokeResident(resident, backend);
    const baselineResult = invokeBaseline(baseline, backend);
    verifyResult(residentResult); verifyResult(baselineResult);
    assert.deepEqual(residentResult, baselineResult);
    semantics(resident, backend);
    backendResults[backend] = hashes(residentResult);
  }

  const repetitions = Number(process.env.HNF_RESIDENT_REPETITIONS || 50);
  const residentCall = residentTimedCall(resident), baselineCall = baselineTimedCall(baseline);
  const pairs = [];
  for (let pair = 0; pair < 7; pair++) {
    let residentMs, baselineMs;
    if (pair % 2 === 0) {
      residentMs = timeCalls(residentCall, repetitions);
      baselineMs = timeCalls(baselineCall, repetitions);
    } else {
      baselineMs = timeCalls(baselineCall, repetitions);
      residentMs = timeCalls(residentCall, repetitions);
    }
    pairs.push({ residentMilliseconds: residentMs, packedBaselineMilliseconds: baselineMs,
      ratio: residentMs / baselineMs });
  }
  const geometricMean = values => Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
  const report = {
    fixture: { field: "x^3 - 20018*x + 20034", preSparseRows: 66, relationColumns: 73,
      actualHnflllRows: rows, actualHnflllColumns: columns, originalSha256: expectedHashes.original },
    hnfState: expectedState.map(String), maximumBits: Number(maximumBits), memoryLimit: Number(memoryLimit),
    backends: ["cpython", "javascript", "gmp", "tagged"], backendResults,
    semantics: { aliasedAddmulSubmulSwap: true, overflowBeforePublication: true },
    primaryTiming: { includesArenaAllocationCopyInCopyOut: true, excludesHarnessOwnerAllocationAndMaterialization: true,
      repetitionsPerArm: repetitions, alternatingPairs: pairs,
      geometricMeanResidentMilliseconds: geometricMean(pairs.map(pair => pair.residentMilliseconds)),
      geometricMeanPackedBaselineMilliseconds: geometricMean(pairs.map(pair => pair.packedBaselineMilliseconds)),
      geometricMeanRatio: geometricMean(pairs.map(pair => pair.ratio)) },
    artifacts: { residentCacheKey: residentBuilt.cacheKey, baselineCacheKey: baselineBuilt.cacheKey,
      residentCoreBytes: fs.statSync(residentBuilt.coreSourcePath).size,
      residentCoreSha256: createHash("sha256").update(fs.readFileSync(residentBuilt.coreSourcePath)).digest("hex") },
  };
  console.log(JSON.stringify(report));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
