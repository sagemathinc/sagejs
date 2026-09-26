"use strict";

// Exact field-3 replay for the first resident nonempty-W retry corridor.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const signature = (source) =>
  fs
    .readFileSync(source, "utf8")
    .match(/def pari_prepared_class_group_resumable\(([\s\S]*?)\n\)/)[1]
    .trim()
    .split("\n")
    .map((line) => line.trim().replace(/,$/, "").split(": "));

const view = (owner) =>
  Array.isArray(owner)
    ? owner
    : owner.toArray
      ? owner.toArray()
      : Array.from(owner);

(async () => {
  const initialPath = path.resolve(process.argv[2]);
  const analyticPath = path.resolve(process.argv[3]);
  const tracePath = path.resolve(process.argv[4]);
  assert(fs.existsSync(initialPath), "missing field-3 initial fixture");
  assert(fs.existsSync(analyticPath), "missing analytic inverse-hR fixture");
  assert(fs.existsSync(tracePath), "missing PARI field-3 trace");

  const initialFixture = JSON.parse(fs.readFileSync(initialPath));
  const analyticFixture = JSON.parse(fs.readFileSync(analyticPath));
  const events = JSON.parse(fs.readFileSync(tracePath));
  const initial = initialFixture.expected.find((entry) => entry.field === 3);
  const packet = initialFixture.nativeInputs.find(
    (entry) => entry.field === 3 && entry.backend === "gmp",
  );
  const inverse = analyticFixture.nativeOutputs.find(
    (entry) => entry.field === 3 && entry.backend === "gmp",
  );
  assert(initial && packet && inverse, "fixtures must contain field 3 GMP data");

  const sourcePath = path.join(__dirname, "prepared_class_group_resumable.py");
  const names = signature(sourcePath);
  const raw = structuredClone(packet.input);
  const rows = initial.KC;
  const degree = initial.degree;
  const places = (degree + initial.real) / 2;
  const scratchCapacity = 8192;
  for (const [name, kind] of names) {
    if (
      name in raw &&
      (!kind.endsWith("Buffer") || raw[name].length !== 0)
    )
      continue;
    if (kind.endsWith("Buffer"))
      raw[name] = Array(scratchCapacity).fill(
        kind === "Float64Buffer" ? 0 : "0",
      );
    else raw[name] = kind === "float" ? 0 : "0";
  }

  // The initialized packet deliberately stops at ideal HNF/norm owners.  A
  // resumed outer pass constructs prime ideals, so publish the already traced
  // prepared multiplication table and exact prime descriptors too.
  const ideals = initial.groups.flatMap((group) =>
    group.ideals.map((ideal) => ({ p: group.p, ...ideal })),
  );
  raw.basis_table = initial.basisTable;
  raw.packet_primes = ideals.map((ideal) => String(ideal.p));
  raw.packet_inert = ideals.map((ideal) => String(ideal.inert));
  raw.packet_generators = ideals.flatMap(
    (ideal) => initial.descriptorCatalog[ideal.index].generator,
  );
  while (raw.power_metadata.length < 5) raw.power_metadata.push("0");
  Object.assign(raw, {
    accept_inverse_hr: inverse.inverseHR,
    pass_limit: "6",
    automorphism_count: "1",
    relation_prime_count: String(initial.KCZ),
    checking_prime_count: String(initial.KCZ2),
    driver_state: Array(8).fill("0"),
    driver_trace: Array(30).fill("0"),
    outer_ru: String(places),
    outer_state: Array(19).fill("0"),
    outer_minidx: Array.from({ length: rows }, (_, i) => String(i + 1)),
    outer_present: Array(rows).fill("0"),
    outer_live: Array(rows).fill("0"),
    outer_perm: initial.initialPerm.map(String),
    outer_multiplier: Array(rows).fill("0"),
    class_invariants: Array(rows).fill("0"),
    class_number: ["0"],
  });

  const appends = events.filter((entry) => entry.event === "hnfadd_input");
  const finalHnf = events.filter((entry) => entry.event === "hnfadd_output").at(-1);
  const result = events.find((entry) => entry.event === "result");
  assert.equal(appends.length, 4);
  assert(finalHnf && result);
  const wanted = {
    records: [
      ...initial.records.map(String),
      ...appends.flatMap((entry) => entry.newRelations.map(String)),
    ],
    generators: [
      ...initial.generators.map(String),
      ...appends.flatMap((entry) => entry.newGenerators.map(String)),
    ],
    logs: [
      ...initial.logs.map(String),
      ...appends.flatMap((entry) => entry.newLogs.map(String)),
    ],
    H: finalHnf.H.map(String),
    D: finalHnf.D.map(String),
    B: finalHnf.B.map(String),
    C: finalHnf.C.map(String),
    invariants: result.invariants.map(String),
    classNumber: String(result.classNumber),
    regulator: [
      String(result.regulator.mantissa),
      String(result.regulator.precision),
      String(result.regulator.exponent),
    ],
  };
  const expectedTrace = [
    293, 3, 0, 0, 289,
    293, 3, 1, 1, 289,
    295, 5, 2, 0, 289,
    299, 5, 3, 1, 289,
    300, 5, 4, 2, 289,
    303, 0, 5, 3, 289,
  ];

  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "sagejs-field3-resident-retry-"),
  );
  const inputPath = path.join(directory, "input.json");
  const cpPath = path.join(directory, "cpython.json");
  fs.writeFileSync(inputPath, JSON.stringify({ names, raw, wanted, expectedTrace }));
  const python = String.raw`
import copy, decimal, importlib, json, sys
sys.set_int_max_str_digits(100000)
sys.path[:0] = sys.argv[2:4]
d = json.load(open(sys.argv[1]))
driver = importlib.import_module('bench.pari-class-group-port.prepared_class_group_resumable')
f = driver.pari_prepared_class_group_resumable
def fresh():
    return {name: ([float(x) if kind == 'Float64Buffer' else int(x) for x in d['raw'][name]] if kind.endswith('Buffer') else float(d['raw'][name]) if kind == 'float' else bool(d['raw'][name]) if kind == 'bool' else int(d['raw'][name])) for name, kind in d['names']}
v = fresh()
status = f(**v)
assert status == 0, (status, v['driver_state'], v['accept_multiple_state'][:4])
assert v['driver_state'] == [4, 0, 6, 303, 1, 2, 25137, 303]
assert v['driver_trace'][:30] == d['expectedTrace']
assert v['relation_state'][0] == v['relation_state'][4] == 303
assert list(map(str, v['relation_records'][:len(d['wanted']['records'])])) == d['wanted']['records']
assert list(map(str, v['generators'][:len(d['wanted']['generators'])])) == d['wanted']['generators']
assert list(map(str, v['log_embeddings'][:len(d['wanted']['logs'])])) == d['wanted']['logs']
for name in ['H', 'D', 'B', 'C']:
    owner = {'H':'hnf_result_h','D':'hnf_result_dep','B':'hnf_result_b','C':'hnf_result_c'}[name]
    assert list(map(str, v[owner][:len(d['wanted'][name])])) == d['wanted'][name], name
assert str(v['class_number'][0]) == d['wanted']['classNumber']
assert list(map(str, v['class_invariants'][:len(d['wanted']['invariants'])])) == d['wanted']['invariants']
assert list(map(str, v['accept_regulator'][:3])) == d['wanted']['regulator']
before = copy.deepcopy(v)
assert f(**v) == 0 and v == before
capacities = {}
for name, kind in d['names']:
    if kind == 'IntegerBuffer':
        bits = max((abs(x).bit_length() for x in v[name]), default=0)
        capacities[name] = max(4, (bits + 63) // 64 + 2)
out = {'status':status,'driverState':v['driver_state'],'trace':v['driver_trace'][:30],
       'relationState':list(map(str,v['relation_state'])),'hnfState':v['hnf_state'][:9],
       'classNumber':str(v['class_number'][0]),'invariants':list(map(str,v['class_invariants'][:2])),
       'regulator':list(map(str,v['accept_regulator'][:3])),'capacities':capacities}
json.dump(out, open(sys.argv[4], 'w'))
`;
  const cp = spawnSync(
    "python3",
    [
      "-c",
      python,
      inputPath,
      path.resolve(__dirname, "../.."),
      path.resolve(__dirname, "../../src/lib"),
      cpPath,
    ],
    { encoding: "utf8", timeout: 120000, maxBuffer: 32 * 1024 * 1024 },
  );
  assert.equal(cp.status, 0, cp.stderr || String(cp.error));
  const expected = JSON.parse(fs.readFileSync(cpPath));
  if (process.argv.includes("--source-only")) {
    console.log(JSON.stringify({ field: 3, cpython: expected, directory }));
    return;
  }

  const built = await compileKernel({ sourcePath });
  const module = require(built.modulePath);
  const f = module.pari_prepared_class_group_resumable;
  assert(f.nativeAvailable);
  assert.doesNotMatch(
    fs.readFileSync(built.coreSourcePath, "utf8"),
    /napi_call_function|PyObject_Call|v8::/,
  );
  let ownerBytes = 0;
  const values = Object.fromEntries(
    names.map(([name, kind]) => {
      let value;
      if (kind === "IntegerBuffer") {
        const words = expected.capacities[name];
        value = f.createIntegerBuffer(
          raw[name].length,
          words,
          raw[name].map(BigInt),
        );
        ownerBytes += raw[name].length * (4 + 8 * words);
      } else if (kind === "Int64Buffer") {
        value = f.createInt64Buffer(raw[name].map(BigInt));
        ownerBytes += raw[name].length * 8;
      } else if (kind === "Float64Buffer") {
        value = f.createFloat64Buffer(raw[name].map(Number));
        ownerBytes += raw[name].length * 8;
      } else if (kind === "float") value = Number(raw[name]);
      else if (kind === "bool") value = Boolean(raw[name]);
      else value = BigInt(raw[name]);
      return [name, value];
    }),
  );
  assert(ownerBytes < 3 * 1024 ** 3, "packed owners exceed 3 GiB");
  const invoke = () => f.gmp(...names.map(([name]) => values[name]));
  const status = invoke();
  assert.equal(status, 0n);
  const actual = {
    status: Number(status),
    driverState: view(values.driver_state).map(Number),
    trace: view(values.driver_trace).slice(0, 30).map(Number),
    relationState: view(values.relation_state).map(String),
    hnfState: view(values.hnf_state).slice(0, 9).map(Number),
    classNumber: String(view(values.class_number)[0]),
    invariants: view(values.class_invariants).slice(0, 2).map(String),
    regulator: view(values.accept_regulator).slice(0, 3).map(String),
  };
  assert.deepEqual(actual, Object.fromEntries(Object.entries(expected).filter(([key]) => key !== "capacities")));
  for (const [name, want] of [
    ["relation_records", wanted.records],
    ["generators", wanted.generators],
    ["log_embeddings", wanted.logs],
    ["hnf_result_h", wanted.H],
    ["hnf_result_dep", wanted.D],
    ["hnf_result_b", wanted.B],
    ["hnf_result_c", wanted.C],
  ]) assert.deepEqual(view(values[name]).slice(0, want.length).map(String), want, name);
  const terminal = JSON.stringify(actual);
  assert.equal(invoke(), 0n);
  assert.equal(JSON.stringify({
    ...actual,
    driverState: view(values.driver_state).map(Number),
    trace: view(values.driver_trace).slice(0, 30).map(Number),
  }), terminal);
  const summary = {
    field: 3,
    cpython: expected,
    native: actual,
    exactSourceReplay: true,
    passes: 6,
    emptyAppendPass: 1,
    nonemptyAppends: 4,
    ownerBytes,
    coreBytes: fs.statSync(built.coreSourcePath).size,
    boundary: "prepared nf/factor base/inverse hR; resident initial collect, HNF, four retry appends, acceptance and class invariants; units remain outside",
    directory,
  };
  fs.writeFileSync(path.join(directory, "fixtures.json"), JSON.stringify(summary));
  console.log(JSON.stringify(summary));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
