#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "field3_live_class_suffix.py");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function values(owner) {
  return Array.isArray(owner) ? owner : owner.toArray();
}

function allocate(api, backend, live, mutation = "") {
  const exact = (entries) => backend === "javascript"
    ? entries.map(BigInt)
    : api.createIntegerBuffer(entries.length, 1536, entries.map(BigInt));
  const z = (length, fill = 0n) => exact(Array(length).fill(fill));
  const i64 = (entries) => entries.map(BigInt);
  const h = live.h.map(BigInt);
  const permutation = live.outerPerm.map(BigInt);
  const packetGenerators = live.packetGenerators.map(BigInt);
  const basisTable = live.basisTable.map(BigInt);
  if (mutation === "hnf") h[0] = 1n;
  if (mutation === "permutation") permutation[1] = permutation[0];
  if (mutation === "generator") packetGenerators[4 * (Number(permutation[0]) - 1)] += 1n;
  const matrices = Array.from({ length: 10 }, () => z(4));
  const retained = {
    indices: z(2, 77n), primes: z(2, 77n), generators: z(8, 77n),
    antiuniformizers: z(8, 77n), tau: z(32, 77n),
    order: z(4, 77n), m1: z(4, 77n),
    offsets: z(3, 77n), kinds: z(2, 77n), numerators: z(2, 77n),
    denominators: z(2, 77n), exponents: z(2, 77n),
  };
  const call = {
    generatorIdeals: z(32), relationExponents: z(4), invariants: z(2),
    classNumber: z(1), factorOffsets: z(3), factorKinds: z(2),
    factorNumerators: z(2), factorDenominators: z(2), factorExponents: z(2),
    matrices, retained, suffixState: i64(Array(12).fill(77)),
  };
  call.args = [
    exact(h), exact(live.c), i64(live.hnfState), exact(permutation),
    BigInt(live.packetCount), exact(live.packetPrimes),
    exact(packetGenerators), exact(live.packetInert), exact(basisTable),
    z(4), z(42), z(2), z(8), z(32), z(32),
    z(4), z(44), z(4), z(4), z(16), z(4), z(4), z(4), z(1), z(4), z(16), z(3),
    call.generatorIdeals, z(32), call.relationExponents,
    call.factorOffsets, call.factorKinds, call.factorNumerators,
    call.factorDenominators, call.factorExponents,
    z(16), z(16), z(52), z(20), z(4),
    ...matrices,
    call.invariants, call.classNumber, z(42), z(42), z(42),
    z(2), z(4), z(8),
    ...Array.from({ length: 4 }, () => i64(Array(7).fill(0))),
    i64(Array(9).fill(0)), i64(Array(3).fill(0)),
    z(42), z(42), z(42), z(42), z(42), z(42), i64(Array(8).fill(0)),
    retained.indices, retained.primes, retained.generators,
    retained.antiuniformizers, retained.tau,
    retained.order, retained.m1, retained.offsets, retained.kinds,
    retained.numerators, retained.denominators, retained.exponents,
    call.suffixState,
  ];
  return call;
}

function snapshotRetained(call) {
  return Object.fromEntries(Object.entries(call.retained).map(
    ([name, owner]) => [name, values(owner).map(String)],
  ));
}

function check(call, expected, label) {
  assert.deepEqual(values(call.generatorIdeals).map(String), expected.generatorIdeals,
    `${label}: generator ideals`);
  assert.deepEqual(values(call.relationExponents).map(String), expected.order,
    `${label}: order exponents`);
  assert.deepEqual(values(call.invariants).map(String), ["2", "2"],
    `${label}: invariants`);
  assert.deepEqual(values(call.classNumber).map(String), ["4"],
    `${label}: class number`);
  assert.deepEqual(snapshotRetained(call), expected.retained,
    `${label}: retained exact witnesses`);
  assert.deepEqual(call.suffixState.map(String), expected.suffixState,
    `${label}: suffix state`);
}

(async () => {
  assert.equal(process.argv.length, 5,
    "usage: check_field3_live_class_suffix.cjs INITIAL ANALYTIC TRACE");
  const preparation = run(process.execPath, [
    path.join(__dirname, "check_prepared_class_group_resumable_field3.cjs"),
    ...process.argv.slice(2), "--source-only",
  ]).trim().split(/\r?\n/).at(-1);
  const prepared = JSON.parse(preparation);
  assert.equal(prepared.field, 3);
  const inputPath = path.join(prepared.directory, "input.json");
  assert(fs.existsSync(inputPath), "prepared replay did not retain its input workspace");

  const python = String.raw`
import decimal, importlib, inspect, json, sys
sys.set_int_max_str_digits(100000)
sys.path[:0] = sys.argv[2:4]
d = json.load(open(sys.argv[1]))
driver = importlib.import_module('bench.pari-class-group-port.prepared_class_group_resumable')
suffix = importlib.import_module('bench.pari-class-group-port.field3_live_class_suffix')
descriptor = importlib.import_module('bench.pari-class-group-port.prime_ideal_hnf')
quartic = importlib.import_module('bench.pari-class-group-port.quartic_signed_genback')
def fresh():
    return {name: ([float(x) if kind == 'Float64Buffer' else int(x) for x in d['raw'][name]] if kind.endswith('Buffer') else float(d['raw'][name]) if kind == 'float' else bool(d['raw'][name]) if kind == 'bool' else int(d['raw'][name])) for name, kind in d['names']}
v = fresh()
assert driver.pari_prepared_class_group_resumable(**v) == 0
assert v['class_number'][0] == 4 and v['class_invariants'][:2] == [2,2]
z = lambda n: [0] * n
matrices = [z(4) for _ in range(10)]
G=z(32); rel=z(4); off=z(3); kinds=z(2); nums=z(2); dens=z(2); exps=z(2)
inv=z(2); number=z(1); retained=[[77]*n for n in [2,2,8,8,32,4,4,3,2,2,2,2]]
state=[77]*12
selected_anti=z(8); selected_tau=z(32); selected_tau_work=z(32)
args=[v['hnf_result_h'],v['hnf_result_c'],v['hnf_state'],v['outer_perm'],len(v['packet_primes']),v['packet_primes'],v['packet_generators'],v['packet_inert'],v['basis_table'],z(4),z(42),z(2),selected_anti,selected_tau,selected_tau_work,z(4),z(44),z(4),z(4),z(16),z(4),z(4),z(4),z(1),z(4),z(16),z(3),G,z(32),rel,off,kinds,nums,dens,exps,z(16),z(16),z(52),z(20),z(4),*matrices,inv,number,z(42),z(42),z(42),z(2),z(4),z(8),*[z(7) for _ in range(4)],z(9),z(3),z(42),z(42),z(42),z(42),z(42),z(42),z(8),*retained,state]
assert suffix.pari_field3_live_class_suffix(*args) == 0
assert v['outer_perm'][:2] == [11,2]
assert retained[0] == [11,2] and retained[1] == [13,3]
assert inv == [2,2] and number == [4]
proofs=[]
for generator, selected in enumerate(v['outer_perm'][:2]):
    packet=selected-1; prime=v['packet_primes'][packet]
    P=v['packet_ideals'][16*packet:16*packet+16]
    published=selected_tau[16*generator:16*generator+16]
    working=selected_tau_work[16*generator:16*generator+16]
    assert published == [working[4*column+row] for row in range(4) for column in range(4)]
    hnf=z(16)
    quartic.pari_quartic_composite_hnf(working,4,prime,z(52),z(20),z(4),hnf)
    inverse=z(16)
    quartic.pari_quartic_ideal_hnf_inverse_scaled(P,v['basis_table'],z(16),z(4),z(4),z(52),z(20),z(4),inverse)
    generated=G[16*generator:16*generator+16]
    assert hnf == inverse == generated
    product=z(16)
    quartic.pari_quartic_ideal_hnf_multiply(P,generated,v['basis_table'],z(64),z(32),z(52),z(20),z(4),z(16),product)
    principal=[prime if row == column else 0 for row in range(4) for column in range(4)]
    assert product == principal
    wrong=z(16); wrong_hnf=z(16)
    descriptor.pari_basis_multiplication_table(v['basis_table'],v['packet_generators'][4*packet:4*packet+4],4,wrong)
    quartic.pari_quartic_composite_hnf(wrong,4,prime,z(52),z(20),z(4),wrong_hnf)
    assert wrong_hnf != generated
    proofs.append({'packet':selected,'prime':prime,'hnfEqualsInverse':True,'productIsPrincipal':True,'oldUniformizerTauRejected':True})
enc=lambda x:[enc(y) for y in x] if isinstance(x,list) else str(x) if isinstance(x,int) else x
out={'live':{'h':enc(v['hnf_result_h'][:4]),'c':enc(v['hnf_result_c'][:42]),'hnfState':v['hnf_state'][:9],'outerPerm':enc(v['outer_perm']),'packetCount':len(v['packet_primes']),'packetPrimes':enc(v['packet_primes']),'packetGenerators':enc(v['packet_generators']),'packetInert':enc(v['packet_inert']),'basisTable':enc(v['basis_table'])},'expected':{'generatorIdeals':enc(G),'order':enc(rel),'retained':dict(zip(['indices','primes','generators','antiuniformizers','tau','order','m1','offsets','kinds','numerators','denominators','exponents'],map(enc,retained))),'suffixState':enc(state),'proofs':proofs}}
json.dump(out,open(sys.argv[4],'w'))
`;
  const joinedPath = path.join(prepared.directory, "live-class-join.json");
  run("python3", ["-c", python, inputPath, root, path.join(root, "src/lib"), joinedPath]);
  const joined = JSON.parse(fs.readFileSync(joinedPath));
  assert.deepEqual(joined.expected.retained.indices, ["11", "2"]);
  assert.deepEqual(joined.expected.retained.primes, ["13", "3"]);
  assert.equal(joined.expected.retained.antiuniformizers.length, 8);
  assert.deepEqual(joined.expected.retained.denominators, ["13", "3"]);
  assert.deepEqual(joined.expected.proofs.map((proof) => proof.hnfEqualsInverse), [true, true]);
  assert.deepEqual(joined.expected.proofs.map((proof) => proof.productIsPrincipal), [true, true]);

  const built = await compileKernel({ sourcePath });
  const api = require(built.modulePath).pari_field3_live_class_suffix;
  assert(api.nativeAvailable);
  const summaries = {};
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const call = allocate(api, backend, joined.live);
    assert.equal(api[backend](...call.args), 0n, backend);
    check(call, joined.expected, backend);
    let rejected = 0;
    for (const mutation of ["hnf", "permutation", "generator"]) {
      const bad = allocate(api, backend, joined.live, mutation);
      const before = snapshotRetained(bad);
      let status = -1n;
      try {
        status = api[backend](...bad.args);
      } catch (error) {
        assert.match(String(error), /dependence|descriptor|suffix|HNF|division/,
          `${backend}:${mutation}: unexpected rejection`);
      }
      assert.notEqual(status, 0n, `${backend}:${mutation}`);
      assert.deepEqual(snapshotRetained(bad), before,
        `${backend}:${mutation}: partial retained witness publication`);
      rejected += 1;
    }
    summaries[backend] = { selectedPackets: [11, 2], rejected };
  }
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);
  console.log(JSON.stringify({
    field: 3,
    polynomial: "x^4 - 2000022*x - 2000042",
    sameRunOwners: ["H", "C", "outer_perm", "packet descriptors"],
    selectedPackets: [11, 2], selectedPrimes: [13, 3],
    classGroup: [2, 2], classNumber: 4,
    inverseIdealProofs: joined.expected.proofs,
    retainedOrderRows: 4, retainedPrincipalFactors: 2,
    backends: ["CPython", "javascript", "gmp", "tagged"], summaries,
    coreBytes: fs.statSync(built.coreSourcePath).size,
    artifactDirectory: prepared.directory,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
