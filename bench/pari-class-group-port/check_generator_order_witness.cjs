"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const archiveSha256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const fixture = {
  generator: [38n, 21n, 34n, 0n, 1n, 0n, 0n, 0n, 1n],
  invariant: 24n,
  table: [
    1n, 0n, 0n, 0n, 1n, 0n, 0n, 0n, 1n,
    0n, 1n, 0n, 133n, 0n, 1n, -7n, 67n, 0n,
    0n, 0n, 1n, -7n, 67n, 0n, 8911n, -7n, -66n,
  ],
  relationHnf: [12n, 0n, 7n, 2n],
  relation: [-3n, -1n],
  smithM1: [1n, -12n],
  factorKinds: [0n, 0n, 1n, 0n],
  factorValues: [
    1n, 0n, 0n, 8n,
    1n, 0n, 0n, 5n,
    -17n, 1n, 0n, 1n,
    40n, 0n, 0n, 1n,
  ],
  factorExponents: [1n, 1n, -1n, 1n],
  principalNumerator: [-8468276398993147n, -902686052011765n, -63907780848204n],
  principalDenominator: 1n,
  powerIdeal: [
    82187603825523214603738912597460647936n,
    35131949108381503803212028440153102783n,
    16620443542272874311186549093436957700n,
    0n, 1n, 0n, 0n, 0n, 1n,
  ],
  trace: [
    1444n, 743n, 1136n, 0n, 1n, 0n, 0n, 0n, 1n,
    2085136n, 1609359n, 695700n, 0n, 1n, 0n, 0n, 0n, 1n,
    4347792138496n, 1882268472511n, 3001209920260n, 0n, 1n, 0n, 0n, 0n, 1n,
    4347792138496n, 1882268472511n, 3001209920260n, 0n, 1n, 0n, 0n, 0n, 1n,
    18903296479567620845142016n, 879318777668511296788927n,
    223396691192809694766084n, 0n, 1n, 0n, 0n, 0n, 1n,
    82187603825523214603738912597460647936n,
    35131949108381503803212028440153102783n,
    16620443542272874311186549093436957700n,
    0n, 1n, 0n, 0n, 0n, 1n,
  ],
};

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
function values(owner) {
  return Array.isArray(owner) ? owner : owner.toArray();
}
function checkPariOracle(pariRoot, archive) {
  assert.equal(hash(fs.readFileSync(archive)), archiveSha256);
  const gp = path.join(pariRoot, "Olinux-x86_64", "gp-dyn");
  const expectedIdeal =
    "[82187603825523214603738912597460647936,35131949108381503803212028440153102783,16620443542272874311186549093436957700;0,1,0;0,0,1]";
  const program = `
print("VERSION|",version())
nf=nfinit(x^3-200*x+7); b=bnfinit(x^3-200*x+7,1); G=b.gen[1]; J=idealpow(nf,G,24); z=bnfisprincipal(b,J)[2];
print("GENERATOR|",G==[38,21,34;0,1,0;0,0,1])
print("INVARIANT|",b.cyc==[24])
print("SMITH|",Col([-3,-1])*24==b[1]*Col([1,-12]))
print("FACTORS|",b[9][4]==[[1/8,1;1/5,1;[-17,1,0]~,-1;40,1]]~)
print("POWER|",J==${expectedIdeal})
print("PRINCIPAL|",z==[-8468276398993147,-902686052011765,-63907780848204]~)
print("PRINCIPALIDEAL|",idealhnf(nf,z)==J)
print("NORM|",abs(nfeltnorm(nf,z))==idealnorm(nf,J))
`;
  const lines = run(gp, ["-fq"], { input: program }).trim().split(/\r?\n/);
  assert.match(lines.shift(), /^VERSION\|(?:2\.17\.4|\[2, 17, 4\])$/);
  assert.deepEqual(lines, [
    "GENERATOR|1", "INVARIANT|1", "SMITH|1", "FACTORS|1",
    "POWER|1", "PRINCIPAL|1", "PRINCIPALIDEAL|1", "NORM|1",
  ]);
}

function invoke(api, backend, changes = {}) {
  const exact = (entries) => backend === "javascript"
    ? entries.slice()
    : api.createIntegerBuffer(entries.length, 512, entries);
  const input = (name, fallback) => exact((changes[name] || fallback).slice());
  const guard = (count) => exact(Array(count).fill(77n));
  const state = guard(10);
  const call = {
    generator: input("generator", fixture.generator),
    principalNumerator: input("principalNumerator", fixture.principalNumerator),
    factorExponents: input("factorExponents", fixture.factorExponents),
    relation: input("relation", fixture.relation),
    powerIdeal: guard(9),
    principalHnf: guard(9),
    retainedKinds: guard(4),
    retainedValues: guard(16),
    retainedExponents: guard(4),
    retainedMetadata: guard(1),
    powerTrace: guard(54),
    state,
  };
  const args = [
    call.generator,
    changes.invariant || fixture.invariant,
    exact(fixture.table),
    exact(fixture.relationHnf),
    call.relation,
    exact(fixture.smithM1),
    exact(fixture.factorKinds),
    exact(fixture.factorValues),
    call.factorExponents,
    exact([4n]),
    call.principalNumerator,
    fixture.principalDenominator,
    guard(9), guard(9), guard(9), guard(27), guard(27),
    guard(9), guard(9), guard(9), guard(54),
    call.powerIdeal, call.principalHnf,
    call.retainedKinds, call.retainedValues, call.retainedExponents,
    call.retainedMetadata, call.powerTrace, call.state,
  ];
  call.status = api[backend](...args);
  return call;
}
function checkSuccess(call, label) {
  assert.equal(call.status, 0n, label);
  assert.deepEqual(values(call.powerIdeal), fixture.powerIdeal, `${label}: I^24`);
  assert.deepEqual(values(call.principalHnf), fixture.powerIdeal, `${label}: (alpha)`);
  assert.deepEqual(values(call.retainedKinds), fixture.factorKinds, `${label}: factor kinds`);
  assert.deepEqual(values(call.retainedValues), fixture.factorValues, `${label}: factor values`);
  assert.deepEqual(values(call.retainedExponents), fixture.factorExponents, `${label}: factor exponents`);
  assert.deepEqual(values(call.retainedMetadata), [4n], `${label}: factor count`);
  assert.deepEqual(values(call.powerTrace), fixture.trace, `${label}: HNF trace`);
  assert.deepEqual(values(call.state), [
    0n, 24n, 6n, 2n, 4n,
    fixture.powerIdeal[0], fixture.powerIdeal[0], 9n, 54n, 1n,
  ]);
}
function checkRejected(call, label) {
  assert.equal(call.status, -1n, label);
  for (const name of [
    "powerIdeal", "principalHnf", "retainedKinds", "retainedValues",
    "retainedExponents", "retainedMetadata", "powerTrace",
  ]) {
    assert.deepEqual(values(call[name]), Array(values(call[name]).length).fill(77n),
      `${label}: transactional ${name}`);
  }
}

(async () => {
  const pariRoot = path.resolve(process.argv[2] ||
    "/scratch/sagejs-runtime/pari-class-group-e2e-20260916/toolchains/src/pari-2.17.4-phase0");
  const archive = path.resolve(process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz");
  checkPariOracle(pariRoot, archive);

  const sourcePath = path.join(__dirname, "generator_order_witness.py");
  const dynamic = `
import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.generator_order_witness').pari_cubic_generator_order_witness_frozen
v=json.load(sys.stdin); cv=lambda x:list(map(int,x)); g=lambda n:[77]*n
out=[g(9),g(9),g(4),g(16),g(4),g(1),g(54),g(10)]
args=[cv(v['generator']),24,cv(v['table']),cv(v['relationHnf']),cv(v['relation']),cv(v['smithM1']),cv(v['factorKinds']),cv(v['factorValues']),cv(v['factorExponents']),[4],cv(v['principalNumerator']),1,g(9),g(9),g(9),g(27),g(27),g(9),g(9),g(9),g(54),*out]
assert f(*args)==0
enc=lambda x:[enc(y) for y in x] if isinstance(x,list) else str(x) if isinstance(x,int) else x
print(json.dumps(enc(out)))`;
  const serial = JSON.stringify(fixture, (_, value) =>
    typeof value === "bigint" ? String(value) : value);
  const py = JSON.parse(run("/usr/bin/python3", [
    "-c", dynamic, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib"),
  ], { input: serial }), (_, value) => typeof value === "string" ? BigInt(value) : value);
  assert.deepEqual(py[0], fixture.powerIdeal);
  assert.deepEqual(py[1], fixture.powerIdeal);
  assert.deepEqual(py[6], fixture.trace);

  const built = await compileKernel({ sourcePath });
  const api = require(built.modulePath).pari_cubic_generator_order_witness_frozen;
  assert(api.nativeAvailable);
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);
  const mutations = [
    ["generator", { generator: fixture.generator.with(1, 22n) }],
    ["invariant", { invariant: 23n }],
    ["principal", { principalNumerator: fixture.principalNumerator.with(0, fixture.principalNumerator[0] + 1n) }],
    ["factor", { factorExponents: fixture.factorExponents.with(2, -2n) }],
    ["smith", { relation: fixture.relation.with(0, -2n) }],
  ];
  const summaries = {};
  for (const backend of ["javascript", "gmp", "tagged"]) {
    checkSuccess(invoke(api, backend), backend);
    for (const [name, change] of mutations) {
      checkRejected(invoke(api, backend, change), `${backend}:${name}`);
    }
    summaries[backend] = { exactProducts: 6, mutationRejections: mutations.length };
  }
  console.log(JSON.stringify({
    field: "x^3 - 200*x + 7",
    invariant: 24,
    principalGenerator: fixture.principalNumerator.map(String),
    idealNorm: fixture.powerIdeal[0].toString(),
    products: 6,
    traceMatrices: 6,
    retainedFactors: 4,
    backends: ["PARI-2.17.4", "cpython", "javascript", "gmp", "tagged"],
    summaries,
    sourceSha256: hash(fs.readFileSync(sourcePath)),
    coreSha256: hash(core),
    coreBytes: Buffer.byteLength(core),
    qualifiedTiming: false,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
