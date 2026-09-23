#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const { authenticatePreparedNf } = require("./prepared_nf_authentication.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "unified_full_h1_root.py");
const residentPath = path.resolve(process.argv[2] ||
  "/tmp/sagejs-resident-generated-class-3qtnS5/output.json");
const resident = JSON.parse(fs.readFileSync(residentPath, "utf8"));
const preparedNfAuthority = authenticatePreparedNf(resident);
assert.deepEqual(preparedNfAuthority.polynomial, ["20034", "-20018", "0", "1"]);
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

const retryInt64 = new Set([
  "embedding_state", "clean_state", "precision_state", "getfu_clean_phases",
  "getfu_transformed_phases", "staged_getfu_phases", "getfu_state",
  "getfu_pivots", "determinant_pivots", "determinant_state", "retry_state",
  "published_phases", "terminal_state",
]);
const retrySizes = Object.freeze({
  resident_root_m: 3, resident_root_p: 3, resident_root_e: 3,
  multiplication_tensor: 27, generators: 219, cleanup_transform: 1200,
  active_hnf_transform: 162, compact_provenance: 14,
  retry_unit_transform: 14, retry_factor_transform: 4,
  staged_kernel_relations: 720, staged_retained_relations: 160,
  staged_retry_relations: 160,
  staged_kernel_factors: 27, staged_relation_units: 6,
  root_m: 6, root_p: 6, root_e: 6, embedding_m: 9, embedding_p: 9,
  embedding_e: 9, embedding_packed: 27, embedding_state: 4,
  atom_logs: 1533, transformed_logs: 42, clean_scratch: 42,
  clean_result: 42, rebuilt_logs: 42, phase_scratch: 6, rebuilt_phases: 6,
  log_cache: 3, pi_cache: 3, transcendental_a: 512,
  transcendental_b: 512, transcendental_p: 512, transcendental_q: 512,
  transcendental_stack: 128, clean_state: 4, precision_state: 5,
  getfu_clean_logs: 18, getfu_clean_phases: 6, getfu_factor: 4,
  getfu_matep: 18, getfu_transformed_arch: 18, getfu_transformed_clean: 18,
  getfu_transformed_phases: 6, getfu_exponentials: 18,
  getfu_solve_work: 27, getfu_solve_rhs: 18, getfu_solved: 18,
  getfu_rounded: 6, getfu_multiplication: 9, getfu_inverse: 3,
  getfu_candidate_units: 6, getfu_normalized_factor: 4,
  staged_getfu_units: 6, staged_getfu_logs: 18, staged_getfu_phases: 6,
  staged_getfu_factor: 4, getfu_state: 8, getfu_pivots: 3,
  getfu_exp_cache: 512, getfu_exp_a: 512, getfu_exp_b: 512,
  getfu_exp_p: 512, getfu_exp_q: 512, getfu_exp_stack: 128,
  determinant_values: 12, determinant_work: 12, staged_regulator: 3,
  determinant_pivots: 1, determinant_state: 5, retry_state: 6,
  published_retained_relations: 160, published_units: 6,
  published_norms: 2, published_logs: 18, published_phases: 6,
  published_regulator: 3, terminal_state: 16,
});

function retryArguments(fn, precisionCap, relationCount = 73, activeColumns = 15) {
  const relationCapacity = 80;
  const activeCapacity = 18;
  const factorCount = 7;
  const factorCapacity = 9;
  const roots = [3, 12, 21].map(offset =>
    resident.preparation_embedding.slice(offset, offset + 3));
  const cleanup = Array(activeColumns * relationCapacity).fill(0n);
  for (let column = 0; column < activeColumns; column++)
    for (let relation = 0; relation < relationCount; relation++)
      cleanup[relationCapacity * column + relation] =
        BigInt(resident.hnf_transform[73 * column + relation]);
  const active = Array(factorCapacity * activeCapacity).fill(0n);
  for (let factor = 0; factor < factorCount; factor++)
    for (let column = 0; column < activeColumns; column++)
      active[activeCapacity * factor + column] =
        BigInt(resident.hnf_hnf_transform[15 * factor + column]);
  const supplied = {
    resident_root_m: roots.map(row => row[0]),
    resident_root_p: roots.map(row => row[1]),
    resident_root_e: roots.map(row => row[2]),
    multiplication_tensor: resident.basis_table.slice(0, 27),
    generators: resident.generators.slice(0, 3 * relationCount),
    cleanup_transform: cleanup,
    active_hnf_transform: active,
    compact_provenance: compact,
    retry_unit_transform: compact,
    retry_factor_transform: [1, 0, 0, 1],
  };
  const scalars = {
    degree: 3n, relation_count: BigInt(relationCount),
    relation_capacity: BigInt(relationCapacity),
    active_columns: BigInt(activeColumns), active_capacity: BigInt(activeCapacity),
    compact_factor_count: BigInt(factorCount), factor_capacity: BigInt(factorCapacity),
    unit_rank: 2n, initial_precision: 192n,
    precision_resource_cap: BigInt(precisionCap),
    retry_flagged: 0n,
  };
  const publicNames = new Set([
    "published_retained_relations", "published_units", "published_norms",
    "published_logs", "published_phases", "published_regulator",
  ]);
  const owners = {};
  for (const [name, length] of Object.entries(retrySizes)) {
    const fill = publicNames.has(name) ? 777n : 0n;
    const data = Array.from(supplied[name] || Array(length).fill(fill), BigInt);
    owners[name] = retryInt64.has(name)
      ? fn.createInt64Buffer(data)
      : fn.createIntegerBuffer(data.length, 128, data);
  }
  return { owners, scalars, publicNames };
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
  const retry = require(built.modulePath).pari_live_retrying_h1_suffix;
  const retryNames = built.ir.functions.find(entry =>
    entry.name === "pari_live_retrying_h1_suffix").params.map(param => param.name);
  const capped = retryArguments(retry, 192);
  assert.equal(retry.gmp(...retryNames.map(name =>
    Object.hasOwn(capped.scalars, name) ? capped.scalars[name] : capped.owners[name])), 1n);
  assert.deepEqual(values(capped.owners.terminal_state).map(BigInt).slice(0, 5),
    [1n, 1n, 192n, 3n, 3n]);
  assert.equal(values(capped.owners.terminal_state)[14], 0n);
  for (const name of capped.publicNames)
    assert(values(capped.owners[name]).every(value => BigInt(value) === 777n), name);
  const belowSuccess = retryArguments(retry, 2048);
  assert.equal(retry.gmp(...retryNames.map(name =>
    Object.hasOwn(belowSuccess.scalars, name)
      ? belowSuccess.scalars[name] : belowSuccess.owners[name])), 1n);
  assert.deepEqual(values(belowSuccess.owners.terminal_state).map(BigInt)
    .slice(0, 5), [1n, 4n, 1536n, 3n, 3n]);
  assert.equal(values(belowSuccess.owners.terminal_state)[14], 0n);
  for (const name of belowSuccess.publicNames)
    assert(values(belowSuccess.owners[name]).every(value => BigInt(value) === 777n), name);
  const completed = retryArguments(retry, 4096);
  const completedStatus = retry.gmp(...retryNames.map(name =>
    Object.hasOwn(completed.scalars, name)
      ? completed.scalars[name] : completed.owners[name]));
  assert.equal(completedStatus, 0n,
    JSON.stringify(values(completed.owners.terminal_state).map(String)));
  const completedState = values(completed.owners.terminal_state).map(BigInt);
  assert.deepEqual(completedState.slice(0, 5), [0n, 5n, 2304n, 0n, 3n]);
  assert.equal(completedState[14], 1n);
  assert.deepEqual(values(completed.owners.published_norms).map(BigInt), [-1n, -1n]);
  assert.deepEqual(values(completed.owners.published_phases).map(BigInt),
    [0n, 0n, 1n, 1n, 1n, 1n]);
  assert(values(completed.owners.published_units).some(value => BigInt(value) !== 0n));
  assert(values(completed.owners.published_logs).some(value => BigInt(value) !== 0n));
  assert(values(completed.owners.published_regulator)
    .some(value => BigInt(value) !== 0n));
  const shortDimension = retryArguments(retry, 192, 73, 14);
  assert.throws(() => retry.gmp(...retryNames.map(name =>
    Object.hasOwn(shortDimension.scalars, name)
      ? shortDimension.scalars[name] : shortDimension.owners[name])),
  /unit|relation/);
  for (const name of shortDimension.publicNames)
    assert(values(shortDimension.owners[name]).every(value => BigInt(value) === 777n), name);
  const changedExactOwner = retryArguments(retry, 4096);
  const changedGenerators = values(changedExactOwner.owners.generators).map(BigInt);
  changedGenerators[0] += 1n;
  changedExactOwner.owners.generators = retry.createIntegerBuffer(
    changedGenerators.length, 128, changedGenerators);
  assert.throws(() => retry.gmp(...retryNames.map(name =>
    Object.hasOwn(changedExactOwner.scalars, name)
      ? changedExactOwner.scalars[name] : changedExactOwner.owners[name])),
  /kernel relation|nonintegral principal relation/);
  for (const name of changedExactOwner.publicNames)
    assert(values(changedExactOwner.owners[name])
      .every(value => BigInt(value) === 777n), name);
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
    preparedNfAuthoritySha256: preparedNfAuthority.sha256,
    terminalAuthorityComplete: false,
    liveRetryCapState: values(capped.owners.terminal_state).map(String),
    liveRetryBelowSuccessState: values(belowSuccess.owners.terminal_state).map(String),
    liveRetrySuccessState: completedState.map(String),
    liveRetrySuccessNorms: values(completed.owners.published_norms).map(String),
    liveRetryOutputsTransactionalAtCap: true,
    liveLogicalDimensionMutationRejected: true,
    liveExactOwnerMutationRejected: true,
    hostJavascriptExactArithmeticInsideNativeCall: false,
    cacheKey: built.cacheKey,
  }));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
