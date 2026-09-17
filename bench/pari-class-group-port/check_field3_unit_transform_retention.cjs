#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "field3_unit_transform_retention.py");
const durable = "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority";
const pari = process.argv[2] || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4";
const archive = process.argv[3] || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz";
const initial = process.argv[4] || path.join(durable,
  "initial-collector-fixtures-81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe.json");
const analytic = process.argv[5] || path.join(
  "/scratch/sagejs-runtime/pari-class-group-e2e-20260917",
  "phase0-bd4cb3518-durable-20260917/stages/analytic/attempts/attempt-T2yKcK",
  "generated/sagejs-analytic-invhr-gnrGNj/fixtures.json",
);
for (const file of [pari, archive, initial, analytic])
  assert(fs.existsSync(file), `missing transform input: ${file}`);

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

const producer = JSON.parse(run(process.execPath, [
  path.join(__dirname, "check_post_rnd_lie_iteration.cjs"),
  pari, archive, initial, analytic,
], { env: { ...process.env, FIELD3_TRANSFORM_CAPTURE_ONLY: "1" } }).trim().split(/\r?\n/).at(-1));
const retained = producer.cpython.rawToAcceptedTransform;
assert.deepEqual(retained.shape, [301, 13]);
assert.deepEqual(retained.state, [0, 301, 13, 293, 3, 3913, 0, 0]);
assert.equal(retained.entries.length, 301 * 13);
assert.equal(retained.terminalAcceptedA.length, 13 * 3 * 7);
assert.deepEqual(retained.initial, [293, 293, 41, 34, 2, 252, 1]);
assert.deepEqual(retained.relationKernelState, [0, 288, 301, 13, 3744]);
assert.deepEqual(retained.packedReplayState, [0, 301, 13, 273, 4, 0, 0, 0]);
assert.deepEqual(retained.mutationsRejected, [
  "raw-relation", "raw-log", "terminal-A", "local-transform", "input-permutation",
]);
assert.equal(retained.sourceRawLogs.length, 301 * 3 * 7);
assert.equal(retained.sameRunAuthority.runId,
  "field3-post-rnd-live-unit-transform");
assert.equal(retained.sameRunAuthority.fieldId,
  "x^4-2000022*x-2000042");
assert.equal(retained.sameRunAuthority.ownerGeneration, 1);
assert.equal(retained.sameRunAuthority.terminalHnfState[0], 2);
assert.equal(retained.sameRunAuthority.terminalHnfState[2], 286);
assert.equal(retained.sameRunAuthority.terminalHnfState[4], 13);
assert.equal(retained.sameRunAuthority.terminalHnfState[7], 301);

const relations = retained.sameRunAuthority.relationRecords.map(BigInt);
const transform = retained.entries.map(BigInt);
assert.equal(relations.length, 288 * 301);
assert.equal(retained.sameRunAuthority.principalGenerators.length, 301 * 4);

const pythonProgram = String.raw`
import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.field3_unit_transform_retention')
d=json.load(sys.stdin);s=[77]*5
assert m.pari_field3_validate_unit_relation_kernel(list(map(int,d['r'])),list(map(int,d['t'])),s)==0
assert s==[0,288,301,13,3744]
d['t'][0]=str(int(d['t'][0])+1);held=[77]*5
assert m.pari_field3_validate_unit_relation_kernel(list(map(int,d['r'])),list(map(int,d['t'])),held)==1
assert held==[77]*5
print(json.dumps({'state':s,'mutationRejected':True}))
`;
const python = JSON.parse(run("python3", ["-c", pythonProgram, root,
  path.join(root, "src/lib")], {
  input: JSON.stringify({ r: relations.map(String), t: transform.map(String) }),
}));
assert.deepEqual(python.state, [0, 288, 301, 13, 3744]);

function exactBuffer(api, entries) {
  let bits = 1;
  for (let value of entries) {
    if (value < 0n) value = -value;
    bits = Math.max(bits, value.toString(2).length);
  }
  return api.createIntegerBuffer(entries.length,
    Math.max(4, Math.ceil(bits / 64) + 2), entries);
}

(async () => {
  const built = await compileKernel({ sourcePath });
  const api = require(built.modulePath).pari_field3_validate_unit_relation_kernel;
  assert(api.nativeAvailable);
  const backends = [];
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const r = relations.slice();
    const t = backend === "javascript" ? transform.slice() : exactBuffer(api, transform);
    const state = Array(5).fill(77n);
    assert.equal(api[backend](r, t, state), 0n, backend);
    assert.deepEqual(state, [0n, 288n, 301n, 13n, 3744n], backend);
    const changed = transform.slice();
    changed[0] += 1n;
    const bad = backend === "javascript" ? changed : exactBuffer(api, changed);
    const held = Array(5).fill(77n);
    assert.equal(api[backend](r, bad, held), 1n, `${backend}: mutation`);
    assert.deepEqual(held, Array(5).fill(77n), `${backend}: transactional`);
    backends.push(backend);
  }
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);
  console.log(JSON.stringify({
    field: 3,
    polynomial: "x^4 - 2000022*x - 2000042",
    rawRelations: 301,
    acceptedColumns: 13,
    retainedEntries: 3913,
    relationKernelRows: 288,
    relationKernelIdentity: "exact",
    packedLogIdentity: "exact source-order same-run hnfspec/hnfadd replay",
    terminalPackedWords: retained.terminalAcceptedA.length,
    full301SquareConstructed: false,
    outputPublishedTransactionally: true,
    backends: ["CPython", ...backends],
    coreBytes: fs.statSync(built.coreSourcePath).size,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
