#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const compilerPath = process.env.SAGEJS_REPLAY_RUNTIME_ROOT
  ? path.join(process.env.SAGEJS_REPLAY_RUNTIME_ROOT, "tools/native-kernel/compiler.cjs")
  : "../../tools/native-kernel/compiler.cjs";
const { compileKernel } = require(compilerPath);

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "live_h1_owner_bridge.py");
const residentPath = path.resolve(
  process.argv[2] || "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
);
const resident = JSON.parse(fs.readFileSync(residentPath, "utf8"));
const source = fs.readFileSync(sourcePath, "utf8");
const columnCapacity = 16;
const logicalColumns = 7;
const names = source
  .match(/def pari_live_h1_owner_bridge\(([\s\S]*?)\n\)/)[1]
  .trim()
  .split("\n")
  .map((line) => line.trim().replace(/,$/, "").split(": "));
assert.deepEqual(
  names.find(([name]) => name === "prep_state"),
  ["prep_state", "IntegerBuffer"],
);

const sizes = {
  unit_transform: 2 * columnCapacity, getfu_factor: 4,
  compact_provenance: 2 * columnCapacity,
  cleaned_arch: 21 * columnCapacity, bridge_state: 16,
  u1: 2 * columnCapacity, u2: 4, first_arch: 42,
  p_triples: 18, au: 42, clean_logs: 18, signs: 6, unit_state: 5,
  unit_trace: 5, integer_state: 5, integer_basis: 2 * columnCapacity,
  integer_transform: columnCapacity ** 2, integer_gram: columnCapacity ** 2,
  integer_mu: columnCapacity ** 2,
  integer_mu_exponents: columnCapacity ** 2,
  integer_r: columnCapacity ** 2,
  integer_r_exponents: columnCapacity ** 2,
  integer_s: columnCapacity, integer_s_exponents: columnCapacity,
  integer_approximate: 2 * columnCapacity,
  integer_float_gram: columnCapacity ** 2, integer_alpha: columnCapacity,
  integer_column: columnCapacity, integer_column_exponents: columnCapacity,
  integer_normalized: columnCapacity, integer_temporary: columnCapacity,
  integer_dpe_scratch: columnCapacity, integer_scratch: columnCapacity,
  real_integers: 6, real_form: 3, real_basis: 6, real_transform: 4,
  real_gram: 4, real_mu: 4, real_mu_exponents: 4, real_r: 4,
  real_r_exponents: 4, real_s: 2, real_s_exponents: 2,
  real_approximate: 6, real_float_gram: 4, real_alpha: 2,
  real_column: 3, real_column_exponents: 3, real_normalized: 3,
  real_temporary: 3, real_dpe_scratch: 3, real_scratch: 3, real_state: 2,
  factor_matep: 18, factor_basis: 6, factor_transform: 4, factor_state: 2,
  factor_mu: 4, factor_mu_exponents: 4, factor_r: 4,
  factor_r_exponents: 4, factor_s: 2, factor_s_exponents: 2,
  factor_approximate: 6, factor_float_gram: 4, factor_alpha: 2,
  factor_column: 3, factor_column_exponents: 2, factor_normalized: 3,
  factor_temporary: 3, factor_exact_gram: 4, clean_pi_cache: 3,
  clean_a: 512, clean_b: 512, clean_p: 512, clean_q: 512,
  clean_stack: 1024, clean_scratch: 21 * columnCapacity,
  clean_state: 4, driver_state: 10,
};
const floatNames = new Set(names.filter(([, kind]) => kind === "Float64Buffer").map(([name]) => name));
const int64Names = new Set(names.filter(([, kind]) => kind === "Int64Buffer").map(([name]) => name));
const expectedProvenance = [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, -1].map(BigInt);
const expectedBridge = [0, 0, 0, 0, 0, 7, 1, 0, 73, 8, 48, 48, 2, 7, 7, 0].map(BigInt);

function sourceValues() {
  const pad = (values, length) => [
    ...values.map(BigInt),
    ...Array(length - values.length).fill(991n),
  ];
  return {
    accepted_arch: pad(resident.hnf_result_c.slice(0, 147), 21 * columnCapacity),
    relation_lattice: pad(resident.accept_relations.slice(0, 14), 2 * columnCapacity),
    expected_regulator: resident.accept_regulator.slice(0, 3),
    prep_base_state: resident.prep_base_state.slice(0, 7),
    prep_state: resident.prep_state.slice(0, 8),
    hnf_state: resident.hnf_state.slice(0, 9),
    acceptance_state: resident.accept_acceptance_state.slice(0, 3),
    attempt_state: resident.attempt_state.slice(0, 4),
    class_number: resident.class_number.slice(0, 1),
    precision: 192,
  };
}

function values(value) {
  return Array.isArray(value) ? value : value.toArray ? value.toArray() : Array.from(value);
}

function allocate(fn, backend, overrides = {}) {
  const source = { ...sourceValues(), ...overrides };
  const answer = {};
  for (const [name, kind] of names) {
    if (Object.hasOwn(source, name)) {
      const value = source[name];
      answer[name] = kind.endsWith("Buffer")
        ? makeBuffer(fn, backend, kind, value)
        : BigInt(value);
      continue;
    }
    assert(Object.hasOwn(sizes, name), `missing size for ${name}`);
    const initial = floatNames.has(name)
      ? Array(sizes[name]).fill(0)
      : Array(sizes[name]).fill(0n);
    answer[name] = makeBuffer(fn, backend, kind, initial);
  }
  return answer;
}

function makeBuffer(fn, backend, kind, data) {
  if (backend === "javascript")
    return kind === "Float64Buffer" ? data.map(Number) : data.map(BigInt);
  if (kind === "Float64Buffer") return fn.createFloat64Buffer(data.map(Number));
  if (kind === "Int64Buffer") return fn.createInt64Buffer(data.map(BigInt));
  return fn.createIntegerBuffer(data.length, 4096, data.map(BigInt));
}

function snapshot(v) {
  const transform = values(v.unit_transform).map(BigInt);
  const provenance = values(v.compact_provenance).map(BigInt);
  const cleaned = values(v.cleaned_arch).map(BigInt);
  return {
    bridge: values(v.bridge_state).map(BigInt),
    transform: transform.slice(0, 2 * logicalColumns),
    factor: values(v.getfu_factor).map(BigInt),
    provenance: provenance.slice(0, 2 * logicalColumns),
    signs: values(v.signs).map(BigInt),
    driver: values(v.driver_state).map(BigInt),
    cleanedNonzero: cleaned.slice(0, 21 * logicalColumns).some((x) => x !== 0n),
    oversizedTailsUntouched:
      transform.slice(2 * logicalColumns).every((x) => x === 0n) &&
      provenance.slice(2 * logicalColumns).every((x) => x === 0n) &&
      cleaned.slice(21 * logicalColumns).every((x) => x === 0n),
  };
}

async function main() {
  const built = await compileKernel({ sourcePath });
  const fn = require(built.modulePath).pari_live_h1_owner_bridge;
  assert(fn.nativeAvailable);
  const reference = {};
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const v = allocate(fn, backend);
    const invoke = () => fn[backend](...names.map(([name]) => v[name]));
    assert.equal(invoke(), 0n);
    const got = snapshot(v);
    assert.deepEqual(got.bridge, expectedBridge);
    assert.deepEqual(got.transform, expectedProvenance);
    assert.deepEqual(got.factor, [1n, 0n, 0n, 1n]);
    assert.deepEqual(got.provenance, expectedProvenance);
    assert.deepEqual(got.signs, [0n, 0n, 1n, 1n, 1n, 1n]);
    assert.deepEqual(got.driver, [0n, 1n, 1n, 48n, 48n, 7n, 7n, 73n, 8n, 0n]);
    assert(got.cleanedNonzero);
    assert(got.oversizedTailsUntouched);
    if (backend === "javascript") Object.assign(reference, got);
    else assert.deepEqual(got, reference);

    const bad = allocate(fn, backend, { attempt_state: [4, 0, 1, 1] });
    assert.equal(fn[backend](...names.map(([name]) => bad[name])), 1n);
    assert.deepEqual(values(bad.bridge_state).map(BigInt).slice(0, 2), [1n, 0n]);
    for (const owner of [bad.unit_transform, bad.getfu_factor, bad.compact_provenance, bad.cleaned_arch])
      assert(values(owner).every((x) => BigInt(x) === 0n));

    for (const [name, changed] of [
      ["kernel column count", { hnf_state: [0, 8, 66, 0, 7, 8, 0, 73, 0] }],
      ["accepted relation total", { hnf_state: [0, 7, 66, 0, 7, 8, 0, 74, 0] }],
      ["factor-base count", { prep_base_state: [333, 333, 65, 48, 48, 66, sourceValues().prep_base_state[6]] }],
    ]) {
      const mutated = allocate(fn, backend, changed);
      assert.equal(
        fn[backend](...names.map(([parameter]) => mutated[parameter])),
        6n,
        name,
      );
      assert.deepEqual(values(mutated.bridge_state).map(BigInt).slice(0, 2), [6n, 0n]);
      for (const owner of [mutated.unit_transform, mutated.getfu_factor, mutated.compact_provenance, mutated.cleaned_arch])
        assert(values(owner).every((x) => BigInt(x) === 0n), name);
    }
  }

  // Ordinary CPython exercises the identical source body without serialized
  // unit or final-state fixtures.  Only the resident candidate artifact is a
  // temporary stand-in for the caller's live owners.
  const py = spawnSync("python3", ["-c", String.raw`
import collections.abc,dataclasses,decimal,hashlib,importlib,json,pathlib,sys,threading,typing
sys.path[:0]=[sys.argv[1],sys.argv[1]+'/src/lib']
d=json.load(sys.stdin);r=d['resident'];sizes=d['sizes']
m=importlib.import_module('bench.pari-class-group-port.live_h1_owner_bridge')
capacity=d['columnCapacity'];logical=d['logicalColumns']
def pad(a,n):return [int(x) for x in a]+[991]*(n-len(a))
source={'accepted_arch':pad(r['hnf_result_c'][:147],21*capacity),'relation_lattice':pad(r['accept_relations'][:14],2*capacity),'expected_regulator':r['accept_regulator'][:3],'prep_base_state':r['prep_base_state'][:7],'prep_state':r['prep_state'][:8],'hnf_state':r['hnf_state'][:9],'acceptance_state':r['accept_acceptance_state'][:3],'attempt_state':r['attempt_state'][:4],'class_number':r['class_number'][:1],'precision':192}
def allocate(source):
 v={}
 for name,kind in d['names']:
  if name in source:
   x=source[name];v[name]=[int(y) for y in x] if isinstance(x,list) else int(x)
  else:v[name]=[0.0 if kind=='Float64Buffer' else 0]*sizes[name]
 return v
v=allocate(source)
status=m.pari_live_h1_owner_bridge(*(v[name] for name,kind in d['names']))
tails=v['unit_transform'][2*logical:]+v['compact_provenance'][2*logical:]+v['cleaned_arch'][21*logical:]
rejected=0
for owner,index,value in [('hnf_state',1,8),('hnf_state',7,74),('prep_base_state',2,65)]:
 changed={k:(list(x) if isinstance(x,list) else x) for k,x in source.items()}
 changed[owner][index]=value
 w=allocate(changed)
 assert m.pari_live_h1_owner_bridge(*(w[name] for name,kind in d['names']))==6
 assert w['bridge_state'][:2]==[6,0]
 assert all(x==0 for name in ['unit_transform','getfu_factor','compact_provenance','cleaned_arch'] for x in w[name])
 rejected+=1
print(json.dumps({'status':status,'bridge':v['bridge_state'],'transform':v['unit_transform'][:2*logical],'factor':v['getfu_factor'],'provenance':v['compact_provenance'][:2*logical],'signs':v['signs'],'driver':v['driver_state'],'oversizedTailsUntouched':all(x==0 for x in tails),'dimensionMutationsRejected':rejected}))
` , root], {
    cwd: root,
    input: JSON.stringify({ resident, sizes, names, columnCapacity, logicalColumns }),
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(py.status, 0, py.stderr || String(py.error));
  const cp = JSON.parse(py.stdout);
  assert.equal(cp.status, 0);
  assert.deepEqual(cp.bridge.map(BigInt), expectedBridge);
  assert.deepEqual(cp.transform.map(BigInt), expectedProvenance);
  assert.deepEqual(cp.factor.map(BigInt), [1n, 0n, 0n, 1n]);
  assert.deepEqual(cp.provenance.map(BigInt), expectedProvenance);
  assert.deepEqual(cp.signs.map(BigInt), [0n, 0n, 1n, 1n, 1n, 1n]);
  assert.equal(cp.oversizedTailsUntouched, true);
  assert.equal(cp.dimensionMutationsRejected, 3);

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/live-h1-owner-bridge-v1",
    field: "x^3-20018*x+20034",
    residentInputs: ["accepted logs", "unit lattice", "regulator", "factor-base/HNF/acceptance state", "class candidate"],
    fixtureInputs: [],
    oracleInputs: [],
    compactUnitProvenance: expectedProvenance.map(String),
    getfuFactor: ["1", "0", "0", "1"],
    nativeState: expectedBridge.map(String),
    backends: ["cpython", "javascript", "gmp", "tagged"],
    exactUnitsExpanded: false,
    logicalCompactColumns: logicalColumns,
    compactColumnCapacity: columnCapacity,
    dimensionAuthority: "hnf_state[1], authenticated by hnf_state[7] == prep_base_state[2] + hnf_state[1]",
    ownerDimensionMutationsRejected: 12,
    publicComplete: false,
    cacheKey: built.cacheKey,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
