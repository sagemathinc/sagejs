#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const { loadAuthenticatedRow1 } = require("./row1_nontrivial_cubic_replay.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "row1_nontrivial_cubic.py");
const manifestPath = path.join(__dirname, "development-default-driver-manifest.json");
const defaultPayload = "/scratch/sagejs-pari-development-panel-a998/panel-01-394cce5d99f0e9f8.json";
const payloadArgument = process.argv.slice(2).find(argument => !argument.startsWith("--"));
const payloadPath = path.resolve(payloadArgument || defaultPayload);

function values(owner) {
  return owner?.toArray ? owner.toArray() : Array.from(owner);
}

function invocation(api, backend, replay, changes = {}) {
  const exact = entries => backend === "javascript"
    ? entries.slice()
    : api.createIntegerBuffer(entries.length, 512, entries);
  const guard = length => exact(Array(length).fill(77n));
  const matrices = Array.from({ length: 10 }, () => guard(1));
  const invariants = guard(1);
  const classNumber = guard(1);
  const generatorIdeal = guard(9);
  const orderWitness = guard(5);
  const state = Array(8).fill(77n);
  const smithStates = [Array(5).fill(77n), Array(5).fill(77n),
    Array(6).fill(77n), Array(6).fill(77n), Array(7).fill(77n)];
  const relationHnf = exact(changes.relationHnf || replay.relationHnf);
  const descriptorPrime = changes.descriptorPrime || replay.descriptor.prime;
  const args = [
    relationHnf,
    exact(replay.prepared.basis_table.map(BigInt)),
    exact(replay.descriptor.generator),
    descriptorPrime,
    replay.descriptor.residueDegree,
    replay.descriptor.inert,
    ...matrices,
    invariants,
    classNumber,
    guard(1), guard(1), guard(2),
    ...smithStates,
    guard(9), guard(9), guard(3),
    generatorIdeal,
    orderWitness,
    state,
  ];
  const status = api[backend](...args);
  return { status, matrices, invariants, classNumber, generatorIdeal, orderWitness, state };
}

function checkSuccess(call, replay, label) {
  assert.equal(call.status, 0n, label);
  assert.deepEqual(values(call.invariants), replay.expected.invariants, `${label}: invariants`);
  assert.deepEqual(values(call.classNumber), [replay.expected.classNumber], `${label}: h`);
  assert.deepEqual(values(call.generatorIdeal), replay.expected.generatorIdeal,
    `${label}: generator ideal`);
  assert.deepEqual(values(call.matrices[4]), replay.expected.ur, `${label}: Ur`);
  assert.deepEqual(values(call.matrices[8]), replay.expected.m1, `${label}: M1`);
  assert.deepEqual(values(call.matrices[9]), replay.expected.m2, `${label}: M2`);
  assert.deepEqual(values(call.orderWitness), [
    replay.expected.invariants[0], 1n, 1n, replay.relationHnf[0], replay.descriptor.prime,
  ], `${label}: exact order replay`);
  assert.deepEqual(values(call.state), [
    0n, 0n, 1n, 2n, 3n, replay.expected.invariants[0],
    replay.expected.classNumber, replay.descriptor.prime,
  ], `${label}: state`);
}

async function javascriptApi(source) {
  const { lowerSource } = require("../../tools/native-kernel/ir.cjs");
  const { createNativeImportResolver } = require("../../tools/native-kernel/native-imports.cjs");
  const { generateJavaScript } = require("../../tools/native-kernel/js-backend.cjs");
  const resolveNativeImport = createNativeImportResolver({ root, lowerSource, initialSourcePath: sourcePath });
  const ir = await lowerSource(source, sourcePath, { resolveNativeImport });
  const modulePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row1-cubic-")), "kernel.cjs");
  fs.writeFileSync(modulePath, generateJavaScript(ir, { sourcePath }));
  return { api: require(modulePath).pari_row1_nontrivial_cubic_class_path, cacheKey: null };
}

async function main() {
  const replay = loadAuthenticatedRow1(payloadPath, manifestPath);
  assert.equal(replay.oracle.pariVersion, "2.17.4");
  assert.equal(replay.authority.index, "3");
  assert.equal(replay.authority.fieldDiscriminant, "3559689395028");
  assert.equal(replay.relationCount, 58);
  assert.equal(replay.expected.classNumber, replay.expected.resultClassNumber);
  assert.deepEqual(replay.expected.invariants, replay.expected.resultInvariants);

  const source = fs.readFileSync(sourcePath, "utf8");
  const backend = process.argv.includes("--javascript") ? "javascript" : "gmp";
  let api, cacheKey;
  if (backend === "javascript") ({ api, cacheKey } = await javascriptApi(source));
  else {
    const built = await compileKernel({ sourcePath });
    api = require(built.modulePath).pari_row1_nontrivial_cubic_class_path;
    assert(api.nativeAvailable);
    ({ cacheKey } = built);
  }
  checkSuccess(invocation(api, backend, replay), replay, backend);

  const rejected = invocation(api, backend, replay, { relationHnf: [1n] });
  assert.equal(rejected.status, -1n);
  assert.deepEqual(values(rejected.generatorIdeal), Array(9).fill(77n));
  assert.deepEqual(values(rejected.orderWitness), Array(5).fill(77n));
  const successful = invocation(api, backend, replay);
  checkSuccess(successful, replay, `${backend}:replay`);

  console.log(JSON.stringify({
    ok: true,
    field: replay.authority.polynomial,
    authority: replay.hashes,
    retainedRelations: replay.relationCount,
    presentation: replay.relationHnf.map(String),
    classNumber: replay.expected.classNumber.toString(),
    invariants: replay.expected.invariants.map(String),
    generatorIdeal: replay.expected.generatorIdeal.map(String),
    orderWitness: values(successful.orderWitness).map(String),
    backend,
    cacheKey,
  }));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
