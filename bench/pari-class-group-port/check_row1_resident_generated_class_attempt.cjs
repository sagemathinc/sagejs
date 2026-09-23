#!/usr/bin/env node
"use strict";

// A genuine prepared-row-1 transaction through catalog generation, relation
// collection, HNF, analytic acceptance, and the initial class candidate.  The
// live Python process receives authenticated prepared data and fresh owner
// storage only; retained W0 is consulted afterwards as a cold oracle.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const authentication = require("./prepared_nf_authentication.cjs");
const ownerManifest = require("./resident_candidate_owner_manifest.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "resident_generated_class_attempt.py");

function integer(value, label) {
  assert(value && value.kind === "integer", `${label} is not an integer`);
  return value.value;
}

function vector(value, label) {
  assert(value && Array.isArray(value.values), `${label} is not a vector`);
  return value.values;
}

function retainedPrimeThree(bundle) {
  const factor = bundle.events.find(event => event.event === "factor_base");
  const entry = vector(factor.LP, "factor_base.LP").find(value =>
    integer(vector(value, "descriptor")[0], "descriptor prime") === "3");
  assert(entry, "retained factor base has no prime above 3");
  const values = vector(entry, "prime-three descriptor");
  const tauColumns = vector(values[4], "tau").map((column, j) =>
    vector(column, `tau[${j}]`).map((x, i) => integer(x, `tau[${j}][${i}]`)));
  return {
    p: integer(values[0], "p"),
    u: vector(values[1], "u").map((x, i) => integer(x, `u[${i}]`)),
    e: integer(values[2], "e"),
    f: integer(values[3], "f"),
    // Resident catalog owners are row-major; retained PARI matrices are
    // serialized as columns.
    tau: tauColumns.flatMap((_, row) => tauColumns.map(column => column[row])),
  };
}

function makeFreshInput(prepared) {
  const source = fs.readFileSync(SOURCE, "utf8");
  const names = source.match(/def pari_resident_generated_class_attempt\(([\s\S]*?)\n\)/)[1]
    .trim().split("\n").map(line => line.trim().replace(/,$/, "").split(": "));
  const capacities = {};
  for (const group of ownerManifest.owner_groups) {
    const length = ownerManifest.length_rules[group.length_rule].length;
    for (const name of group.owners)
      if (group.kind.endsWith("Buffer")) capacities[name] = length;
  }
  const explicit = Object.fromEntries(Object.entries(prepared).map(([key, value]) =>
    [key, structuredClone(value)]));
  const input = Object.fromEntries(names.map(([name, kind]) => {
    if (Object.hasOwn(explicit, name)) return [name, explicit[name]];
    assert(kind.endsWith("Buffer"), `unclassified scalar input: ${name}`);
    assert(Object.hasOwn(capacities, name), `unclassified owner capacity: ${name}`);
    return [name, Array(capacities[name]).fill(0)];
  }));
  input.accept_inverse_hr = [-991, -992, -993];
  input.analytic_log_discriminant = [-999];
  return { names, input };
}

function runFresh(prepared) {
  const payload = makeFreshInput(prepared);
  const program = String.raw`
import dataclasses,decimal,fractions,hashlib,importlib,json,sys,typing
sys.set_int_max_str_digits(100000)
sys.path[:0]=[sys.argv[1],sys.argv[1]+"/src/lib"]
d=json.load(sys.stdin);v={}
for name,kind in d["names"]:
 c=bool if kind=="bool" else float if kind in ("float","Float64Buffer") else int
 value=d["input"][name];v[name]=list(map(c,value)) if isinstance(value,list) else c(value)
f=importlib.import_module("bench.pari-class-group-port.resident_generated_class_attempt").pari_resident_generated_class_attempt
action=f(**v)
adapter=importlib.import_module("bench.pari-class-group-port.row1_fresh_class_unit_adapter")
terminal=adapter.compose_row1_fresh_class_unit_result(v,{"preparedAuthoritySha256":d["authority"]})
for owner in ("attempt_state","packet_ideals"):
 bad=dict(v);bad[owner]=list(v[owner]);bad[owner][0]+=1
 try:adapter.compose_row1_fresh_presentation(bad)
 except ValueError:pass
 else:raise AssertionError("fresh adapter accepted mutated "+owner)
position=list(map(int,v["analytic_primes"])).index(3)
slot=int(v["prep_full_offsets"][position])
print(json.dumps({
 "action":int(action),"attemptState":list(map(int,v["attempt_state"])),
 "prepState":list(map(int,v["prep_state"])),
 "baseState":list(map(int,v["prep_base_state"])),
 "relationCount":int(v["relation_state"][0]),
 "classNumber":str(v["class_number"][0]),
 "invariants":list(map(str,v["class_invariants"][:int(v["attempt_state"][2])])),
 "regulator":list(map(str,v["accept_regulator"][:3])),
 "primeThree":{
   "p":str(v["prep_kummer_catalog_primes"][slot]),
   "e":str(v["prep_kummer_catalog_e"][slot]),
   "f":str(v["prep_kummer_catalog_f"][slot]),
   "u":list(map(str,v["prep_kummer_catalog_generators"][slot*3:slot*3+3])),
   "tau":list(map(str,v["prep_kummer_catalog_tau"][slot*9:slot*9+9]))},
 "degreeState":list(map(int,v["prep_degree_state"])),
 "kummerState":list(map(int,v["prep_kummer_state"])),
 "negativeCases":2,
 "terminal":{
   "schema":terminal["schema"],"status":terminal["status"],
   "complete":terminal["complete"],"classNumber":terminal["classGroup"]["classNumber"],
   "invariants":terminal["classGroup"]["invariantFactors"],
   "generatorOrder":terminal["classGroup"]["generatorOrder"],
   "units":terminal["unitGroup"]["exactUnitsIntegralBasis"],
   "unitNorms":terminal["unitGroup"]["unitNorms"],
   "unitArithmeticSha256":terminal["unitGroup"]["arithmeticSha256"],
   "regulator":terminal["unitGroup"]["packedRegulator"],
   "presentationSha256":terminal["authorities"]["presentationSha256"],
   "retainedW0RuntimeInput":terminal["provenance"]["retainedW0RuntimeInput"]}
 },separators=(",",":")))
`;
  payload.authority = authentication.authenticatePreparedNf(prepared).sha256;
  const run = spawnSync("python3", ["-c", program, ROOT], {
    cwd: ROOT,
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 128 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function main() {
  assert.equal(process.argv.length, 3,
    "usage: check_row1_resident_generated_class_attempt.cjs ROW1_W0");
  const bundle = JSON.parse(fs.readFileSync(path.resolve(process.argv[2])));
  const prepared = authentication.normalizePreparedBundle(bundle);
  const authority = authentication.authenticatePreparedNf(prepared);

  // No retained event, timing datum, or reserve state crosses this boundary.
  const live = runFresh(prepared);
  const expectedResult = bundle.events.find(event => event.event === "result");
  const expectedFactor = bundle.events.find(event => event.event === "factor_base");
  const expectedHnf = bundle.events.find(event => event.event === "hnf");
  assert.equal(live.action, 0);
  assert.equal(live.classNumber, expectedResult.classNumber);
  assert.deepEqual(live.invariants, expectedResult.invariants);
  assert.equal(live.relationCount, expectedHnf.relations);
  assert.deepEqual(live.baseState.slice(0, 6).map(String),
    [expectedFactor.C1, expectedFactor.C2, expectedFactor.KC,
      expectedFactor.KCZ, expectedFactor.KCZ2, expectedFactor.KC].map(String));
  assert.deepEqual(live.primeThree, retainedPrimeThree(bundle));
  assert.equal(live.terminal.schema,
    "sagejs.pari-class-group/row1-fresh-upstream-assumed-result-v1");
  assert.equal(live.terminal.status,
    "pari-2.17.4-correspondence-complete-not-certified");
  assert.equal(live.terminal.complete, false);
  assert.equal(live.terminal.classNumber, "3");
  assert.deepEqual(live.terminal.invariants, ["3"]);
  assert.equal(live.terminal.generatorOrder, "3");
  assert.deepEqual(live.terminal.unitNorms, ["1", "1"]);
  assert.deepEqual(live.terminal.units[0], ["6671", "-2224", "1"]);
  assert.equal(live.terminal.unitArithmeticSha256,
    "e386f24cecf914ca74716d6a6b6b462f6dfc6a80cda03e62890d562dc8acc314");
  assert.deepEqual(live.terminal.regulator, live.regulator);
  assert.equal(live.terminal.retainedW0RuntimeInput, false);
  assert.equal(live.negativeCases, 2);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row1-resident-generated-class-check-v1",
    ok: true,
    preparedAuthoritySha256: authority.sha256,
    live,
    retainedW0RuntimeInput: false,
    onePreparedInvocation: true,
    qualifiedTiming: false,
    reserveClaim: false,
    neutralResultPublished: true,
  })}\n`);
}

if (require.main === module) main();

module.exports = { makeFreshInput };
