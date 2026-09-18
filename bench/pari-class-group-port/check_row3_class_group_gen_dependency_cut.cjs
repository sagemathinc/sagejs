#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const authority = require("./row34_real_cubic_presentation_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row3_class_group_gen_dependency_cut.py");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const values = owner => owner.toArray ? owner.toArray() : Array.from(owner);

function loadOwner(filename) {
  const bytes = fs.readFileSync(filename);
  const owner = JSON.parse(bytes);
  authority.verifyOwner(owner, owner.ancestry);
  assert.equal(owner.field.panelIndex, 3);
  assert.equal(owner.replay.computedBeforeExpectedComparison, true);
  // Only these computed, answer-independent owners cross the runtime boundary.
  // In particular classNumber, invariants, comparison, and terminal PARI output
  // are intentionally not returned.
  return {
    digest: sha(bytes),
    W: owner.presentation.terminalW.map(BigInt),
    permutation: owner.replay.terminalPermutation.map(BigInt),
    detachedOracle: {
      classNumber: owner.presentation.classNumber,
      invariants: owner.presentation.invariants,
    },
  };
}

function multiply(left, n, right) {
  return Array.from({ length: n * n }, (_, at) => {
    const row = at % n, column = Math.floor(at / n);
    let answer = 0n;
    for (let k = 0; k < n; k += 1) answer += left[k * n + row] * right[column * n + k];
    return answer;
  });
}

function allocate(fn, W, permutation, backend) {
  const integer = (length, initial = null) => fn.createIntegerBuffer(
    length, 64, initial || Array(length).fill(77n));
  const matrices = Array.from({ length: 10 }, () => integer(4));
  const args = [integer(4, W), permutation, ...matrices, integer(2), integer(1),
    integer(2), integer(4), integer(8), ...Array.from({ length: 5 }, () => Array(9).fill(77n)),
    integer(1336), Array(9).fill(77n)];
  const status = fn[backend](...args);
  return { status, args, matrices };
}

(async () => {
  if (process.argv.length !== 3) throw new Error("usage: check_row3_class_group_gen_dependency_cut.cjs ROW3_PRESENTATION_OWNER|--protocol-only");
  const protocolOnly = process.argv[2] === "--protocol-only";
  const input = protocolOnly ? {
    digest: null, W: [3n, 0n, 0n, 2n],
    permutation: Array.from({ length: 668 }, (_, i) => BigInt(i + 1)),
    detachedOracle: { classNumber: "6", invariants: ["6"] },
  } : loadOwner(path.resolve(process.argv[2]));
  const built = await compileKernel({ sourcePath: SOURCE });
  const fn = require(built.modulePath).pari_row3_class_group_gen_dependency_cut;
  assert(fn.nativeAvailable);
  assert.doesNotMatch(fs.readFileSync(built.coreSourcePath, "utf8"), /napi_call_function|PyObject_Call|v8::/);
  const summaries = [];
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const run = allocate(fn, input.W, input.permutation, backend);
    assert.equal(run.status, 1n);
    const state = run.args.at(-1);
    assert.deepEqual(state, [1n, 1n, 1n, 1n, 1n, 1n, 0n, 1n, 668n]);
    const [D, U, Ui, V, Ur, Y, Uir, X, M1, M2] = run.matrices.map(values);
    assert.deepEqual(multiply(multiply(U, 2, input.W), 2, V), D);
    assert.deepEqual(multiply(U, 2, Ui), [1n, 0n, 0n, 1n]);
    assert.deepEqual(multiply(Ui, 2, U), [1n, 0n, 0n, 1n]);
    assert.equal(values(run.args[12]).slice(0, 1).map(String).join(), input.detachedOracle.invariants.join());
    assert.equal(String(values(run.args[13])[0]), input.detachedOracle.classNumber);
    const exponents = values(run.args.at(-2));
    const nonzero = exponents.flatMap((value, index) => value ? [[index, value]] : []);
    assert.equal(nonzero.length > 0, true);
    assert.equal(nonzero.every(([index]) => index < 668), true);
    summaries.push({ backend, D: D.map(String), Uir: Uir.map(String),
      M1: M1.slice(0, 2).map(String), M2: M2.map(String),
      genbackTerms: nonzero.map(([index, value]) => [index, String(value)]) });
  }
  // The fail-closed boundary must reject a duplicated or out-of-range neutral
  // permutation before publishing even the diagnostic request.
  for (const mutate of [p => { p[1] = p[0]; }, p => { p[0] = 0n; }]) {
    const changed = input.permutation.slice(); mutate(changed);
    const run = allocate(fn, input.W, changed, "gmp");
    assert.equal(run.status, -1n);
    assert.equal(run.args.at(-1)[1], 0n);
  }
  // CPython executes the same source and is checked separately from native.
  const py = spawnSync("python3", ["-c", String.raw`
import importlib,json,sys
sys.path[:0]=[sys.argv[1],sys.argv[1]+'/src/lib']
f=importlib.import_module('bench.pari-class-group-port.row3_class_group_gen_dependency_cut').pari_row3_class_group_gen_dependency_cut
d=json.load(sys.stdin); z=lambda n:[77]*n; mats=[z(4) for _ in range(10)]; args=[list(map(int,d['W'])),list(map(int,d['p'])),*mats,z(2),z(1),z(2),z(4),z(8),*[z(9) for _ in range(5)],z(1336),z(9)]
assert f(*args)==1 and args[-1]==[1,1,1,1,1,1,0,1,668]
print(json.dumps({'D':mats[0],'Uir':mats[6],'genbackTerms':sum(x!=0 for x in args[-2][:668])}))
`, ROOT], { cwd: ROOT, input: JSON.stringify({ W: input.W.map(String), p: input.permutation.map(String) }),
    encoding: "utf8", timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(py.status, 0, py.stderr || String(py.error));
  assert.deepEqual(JSON.parse(py.stdout).D.map(String), summaries[0].D);
  process.stdout.write(`${JSON.stringify({ schema: "sagejs.pari-class-group/row3-class-group-gen-dependency-cut-check-v1",
    ownerSha256: input.digest, authenticOwnerChecked: !protocolOnly,
    protocolOnly, runtimeInputs: ["terminalW", "terminalPermutation"],
    forbiddenRuntimeInputs: ["classNumber", "invariants", "PARI generators", "reduced ideals"],
    sourceSha256: sha(fs.readFileSync(SOURCE)), coreBytes: fs.statSync(built.coreSourcePath).size,
    backends: ["cpython", ...summaries.map(x => x.backend)], result: summaries[0],
    stop: { status: 1, reason: "missing source-derived row-3 reduced-ideal candidate/genback owner",
      smithComplete: true, inverseHnfDivisionsComplete: true, genbackRequestsPrepared: 1,
      genbackRequestsCompleted: 0 }, qualifiedTiming: false })}\n`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
