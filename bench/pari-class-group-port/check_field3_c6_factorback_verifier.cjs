#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const moduleName = "bench.pari-class-group-port.field3_c6_factorback_verifier";
const gp = "/scratch/sagejs-runtime/pari-opt-forensics-20260908/gp";
const pariLibrary = "/scratch/sagejs-runtime/pari-opt-forensics-20260908/lib";
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function run(command, args, options = {}, expected = 0) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, expected, result.stderr || String(result.error));
  return result;
}

// Fresh pristine PARI 2.17.4 arithmetic, not an expected-unit tape.  These
// two low-cost units generate the synthetic factorback columns below.
const pristine = run(
  gp,
  ["-fq"],
  {
    env: { ...process.env, LD_LIBRARY_PATH: pariLibrary },
    input: [
      "P=x^4-2;",
      "q=Mod(1+x+x^2+x^3,P);",
      "u=Mod(1+x,P);",
      "print(norm(q));print(lift(1/q));print(norm(u));print(lift(1/u));quit",
    ].join(""),
  },
).stdout.trim().split("\n");
assert.deepEqual(pristine, ["-1", "x - 1", "-1", "x^3 - x^2 + x - 1"]);

// Exercise the authentic precision gate without running a genuine field or a
// nontrivial AGM.  log(1)=0 follows the complete 153088-bit real dispatcher,
// while short-capacity and PRECI failures must occur before touching caller
// storage.  The non-axis branch remains the already qualified complex AGM.
const highPrecisionProbe = JSON.parse(run(
  "python3",
  ["-c", String.raw`
import importlib,json,sys
sys.set_int_max_str_digits(0)
sys.path.extend(sys.argv[1:4])
m=importlib.import_module('bench.pari-class-group-port.field3_c6_factorback_verifier')
T=153088
assert m._materialized_log_workspace_capacity(T)==(16385,105)
one=[1<<(T-1),T,0];zero=[0,0,-T]
real=[]
for place in range(3): real += one+zero+zero+zero
imag=(zero*4)*3
units=[1,0,0,0,1,0,0,0]
def workspace(stack=105): return ([0]*3,[0]*3,[0]*16385,[0]*16385,[0]*16385,[0]*16385,[17]*stack)
short=workspace(104);before=[part[:] for part in short]
try: m._materialized_logs(units,real,imag,T,short);raise AssertionError('short capacity accepted')
except m.Field3C6FactorbackFailure as error: assert 'workspace exhausted' in str(error)
assert short==tuple(before)
held=workspace();before=[part[:] for part in held]
try: m._materialized_logs(units,real,imag,153024,held);raise AssertionError('PRECI accepted')
except m.Field3C6FactorbackFailure as error: assert 'unsupported' in str(error)
assert held==tuple(before)
logs_real,logs_imag=m._materialized_logs(units,real,imag,T,workspace())
assert logs_real==([0,0,-T]*2+[0,0,1-T])*2,logs_real
assert logs_imag==[0,-1,0]*6,logs_imag
complex_module=importlib.import_module('bench.pari-class-group-port.high_precision_complex_agm_log')
calls=[]
def fake_complex(*args):
 assert args[6]==T;calls.append(args[:7]);return 0,0,-T,0,0,-T
complex_module.pari_complex_logarithm_agm=fake_complex
complex_imag=[]
for place in range(3): complex_imag += one+zero+zero+zero
m._materialized_logs(units,real,complex_imag,T,workspace())
assert len(calls)==6
print(json.dumps({'target':T,'capacity':[16385,105],'realCells':len(logs_real),'imagCells':len(logs_imag),'complexDispatchCalls':len(calls),'shortCapacityAtomic':True,'preciAtomic':True}))
`, root, path.join(root, "src/lib"), path.join(root, "src/baselib")],
).stdout);
assert.equal(highPrecisionProbe.target, 153088);

function packedNumber(value, precision = 64) {
  if (value === 0) return [0, 0, -precision];
  let exponent = Math.floor(Math.log2(Math.abs(value)));
  let mantissa = BigInt(Math.floor(Math.abs(value) * 2 ** (precision - 1 - exponent)));
  if (mantissa === 1n << BigInt(precision)) {
    mantissa >>= 1n;
    exponent += 1;
  }
  if (value < 0) mantissa = -mantissa;
  return [mantissa, BigInt(precision), BigInt(exponent)];
}

function lowPrecisionLogAuthority(units, embeddingReal, embeddingImag) {
  const script = [
    "import importlib,json,sys",
    "sys.path.extend(sys.argv[1:4])",
    "m=importlib.import_module('" + moduleName + "')",
    "p=importlib.import_module('bench.pari-class-group-port.pi_constant')",
    "v=json.load(sys.stdin)",
    "real,imag=m._materialized_logs(list(map(int,v['units'])),list(map(int,v['real'])),list(map(int,v['imag'])),64)",
    "two=p.pari_pi_constant(64,[0,0,0],[0]*512,[0]*512,[0]*512,[0]*512,[0]*1024)",
    "print(json.dumps({'real':list(map(str,real)),'imag':list(map(str,imag)),'twoPi':list(map(str,[two[0],two[1],two[2]+1]))}))",
  ].join(";");
  return JSON.parse(run("python3", ["-c", script, root, path.join(root, "src/lib"), path.join(root, "src/baselib")], {
    input: JSON.stringify({ units, real: embeddingReal, imag: embeddingImag }),
  }).stdout);
}

function packedSum(left, right) {
  const script = [
    "import importlib,json,sys",
    "sys.path.extend(sys.argv[1:3])",
    "m=importlib.import_module('bench.pari-class-group-port.log_matrix_transform')",
    "v=json.load(sys.stdin)",
    "print(json.dumps(list(map(str,m.pari_log_scalar_sum(*map(int,v['left']),*map(int,v['right']))))))",
  ].join(";");
  return JSON.parse(run("python3", ["-c", script, root, path.join(root, "src/lib")], {
    input: JSON.stringify({ left, right }),
  }).stdout);
}

function powerBasisTensor() {
  const result = [];
  for (let left = 0; left < 4; left += 1) {
    for (let right = 0; right < 4; right += 1) {
      let degree = left + right;
      let coefficient = 1;
      if (degree >= 4) {
        degree -= 4;
        coefficient = 2;
      }
      for (let row = 0; row < 4; row += 1)
        result.push(row === degree ? coefficient : 0);
    }
  }
  return result;
}

const zeroLog = () => [1, 0, -1, 0, 0, -1, 0];
function generatedOwners() {
  const generators = Array(301 * 4).fill(0);
  for (let column = 0; column < 301; column += 1) generators[4 * column] = 1;
  generators.splice(0, 16,
    2, 2, 2, 2, // 2 * (1+x+x^2+x^3)
    2, 0, 0, 0,
    3, 3, 0, 0, // 3 * (1+x)
    3, 0, 0, 0,
  );
  const relations = Array(288 * 301).fill(0);
  relations[0] = 1;
  relations[288] = 1;
  relations[2 * 288 + 1] = 1;
  relations[3 * 288 + 1] = 1;
  const raw = Array(602).fill(0);
  raw[0] = 1;
  raw[1] = -1;
  raw[301 + 2] = 1;
  raw[301 + 3] = -1;
  const adjusted = raw.slice();
  for (let index = 0; index < 301; index += 1) adjusted[index] = -adjusted[index];
  const sourceLogs = Array.from({ length: 301 * 3 }, zeroLog).flat();
  function setReal(column, values) {
    for (let place = 0; place < 3; place += 1) {
      const at = 7 * (3 * column + place);
      sourceLogs.splice(at, 7, 1, values[place], -1, 0, 0, -1, 0);
    }
  }
  setReal(0, [5, 7, -12]);
  setReal(1, [2, 3, -5]);
  setReal(2, [11, 13, -24]);
  setReal(3, [1, 2, -3]);
  const root4 = 2 ** 0.25;
  const embeddings = [
    [[1, 0], [root4, 0], [root4 ** 2, 0], [root4 ** 3, 0]],
    [[1, 0], [-root4, 0], [root4 ** 2, 0], [-(root4 ** 3), 0]],
    [[1, 0], [0, root4], [-(root4 ** 2), 0], [0, -(root4 ** 3)]],
  ];
  const embeddingReal = embeddings.flatMap((place) => place.flatMap(([real]) => packedNumber(real))).map(String);
  const embeddingImag = embeddings.flatMap((place) => place.flatMap(([, imag]) => packedNumber(imag))).map(String);
  const units = ["1", "-1", "0", "0", "1", "1", "0", "0"];
  const logAuthority = lowPrecisionLogAuthority(units, embeddingReal, embeddingImag);
  const logsReal = logAuthority.real.map(String);
  const logsImag = logAuthority.imag.map(String);
  const preparedReal = logsReal.slice();
  const preparedImag = logsImag.slice();
  for (let index = 0; index < 9; index += 3) {
    preparedReal[index] = String(-BigInt(preparedReal[index]));
    preparedImag[index] = String(-BigInt(preparedImag[index]));
  }
  const c5OwnerSha256 = "a".repeat(64);
  const common = {
    field: "x^4-2",
    runIdentity: "pari-2.17.4:fresh-low-p:x4-2",
    precision: 64,
    generation: 1,
  };
  return {
    source: {
      schema: "sagejs.pari-class-group/field3-c6-factorback-source-v1",
      ...common,
      c5OwnerSha256,
      principalGenerators: generators.map(String),
      relationRecords: relations.map(String),
      multiplicationBasis: powerBasisTensor().map(String),
      rawUnitTransform: raw.map(String),
      sourceRawLogs: sourceLogs.map(String),
      preparedCleanReal: preparedReal,
      preparedCleanImag: preparedImag,
      embeddingReal,
      embeddingImag,
      logPrecision: 64,
      twoPi: logAuthority.twoPi.map(String),
      phasePeriodMultipliers: ["1", "1", "2"],
      phaseToleranceExponent: -55,
    },
    c6: {
      schema: "sagejs.pari-class-group/field3-c6-getfu-v1",
      ...common,
      status: "success",
      reason: null,
      c5OwnerSha256,
      inverseMask: 1,
      unitNorms: ["-1", "-1"],
      // First column deliberately differs by torsion -1 from q^-1.
      units,
      logsReal,
      logsImag,
      adjustedWraw: adjusted.map(String),
    },
  };
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "field3-c6-factorback-"));
const output = path.join(temporary, "out");
function owner(name, value, rawBytes = null) {
  const bytes = rawBytes || Buffer.from(`${JSON.stringify(value)}\n`);
  const sha256 = digest(bytes);
  const file = path.join(temporary, `${name}-${sha256}.json`);
  fs.writeFileSync(file, bytes, { mode: 0o444 });
  fs.chmodSync(file, 0o444);
  return { file, sha256 };
}
function verify(files, expected = 0) {
  return run(
    "python3",
    [
      "-c",
      "import importlib,sys;sys.path.extend(sys.argv[1:4]);sys.argv=[sys.argv[0],*sys.argv[4:]];importlib.import_module('" + moduleName + "')._main()",
      root,
      path.join(root, "src/lib"),
      path.join(root, "src/baselib"),
      "--source", files.source.file,
      "--source-sha256", files.source.sha256,
      "--c6", files.c6.file,
      "--c6-sha256", files.c6.sha256,
      "--output-dir", output,
    ],
    {},
    expected,
  );
}

try {
  const values = generatedOwners();
  // A direct flattened packed transform is retained only as an exact-data
  // regression. It is not an authenticated requirement for floating owners,
  // whose HNF schedule has intermediate rounding and cleanarch phase changes.
  const flatReplay = JSON.parse(run("python3", ["-c", [
    "import importlib,json,sys",
    "sys.path.extend(sys.argv[1:3])",
    "v=json.load(sys.stdin)",
    "m=importlib.import_module('bench.pari-class-group-port.log_matrix_transform')",
    "o=[0]*42",
    "m.pari_log_matrix_transform(list(map(int,v['logs'])),list(map(int,v['transform'])),3,301,2,False,o)",
    "print(json.dumps(o))",
  ].join(";"), root, path.join(root, "src/lib")], {
    input: JSON.stringify({
      logs: values.source.sourceRawLogs,
      transform: values.source.rawUnitTransform,
    }),
  }).stdout);
  assert.deepEqual([0, 1, 2, 21, 22, 29].map((index) => flatReplay[index]), [1, 3, -1, 1, 10, 11]);
  const files = { source: owner("source", values.source), c6: owner("c6", values.c6) };
  const first = JSON.parse(verify(files).stdout);
  const second = JSON.parse(verify(files).stdout);
  assert.deepEqual(second, first);
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  const receipt = JSON.parse(fs.readFileSync(first.path, "utf8"));
  assert.deepEqual(receipt.verified, {
    exactFactorback: true,
    logLattice: true,
    normAndInverse: true,
    principalIdealOne: true,
    relationKernel: true,
    torsionPlusMinusOne: true,
  });
  assert.deepEqual(receipt.columns.map((column) => column.inverseChosen), [true, false]);
  assert.deepEqual(receipt.columns.map((column) => column.torsionSign), [-1, 1]);
  assert.deepEqual(receipt.columns.map((column) => column.factorbackNorm), [-1, -1]);

  // The independently replayed phase is an element of R/(2*pi*Z), not a
  // byte-exact real number. Shift one C6/C5 phase pair by the recorded period
  // and require the authenticated verifier to accept the equivalent class.
  const periodValues = structuredClone(values);
  periodValues.c6.logsImag.splice(
    0,
    3,
    ...packedSum(periodValues.c6.logsImag.slice(0, 3), periodValues.source.twoPi),
  );
  periodValues.source.preparedCleanImag.splice(
    0,
    3,
    String(-BigInt(periodValues.c6.logsImag[0])),
    periodValues.c6.logsImag[1],
    periodValues.c6.logsImag[2],
  );
  const periodFiles = {
    source: owner("period-source", periodValues.source),
    c6: owner("period-c6", periodValues.c6),
  };
  const periodReceipt = JSON.parse(verify(periodFiles).stdout);
  assert.notEqual(periodReceipt.sha256, first.sha256);
  const before = fs.readdirSync(output).sort();
  let mutations = 0;
  const cases = [
    ["raw Wraw", "source", (value) => { value.rawUnitTransform[0] = "2"; }],
    ["principal", "source", (value) => { value.principalGenerators[0] = "3"; }],
    ["relation", "source", (value) => { value.relationRecords[0] = "2"; }],
    ["tensor", "source", (value) => { value.multiplicationBasis[0] = "2"; }],
    ["unit", "c6", (value) => { value.units[0] = "2"; }],
    ["inverse", "c6", (value) => { value.inverseMask = 0; }],
    ["log", "c6", (value) => { value.logsReal[0] = "-2"; }],
    ["adjusted Wraw", "c6", (value) => { value.adjustedWraw[0] = "2"; }],
    ["C5 prepared log", "source", (value) => { value.preparedCleanReal[0] = "2"; }],
    ["embedding", "source", (value) => { value.embeddingReal[3] = value.embeddingReal[0]; }],
    ["phase authority", "source", (value) => { value.twoPi = []; }],
  ];
  for (const [label, selected, mutate] of cases) {
    const changed = structuredClone(values[selected]);
    mutate(changed);
    const changedFiles = { ...files, [selected]: owner(`bad-${mutations}`, changed) };
    assert.notEqual(verify(changedFiles, 1).stderr.length, 0, `${label} mutation was silent`);
    assert.deepEqual(fs.readdirSync(output).sort(), before, `${label} published a receipt`);
    mutations += 1;
  }
  const wrongDigest = { ...files, source: { ...files.source, sha256: "0".repeat(64) } };
  assert.notEqual(verify(wrongDigest, 1).stderr.length, 0);
  assert.deepEqual(fs.readdirSync(output).sort(), before);
  mutations += 1;

  const badPhaseValues = structuredClone(values);
  badPhaseValues.c6.logsImag.splice(0, 3, "1", "-1", "0");
  badPhaseValues.source.preparedCleanImag.splice(0, 3, "-1", "-1", "0");
  const badPhaseFiles = {
    source: owner("bad-phase-source", badPhaseValues.source),
    c6: owner("bad-phase-c6", badPhaseValues.c6),
  };
  assert.notEqual(verify(badPhaseFiles, 1).stderr.length, 0);
  assert.deepEqual(fs.readdirSync(output).sort(), before);
  mutations += 1;

  const duplicate = Buffer.from(`${JSON.stringify(values.source).replace(
    '"field":"x^4-2"',
    '"field":"x^4-2","field":"x^4-2"',
  )}\n`);
  const duplicateFiles = { ...files, source: owner("duplicate", null, duplicate) };
  assert.notEqual(verify(duplicateFiles, 1).stderr.length, 0);
  assert.deepEqual(fs.readdirSync(output).sort(), before);
  mutations += 1;

  console.log(JSON.stringify({
    schema: "field3-c6-factorback-check-v1",
    pristinePariVersion: "2.17.4",
    pristineLowPrecision: true,
    syntheticExpectedUnitFixture: false,
    exactFactorbackColumns: 2,
    relationProducts: 288 * 301 * 2,
    exactTorsionSigns: [-1, 1],
    equivalentPhasePeriodAccepted: true,
    highPrecisionSparseProbe: highPrecisionProbe,
    mutationsRejected: mutations,
    atomicIdempotentPublication: true,
    authentic153088Executed: false,
    receiptSha256: first.sha256,
  }, null, 2));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
