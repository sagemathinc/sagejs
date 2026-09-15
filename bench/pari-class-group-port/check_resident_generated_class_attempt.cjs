"use strict";

// Prepared-nf input only: compare one translated resident entry, not an RPC chain.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const encode = (x) => JSON.stringify(x, (_, v) => typeof v === "bigint" ? String(v) : v);
const hash = (x) => createHash("sha256").update(x).digest("hex");
const root = path.resolve(__dirname, "../..");
const entryName = "pari_resident_generated_class_attempt";
const sourcePath = path.join(__dirname, "resident_generated_class_attempt.py");

function python(script, input, timeout = 600000) {
  const result = spawnSync("python3", ["-c", script, root, path.join(root, "src/lib")], {
    input: encode(input), encoding: "utf8", timeout, maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout);
}

function checkCandidate(v, action, expected) {
  assert.equal(String(action), String(expected.action));
  assert.deepEqual(v.attempt_state.map(Number), expected.state.map(Number));
  assert.equal(String(v.class_number[0]), expected.classNumber);
  assert.deepEqual(v.class_invariants.slice(0, Number(v.attempt_state[2])).map(String), expected.invariants);
  assert.deepEqual(v.accept_regulator.slice(0, 3).map(String), expected.regulator);
  assert.equal(String(v.relation_state[0]), "73");
  assert.deepEqual(v.prep_base_state.slice(0, 6).map(String), ["333", "333", "66", "48", "48", "66"]);
  assert.equal(String(v.prep_sub_state[0]), "4");
}

async function main() {
  const paths = process.argv.slice(2, 5);
  assert.equal(paths.length, 3, "prepared, analytic and Kummer fixtures required");
  const [prepared, analytic, kummer] = paths.map(p => JSON.parse(fs.readFileSync(p)));
  const backendAt = process.argv.indexOf("--backend");
  const backend = backendAt < 0 ? "cpython" : process.argv[backendAt + 1];
  assert(["cpython", "javascript", "gmp", "tagged"].includes(backend));
  const source = fs.readFileSync(sourcePath, "utf8");
  const names = source.match(/def pari_resident_generated_class_attempt\(([\s\S]*?)\n\)/)[1]
    .trim().split("\n").map(x => x.trim().replace(/,$/, "").split(": "));
  const raw = prepared.inputs[0], nf = kummer.prepared, a = analytic.cases[0];
  assert.equal(prepared.expected[0].field, 0);
  assert.deepEqual(nf.polynomial.map(String), ["20034", "-20018", "0", "1"]);
  assert.equal(String(a.discriminant), "32075641032116");
  const nfNames = ["admission_matrix_m", "admission_matrix_p", "admission_matrix_e", "preparation_embedding", "preparation_rounded_embedding"];
  const runtimeNames = ["admission_primes", "admission_products"];
  const capacities = Object.fromEntries(Object.entries(raw).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
  for (const [k, v] of Object.entries(a)) if (Array.isArray(v)) capacities["analytic_" + k] = v.length;
  // Additional preparation capacities are filled from explicit bounds, never oracle outputs.
  const input = makeInput({ names, raw, nf, a, capacities, nfNames, runtimeNames });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-resident-generated-class-"));
  fs.writeFileSync(path.join(directory, "inputs.json"), encode({ names, input }));
  const expected = prepared.summary.cp[0];
  let output, action, artifacts = null;
  if (backend === "cpython") {
    const result = python(String.raw`
import sys,json,importlib,decimal,copy
sys.set_int_max_str_digits(100000)
sys.path[:0]=sys.argv[1:3]
d=json.load(sys.stdin)
v={}
for name,kind in d['names']:
 c=bool if kind=='bool' else float if kind in ('float','Float64Buffer') else int
 x=d['input'][name];v[name]=list(map(c,x)) if isinstance(x,list) else c(x)
f=importlib.import_module('bench.pari-class-group-port.resident_generated_class_attempt').pari_resident_generated_class_attempt
action=f(**v)
before=copy.deepcopy(v)
assert f(**v)==action and v==before,'terminal replay changed resident owners'
for case in ('state','partial','chain','result','field'):
 w=copy.deepcopy(v)
 w['attempt_state']=[0]*4;w['chain_state']=[0]*4;w['prep_state']=[0]*8
 if case=='state':w['attempt_state']=[]
 if case=='partial':w['attempt_state'][0]=1
 if case=='chain':w['chain_state'][0]=1
 if case=='result':w['class_number']=[]
 if case=='field':w['prep_index']=3
 before=copy.deepcopy(w)
 try:f(**w)
 except ValueError:pass
 else:raise AssertionError('missing initial guard: '+case)
 assert w==before,'early guard mutated owners: '+case
w=copy.deepcopy(v);w['attempt_state']=[0]*4;w['chain_state']=[0]*4
w['prep_state']=[0]*8
w['prep_degree_workspace']=[]
published=copy.deepcopy((w['class_number'],w['class_invariants']))
try:f(**w)
except ValueError:pass
else:raise AssertionError('missing late preparation failure')
assert w['attempt_state']==[1,-1,0,0]
assert (w['class_number'],w['class_invariants'])==published
before=copy.deepcopy(w)
try:f(**w)
except ValueError:pass
else:raise AssertionError('partial preparation reentry accepted')
assert w==before
for owner in ('accept_inverse_hr','analytic_state'):
 w=copy.deepcopy(v);w['attempt_state']=[0]*4;w['chain_state']=[0]*4;w['prep_state']=[0]*8
 w[owner]=[]
 try:f(**w)
 except ValueError:pass
 else:raise AssertionError('missing analytic handoff guard: '+owner)
 assert w['attempt_state']==[0,-1,0,0] and w['prep_state'][0]==6
 before=copy.deepcopy(w)
 try:f(**w)
 except ValueError:pass
 else:raise AssertionError('analytic handoff failure accepted reentry')
 assert w==before
for name,kind in d['names']:
 if kind not in ('bool','float','Float64Buffer'):
  x=v[name];v[name]=list(map(str,x)) if isinstance(x,list) else str(x)
print(json.dumps(dict(action=action,output=v)))
`, { names, input });
    ({ output, action } = result);
  } else {
    let f;
    if (backend === "javascript") {
      const { lowerSource } = require("../../tools/native-kernel/ir.cjs");
      const { createNativeImportResolver } = require("../../tools/native-kernel/native-imports.cjs");
      const { generateJavaScript } = require("../../tools/native-kernel/js-backend.cjs");
      const resolveNativeImport = createNativeImportResolver({ root, lowerSource, initialSourcePath: sourcePath });
      const ir = await lowerSource(source, sourcePath, { resolveNativeImport });
      const modulePath = path.join(directory, "kernel.cjs");
      fs.writeFileSync(modulePath, generateJavaScript(ir, { sourcePath }));
      f = require(modulePath)[entryName];
      artifacts = { moduleHash: hash(fs.readFileSync(modulePath)), modulePath };
    } else {
      const built = await require("../../tools/native-kernel/compiler.cjs").compileKernel({ sourcePath });
      f = require(built.modulePath)[entryName];
      assert(f.nativeAvailable);
      const core = fs.readFileSync(built.coreSourcePath);
      assert.doesNotMatch(core.toString(), /napi_call_function|PyObject_Call|v8::/);
      artifacts = { corePath: built.coreSourcePath, coreHash: hash(core), coreBytes: core.length,
        addonPath: built.addonPath, addonHash: hash(fs.readFileSync(built.addonPath)), modulePath: built.modulePath };
    }
    output = Object.fromEntries(names.map(([name, kind]) => {
      const convert = kind === "bool" ? Boolean : ["float", "Float64Buffer"].includes(kind) ? Number : BigInt;
      const value = input[name]; return [name, Array.isArray(value) ? value.map(convert) : convert(value)];
    }));
    const invoke = () => f[backend](...names.map(([name]) => output[name]));
    action = invoke();
    const before = hash(encode(output));
    assert.equal(invoke(), action);
    assert.equal(hash(encode(output)), before, "terminal replay changed resident owners");
    for (const kind of ["state", "partial", "chain", "result", "field"]) {
      const v = { ...output, attempt_state: [0n, 0n, 0n, 0n], chain_state: [0n, 0n, 0n, 0n], prep_state: Array(8).fill(0n) };
      if (kind === "state") v.attempt_state = [];
      if (kind === "partial") v.attempt_state[0] = 1n;
      if (kind === "chain") v.chain_state[0] = 1n;
      if (kind === "result") v.class_number = [];
      if (kind === "field") v.prep_index = 3n;
      const snapshot = hash(encode(v));
      assert.throws(() => f[backend](...names.map(([name]) => v[name])), /short|partial|fresh|frontier/);
      assert.equal(hash(encode(v)), snapshot, "early guard mutated owners: " + kind);
    }
    const failed = { ...structuredClone(output), attempt_state: [0n, 0n, 0n, 0n], chain_state: [0n, 0n, 0n, 0n], prep_state: Array(8).fill(0n), prep_degree_workspace: [] };
    const published = hash(encode([failed.class_number, failed.class_invariants]));
    assert.throws(() => f[backend](...names.map(([name]) => failed[name])), /frontier|short/);
    assert.deepEqual(failed.attempt_state, [1n, -1n, 0n, 0n]);
    assert.equal(hash(encode([failed.class_number, failed.class_invariants])), published);
    const partial = hash(encode(failed));
    assert.throws(() => f[backend](...names.map(([name]) => failed[name])), /partial/);
    assert.equal(hash(encode(failed)), partial);
    for (const owner of ["accept_inverse_hr", "analytic_state"]) {
      const v = { ...structuredClone(output), attempt_state: [0n, 0n, 0n, 0n],
        chain_state: [0n, 0n, 0n, 0n], prep_state: Array(8).fill(0n), [owner]: [] };
      assert.throws(() => f[backend](...names.map(([name]) => v[name])), /short/);
      assert.deepEqual(v.attempt_state, [0n, -1n, 0n, 0n]);
      assert.equal(v.prep_state[0], 6n);
      const before = hash(encode(v));
      assert.throws(() => f[backend](...names.map(([name]) => v[name])), /partial/);
      assert.equal(hash(encode(v)), before, "handoff-failure reentry mutated owners");
    }
  }
  checkCandidate(output, action, expected);
  for (const key of ["offsets", "counts", "degrees", "multiplicities"])
    assert.deepEqual(output["analytic_" + key].slice(0, a[key].length).map(String), a[key].map(String), "source pattern " + key);
  const records = kummer.rows.find(row => row.bound === 333).groups.flatMap(group => group.records);
  for (const [key, column] of [["relation_primes", 0], ["admission_group_e", 1], ["admission_group_f", 2], ["admission_group_inert", 3]])
    assert.deepEqual(output[key].slice(0, records.length).map(String), records.map(row => String(row[column])), key);
  assert.deepEqual(output.admission_group_tau.slice(0, records.length * 9).map(String), records.flatMap(row => row.slice(7).map(String)));
  const result = { backend, action: String(action), classNumber: String(output.class_number[0]),
    regulator: output.accept_regulator.slice(0, 3).map(String), relations: String(output.relation_state[0]),
    sourceHash: hash(source), checkerHash: hash(fs.readFileSync(__filename)),
    inputHashes: paths.map(p => hash(fs.readFileSync(p))), outputHash: hash(encode(output)),
    oneNativeCall: backend === "gmp" || backend === "tagged", qualifiedTiming: false, earlyGuardCases: 5,
    paddedCapacity: process.argv.includes("--padded"), lateFailureAndPartialReentry: true,
    analyticHandoffFailureCases: 2,
    preparedValueAllowlist: [...nfNames, ...runtimeNames, "n", "precision", "admission_real_count",
      "admission_factorlimit", "admission_prime_limit", "analytic_discriminant", "analytic_roots_of_unity",
      "prep_index", "prep_zkden", "prep_polynomial", "prep_invzk", "prep_zk", "prep_zk_degrees",
      "basis_table", "analytic_primes"], artifacts, directory };
  fs.writeFileSync(path.join(directory, "output.json"), encode(output));
  fs.writeFileSync(path.join(directory, "result.json"), encode(result));
  console.log(encode(result));
}

function makeInput(context) {
  const { names, raw, nf, a, capacities, nfNames, runtimeNames } = context;
  const n = 3, limit = 65537;
  const sieve = new Uint8Array(limit + 1).fill(1); sieve[0] = sieve[1] = 0;
  for (let p = 2; p * p <= limit; p++) if (sieve[p])
    for (let j = p * p; j <= limit; j += p) sieve[j] = 0;
  const runtimePrimes = Array.from(sieve.keys()).filter(p => sieve[p]);
  assert.deepEqual(raw.admission_primes.map(Number), runtimePrimes);
  const primes = runtimePrimes.filter(p => p <= 10007), P = primes.length, D = n * P, B = primes.at(-1) + 1;
  // K inherits the earlier fixture's workspace capacity, not a new sizing bound.
  // The padding control proves that active counts do not come from these lengths.
  const padding = process.argv.includes("--padded") ? 7 : 0;
  const K = capacities.relation + padding;
  for (const name of ["relation", "packet_ids", "packet_norms", "ramification", "admission_group_f",
    "admission_group_e", "admission_group_inert", "relation_primes", "search_ideals", "hnf_perm", "class_invariants"])
    capacities[name] += padding;
  for (const name of ["initial_primes", "initial_offsets", "initial_counts", "initial_complete"])
    capacities[name] += padding;
  const sizes = {
    prep_degree_workspace: 393, prep_factor_degrees: n, prep_factor_exponents: n,
    prep_group_degrees: n, prep_group_counts: n, prep_local_state: 3, prep_degree_state: 4,
    prep_full_offsets: P, prep_full_counts: P, prep_full_degrees: D,
    prep_base_norms: n + 1, prep_selected_primes: P, prep_prime_offsets: B,
    prep_prime_counts: B, prep_complete_groups: B, prep_selected_indices: D,
    prep_base_state: 7, prep_bad: K, prep_sub_order: K, prep_sub_scratch: K,
    prep_sub_stack: 3 * K + 3, prep_sub_chosen: K, prep_sub_rejected: K,
    prep_sub_state: 3, prep_state: 8, prep_base_configuration: 3,
    prep_base_constants_logs: P + 2, prep_base_sums: 2, prep_base_factor_logs: P + 1,
    prep_sub_configuration: 1,
  };
  // Explicit inherited scratch contracts; these values do not depend on oracle factors.
  const ks = { random_state: 66, factorwork: 16994, factor: n + 1, diagnostic: 3,
    minpoly_diagnostic: 1, polywork: 36, u: n, t: n, rational: 2 * n, primitive: n,
    column: n, resultant_work: n * n + n, resultant_trace: 25, u_output: n,
    tau_output: n * n, descriptor_state: 12, unsorted: n * (4 + n + n * n),
    generators: n * n, residue_degrees: n, order: n, sort_diagnostic: 2,
    decomposition_output: n * (4 + n + n * n), decomposition_state: 3,
    catalog_primes: D, catalog_e: D, catalog_f: D, catalog_inert: D,
    catalog_generators: D * n, catalog_tau: D * n * n, requested_counts: P, state: 4 };
  for (const [name, size] of Object.entries(ks)) sizes["prep_kummer_" + name] = size;
  Object.assign(capacities, sizes, { analytic_offsets: P, analytic_counts: P,
    analytic_degrees: D, analytic_multiplicities: D, analytic_state: 2 });
  const explicit = { n, precision: 192, admission_real_count: 3,
    admission_factorlimit: 1048576, admission_prime_limit: 65537,
    analytic_discriminant: a.discriminant, analytic_roots_of_unity: 2,
    prep_index: nf.index, prep_zkden: nf.zkden,
    prep_polynomial: nf.polynomial, prep_invzk: nf.invzk, prep_zk: nf.zk,
    prep_zk_degrees: nf.zkDegrees, basis_table: nf.table, analytic_primes: primes };
  for (const name of [...nfNames, ...runtimeNames]) explicit[name] = raw[name];
  const input = Object.fromEntries(names.map(([name, kind]) => {
    if (Object.hasOwn(explicit, name)) return [name, structuredClone(explicit[name])];
    assert(kind.endsWith("Buffer"), "unclassified scalar input: " + name);
    assert(Object.hasOwn(capacities, name), "unclassified capacity: " + name);
    return [name, Array(capacities[name]).fill(0)];
  }));
  input.accept_inverse_hr = [-991, -992, -993];
  input.analytic_log_discriminant = [-999];
  return input;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
