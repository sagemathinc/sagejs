#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "unified_full_h1_root.py");
const residentPath = path.resolve(process.argv[2] ||
  "/tmp/sagejs-resident-generated-class-3qtnS5/output.json");
const resident = JSON.parse(fs.readFileSync(residentPath, "utf8"));
const compact = [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, -1];

const sizes = Object.freeze({
  polynomial: 4, basis: 9, multiplication_tensor: 27, generators: 219,
  cleanup_transform: 5329, active_hnf_transform: 225,
  compact_provenance: 14, expected_regulator: 3,
  kernel_relation_map: 511, retained_relation_map: 146,
  kernel_factors: 21, exact_units_integral: 6, exact_units_power: 6,
  exact_norms: 2, root_m: 3, root_p: 3, root_e: 3,
  embedding_m: 9, embedding_p: 9, embedding_e: 9, embedding_state: 4,
  atom_logs: 1533, transformed_logs: 42, clean_scratch: 42,
  clean_result: 42, rebuilt_logs: 42, phase_scratch: 6,
  rebuilt_phases: 6, log_cache: 3, pi_cache: 3,
  transcendental_a: 512, transcendental_b: 512, transcendental_p: 512,
  transcendental_q: 512, transcendental_stack: 128, clean_state: 4,
  precision_state: 5, determinant_values: 12, determinant_work: 12,
  determinant_output: 3, determinant_pivots: 1, determinant_state: 5,
  authority_state: 8,
});
const int64 = new Set([
  "embedding_state", "clean_state", "precision_state",
  "determinant_pivots", "determinant_state", "authority_state",
]);
const inputs = Object.freeze({
  polynomial: resident.prep_polynomial.slice(0, 4),
  basis: resident.prep_zk.slice(0, 9),
  multiplication_tensor: resident.basis_table.slice(0, 27),
  generators: resident.generators.slice(0, 219),
  cleanup_transform: resident.hnf_transform.slice(0, 5329),
  active_hnf_transform: resident.hnf_hnf_transform.slice(0, 225),
  compact_provenance: compact,
  expected_regulator: resident.accept_regulator.slice(0, 3),
});

function values(owner) {
  return Array.isArray(owner) ? owner
    : owner.toArray ? owner.toArray() : Array.from(owner);
}

function allocate(fn, backend, acceptedRegulatorDelta = 0n) {
  const owners = {};
  for (const [name, length] of Object.entries(sizes)) {
    const data = Array.from(inputs[name] || Array(length).fill(0), BigInt);
    if (name === "expected_regulator") data[0] += acceptedRegulatorDelta;
    if (backend === "javascript") owners[name] = data;
    else if (int64.has(name)) owners[name] = fn.createInt64Buffer(data);
    else owners[name] = fn.createIntegerBuffer(length, 128, data);
  }
  return owners;
}

function snapshot(owners) {
  return {
    authority: values(owners.authority_state).map(BigInt),
    embedding: values(owners.embedding_state).map(BigInt),
    precision: values(owners.precision_state).map(BigInt),
    determinant: values(owners.determinant_output).map(BigInt),
    determinantState: values(owners.determinant_state).map(BigInt),
    norms: values(owners.exact_norms).map(BigInt),
    integralUnits: values(owners.exact_units_integral).map(BigInt),
    units: values(owners.exact_units_power).map(BigInt),
    retained: values(owners.retained_relation_map).map(BigInt),
    phases: values(owners.rebuilt_phases).map(BigInt),
  };
}

function bitLength(value) {
  const magnitude = value < 0n ? -value : value;
  return magnitude === 0n ? 0 : magnitude.toString(2).length;
}

async function main() {
  const built = await compileKernel({ sourcePath });
  const fn = require(built.modulePath).pari_unified_full_h1_suffix;
  assert(fn.nativeAvailable);
  const names = built.ir.functions.find(entry =>
    entry.name === "pari_unified_full_h1_suffix").params.map(param => param.name);
  assert.deepEqual([...names].sort(), Object.keys(sizes).sort());
  let reference;
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const owners = allocate(fn, backend);
    const status = fn[backend](...names.map(name => owners[name]));
    assert.equal(status, 0n, backend + ": " + JSON.stringify({
      authority: values(owners.authority_state).map(String),
      determinant: values(owners.determinant_output).map(String),
      expected: inputs.expected_regulator.map(String),
    }));
    const got = snapshot(owners);
    assert.deepEqual(got.authority, [0n, 7n, 2n, 1n, 1n, 1n, 4n, 0n]);
    assert.deepEqual(got.embedding, [3n, 2176n, 2496n, 1n]);
    assert.deepEqual(got.precision, [0n, 73n, 2n, 2n, 2176n]);
    assert.deepEqual(got.norms, [-1n, -1n]);
    assert.deepEqual(got.determinant.slice(1),
      inputs.expected_regulator.slice(1).map(BigInt));
    assert.equal(BigInt(inputs.expected_regulator[0]) - got.determinant[0], 4n);
    assert.deepEqual(got.determinantState, [2n, 0n, 0n, 0n, 0n]);
    assert.deepEqual([
      Math.max(...got.integralUnits.slice(0, 3).map(bitLength)),
      Math.max(...got.integralUnits.slice(3, 6).map(bitLength)),
    ], [1245, 2115]);
    assert.deepEqual([
      Math.max(...got.units.slice(0, 3).map(bitLength)),
      Math.max(...got.units.slice(3, 6).map(bitLength)),
    ], [1239, 2117]);
    assert.deepEqual([
      got.retained.slice(0, 73).filter(value => value !== 0n).length,
      got.retained.slice(73).filter(value => value !== 0n).length,
    ], [49, 46]);
    if (reference === undefined) reference = got;
    else assert.deepEqual(got, reference, backend);
  }

  const fiveUlpDiagnostic = allocate(fn, "gmp", 1n);
  assert.equal(fn.gmp(...names.map(name => fiveUlpDiagnostic[name])), 0n);
  assert.deepEqual(values(fiveUlpDiagnostic.authority_state).map(BigInt),
    [0n, 7n, 2n, 1n, 1n, 1n, 5n, 0n]);

  const py = spawnSync("python3", ["-c", String.raw`
import importlib,json,sys
sys.set_int_max_str_digits(100000)
sys.path[:0]=[sys.argv[1],sys.argv[1]+'/src/lib']
d=json.load(sys.stdin);m=importlib.import_module('bench.pari-class-group-port.unified_full_h1_root')
v={name:[int(x) for x in d['inputs'].get(name,[0]*length)] for name,length in d['sizes'].items()}
names=d['names'];status=m.pari_unified_full_h1_suffix(*(v[name] for name in names))
S=lambda x:[str(y) for y in x]
print(json.dumps({'status':status,'authority':S(v['authority_state']),'integralUnits':S(v['exact_units_integral']),'units':S(v['exact_units_power']),'norms':S(v['exact_norms']),'determinant':S(v['determinant_output']),'precision':S(v['precision_state'])}))
`, root], {
    cwd: root,
    input: JSON.stringify({ sizes, inputs, names }),
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(py.status, 0, py.stderr || String(py.error));
  const ordinary = JSON.parse(py.stdout);
  assert.equal(ordinary.status, 0);
  assert.deepEqual(ordinary.authority.map(BigInt), reference.authority);
  assert.deepEqual(ordinary.units.map(BigInt), reference.units);
  assert.deepEqual(ordinary.integralUnits.map(BigInt), reference.integralUnits);
  assert.deepEqual(ordinary.norms.map(BigInt), reference.norms);
  assert.deepEqual(ordinary.determinant.map(BigInt), reference.determinant);
  assert.deepEqual(ordinary.precision.map(BigInt), reference.precision);

  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.doesNotMatch(core, /\b(?:napi_call_function|PyObject_Call|JS_Call|v8::)/);
  const dependencies = built.ir.nativeSourceDependencies.map(entry => entry.path);
  for (const basename of ["cubic_embedding_rebuild.py",
    "cubic_precision_rebuild.py", "regulator_determinant.py"]) {
    assert(dependencies.some(filename => filename.endsWith("/" + basename)), basename);
  }
  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/frozen-full-h1-suffix-control-v1",
    field: "x^3-20018*x+20034",
    nativeFunctions: built.ir.functions.length,
    nativeDependencies: dependencies.length,
    backends: ["cpython", "javascript", "gmp", "tagged"],
    authorityState: reference.authority.map(String),
    exactIntegralUnitBits: [1245, 2115],
    exactPowerUnitBits: [1239, 2117],
    exactUnitNorms: reference.norms.map(String),
    retainedRelationNonzeros: [49, 46],
    fiveUlpMutationRecordedDiagnosticOnly: true,
    p2176State: reference.precision.map(String),
    regulatorTriplet: reference.determinant.map(String),
    terminalAuthorityComplete: false,
    hostJavascriptExactArithmeticInsideNativeCall: false,
    cacheKey: built.cacheKey,
  }));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
