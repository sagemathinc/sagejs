#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const { buildRegulatorAuthority } = require("./build_regulator_authority.cjs");

const root = path.resolve(__dirname, "../..");
const residentPath = path.resolve(
  process.argv[2] || "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
);
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout: 300000,
    maxBuffer: 256 * 1024 * 1024, ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
};

async function main() {
const regulatorAuthority = await buildRegulatorAuthority();

// Retain the pristine PARI cleanarch differential as an explicit dependency.
run("node", [path.join(__dirname, "check_class_relation_cleanarch.cjs")]);
const unitOracle = JSON.parse(run("node", [path.join(__dirname, "check_unit_bridge_cubic.cjs")], {
  env: { ...process.env, SAGEJS_DUMP_UNIT_ORACLE: "1" },
}));

const program = String.raw`
import copy,dataclasses,importlib,json,pathlib,sys
sys.path.insert(0,sys.argv[1]);sys.path.append(sys.argv[1]+'/src/lib')
a=importlib.import_module('bench.pari-class-group-port.class_group_authentic_success')
m=importlib.import_module('bench.pari-class-group-port.class_group_final_driver_status')
resident_path,fixture_path=sys.argv[2:4]
resident=json.loads(pathlib.Path(resident_path).read_text());data=json.load(sys.stdin)
oracle=data['oracle'];regulator_authority=data['regulator_authority']
authentic=a.build_authentic_success_payload(resident_path,fixture_path,oracle,regulator_authority)
status=m.build_live_final_driver_status(resident,authentic);payload=m.detached_status_payload(status)
assert payload['native_state']==['0','1','1','48','48','7','7','73','8','0']
assert payload['final_driver']['honesty_status']=='equal-bound-source-skip'
assert payload['final_driver']['cleanarch_status']=='accepted'
assert payload['final_driver']['terminal_status']=='buchall-end-assembled'
assert payload['phase5_complete'] is False and payload['public_complete'] is False
assert m.replay_live_final_driver_status(payload,resident,authentic)==status

def reject_live(change):
 r=copy.deepcopy(resident);change(r)
 try:m.build_live_final_driver_status(r,authentic)
 except m.FinalDriverStatusFailure:return
 raise AssertionError('mutated live owner accepted')
reject_live(lambda r:r['prep_base_state'].__setitem__(4,str(int(r['prep_base_state'][4])+1)))
reject_live(lambda r:r['prep_state'].__setitem__(0,'6'))
reject_live(lambda r:r['hnf_state'].__setitem__(7,'72'))
reject_live(lambda r:r['accept_acceptance_state'].__setitem__(0,'1'))
reject_live(lambda r:r['hnf_result_c'].__setitem__(1,str(int(r['hnf_result_c'][1])+1)))

def reject_detached(change):
 p=copy.deepcopy(payload);change(p)
 try:m.replay_live_final_driver_status(p,resident,authentic)
 except m.FinalDriverStatusFailure:return
 raise AssertionError('detached status mutation accepted')
reject_detached(lambda p:p['native_state'].__setitem__(1,'0'))
reject_detached(lambda p:p['final_driver'].__setitem__('honesty_status','verified'))
reject_detached(lambda p:p['final_driver'].__setitem__('cleanarch_status','retry'))
reject_detached(lambda p:p.__setitem__('cleaned_sha256','0'*64))
reject_detached(lambda p:p.__setitem__('phase5_complete',True))
reject_detached(lambda p:p.__setitem__('public_complete',True))
print(json.dumps({'sourceSha256':payload['source_sha256'],'cleanedSha256':payload['cleaned_sha256'],'candidateSha256':payload['final_driver']['candidate_sha256'],'transformsSha256':payload['final_driver']['transforms_sha256'],'unitsSha256':payload['final_driver']['units_sha256'],'generatorsSha256':payload['final_driver']['generators_sha256'],'nativeState':payload['native_state'],'liveMutations':5,'detachedMutations':6,'phase5Complete':False,'publicComplete':False},sort_keys=True))
`;
const fixturePath = path.join(__dirname, "unit-bridge-cubic-fixtures.json");
const dynamic = JSON.parse(run("python3", ["-c", program, root, residentPath, fixturePath], {
  input: JSON.stringify({ oracle: unitOracle, regulator_authority: regulatorAuthority }),
}));

const resident = JSON.parse(fs.readFileSync(residentPath));
const built = await compileKernel({
  sourcePath: path.join(__dirname, "class_group_final_driver_status.py"),
});
const fn = require(built.modulePath).pari_equal_bound_cleanarch_driver_status;
assert(fn.nativeAvailable);
const values = (x) => Array.isArray(x) ? x : x.toArray ? x.toArray() : Array.from(x);
for (const backend of ["javascript", "gmp", "tagged"]) {
  const I = (data) => backend === "javascript"
    ? data.map(BigInt)
    : fn.createIntegerBuffer(data.length, 4096, data.map(BigInt));
  const Z = (length) => I(Array(length).fill(0));
  const S = (data) => backend === "javascript"
    ? data.map(BigInt)
    : fn.createInt64Buffer(data.map(BigInt));
  const columns = 7;
  const output = Z(21 * columns), cleanState = S(Array(4).fill(0));
  const driverState = S(Array(10).fill(0));
  const args = [
    I(resident.prep_base_state.slice(0, 7)),
    I(resident.prep_state.slice(0, 8)),
    S(resident.hnf_state.slice(0, 9)),
    S(resident.accept_acceptance_state.slice(0, 3)),
    I(resident.hnf_result_c.slice(0, 21 * columns)),
    7n, BigInt(resident.precision), Z(3), Z(512), Z(512), Z(512), Z(512), Z(1024),
    Z(21 * columns), output, cleanState, driverState,
  ];
  assert.equal(fn[backend](...args), 0n);
  assert.deepEqual(values(driverState), dynamic.nativeState.map(BigInt));
  const before = values(output);
  const unequal = args.slice();
  const base = resident.prep_base_state.slice(0, 7).map(BigInt); base[4] += 1n;
  unequal[0] = I(base); unequal[13] = Z(21 * columns); unequal[14] = Z(21 * columns);
  unequal[15] = S(Array(4).fill(0)); unequal[16] = S(Array(10).fill(0));
  assert.equal(fn[backend](...unequal), 2n);
  assert.deepEqual(values(unequal[14]), Array(21 * columns).fill(0n));
  assert.notDeepEqual(before, Array(21 * columns).fill(0n));
}

console.log(JSON.stringify({
  ...dynamic,
  backends: ["cpython", "javascript", "gmp", "tagged"],
  transactional: true,
  cacheKey: built.cacheKey,
}));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
