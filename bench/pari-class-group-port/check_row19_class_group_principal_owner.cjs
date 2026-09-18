#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const api = require("./row19_class_group_principal_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-19-0aab4dadcd4bc7c7.json";
const W0_SHA256 = "0be835c418ce9b2055cf79051db7220248299c6d53e56a84ae47b0d1ec747ad9";
const TERMINAL = "/scratch/sagejs-row19-terminal-continuation/row19-terminal-continuation-f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76.json.gz";
const FIRST = "/scratch/sagejs-row19-first-hnf/row19-first-hnf-076d334e302d880b2a7da80366fe492d62b118e2a495f15c422908137aa66258.json.gz";
const OUTPUT = "/scratch/sagejs-row19-class-group-principal";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function runPrefix(prepared) {
  const run = spawnSync("python3", ["-c", `
import runpy,sys
sys.path.extend(['src/lib','src/baselib','.'])
runpy.run_module('bench.pari-class-group-port.row19_prepared_prefix_probe',run_name='__main__')`], {
    cwd: ROOT, input: JSON.stringify(prepared), encoding: "utf8",
    timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env,
      SAGEJS_NATIVE_CACHE_DIR: "/scratch/sagejs-native-cache-row19-principal-owner/cache",
      SAGEJS_NATIVE_CACHE_ROOT: "/scratch/sagejs-native-cache-row19-principal-owner/root" },
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function integer(value) {
  assert.equal(value.kind, "integer");
  return String(value.value);
}

function integerMatrix(value) {
  assert.equal(value.kind, "matrix");
  return value.values.flatMap(column => column.values.map(integer));
}

function realTriple(value) {
  if (value.kind === "integer") return [String(value.value), "-1", "0"];
  assert.equal(value.kind, "real");
  return [String(value.mantissa), String(value.precision), String(value.exponent)];
}

function packedLogMatrix(matrix) {
  assert.equal(matrix.kind, "matrix");
  return matrix.values.flatMap(column => column.values.flatMap(value =>
    value.kind === "complex" ?
      ["2", ...realTriple(value.real), ...realTriple(value.imag)] :
      ["1", ...realTriple(value), "0", "-1", "0"]));
}

function main() {
  const started = process.hrtime.bigint();
  assert.equal(sha(fs.readFileSync(W0)), W0_SHA256);
  const raw = JSON.parse(fs.readFileSync(W0));
  const auth = require("./prepared_nf_authentication.cjs");
  const prepared = auth.normalizePreparedBundle(raw);
  const preparedAuthority = auth.authenticatePreparedBundle(raw);
  const prefix = runPrefix(prepared);
  const request = {
    terminalDescriptor: { path: TERMINAL, ownerSha256: api.TERMINAL_SHA256,
      compressedSha256: api.TERMINAL_COMPRESSED_SHA256 },
    firstDescriptor: { path: FIRST, ownerSha256: api.FIRST_SHA256,
      compressedSha256: api.FIRST_COMPRESSED_SHA256 },
    prepared, prefix, preparedAuthoritySha256: preparedAuthority.sha256,
    outputDirectory: OUTPUT,
  };
  const first = api.buildOwner(request);
  const repeated = api.buildOwner(request);
  assert.deepEqual(repeated.receipt, first.receipt);
  assert.deepEqual(repeated.owner, first.owner);
  const owner = api.readGzipOwner({ path: first.receipt.path,
    ownerSha256: first.receipt.ownerSha256,
    compressedSha256: first.receipt.compressedSha256 });
  assert.equal(api.verifyOwner(owner, owner.ancestry), true);

  const mutations = [
    value => { value.principalRelationTransform.entries[0] = "1"; },
    value => { value.generators[0].principalWitness.rawRelationCoefficients[0] = "1"; },
    value => { value.generators[0].principalWitness.factorBaseExponents[0] = "1"; },
    value => { value.factorBase.idealHnfs[0][0] = "1"; },
    value => { value.archimedean.GD.pop(); },
    value => { value.archimedean.cleanarch.state[1] = "423"; },
    value => { value.completion.principalIdealOrderWitnessesComplete = false; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(owner); mutate(changed);
    assert.throws(() => api.verifyOwner(changed, owner.ancestry));
  }

  // Source-owner mutations must fail during semantic recomputation, not only
  // while checking the immutable output envelope.
  const mutationProgram = String.raw`
import copy,gzip,hashlib,importlib,json,sys
sys.path.extend(['src/lib','src/baselib','.'])
m=importlib.import_module('bench.pari-class-group-port.row19_class_group_principal_owner')
p=json.load(sys.stdin);rejected=[]
for label,mutate in [
 ('first-transform',lambda x:x['first']['ancestry']['cleanupTransform'].__setitem__(0,'2')),
 ('terminal-transform',lambda x:x['terminal']['ancestry']['transform'].__setitem__(0,'2')),
 ('raw-generator',lambda x:x['terminal']['relationIdentity']['generators'].__setitem__(0,'0'))]:
 changed=copy.deepcopy(p);mutate(changed)
 try:m.compose_row19_class_group_principal_owner(changed['terminal'],changed['first'],changed['prepared'],changed['prefix'],changed['ancestry'])
 except (m.Row19PrincipalOwnerFailure,ValueError):rejected.append(label)
 else:raise AssertionError(label+' mutation was accepted')
print(json.dumps(rejected,separators=(',',':')))`;
  const semanticPayload = { terminal: api.readGzipOwner(request.terminalDescriptor),
    first: api.readGzipOwner(request.firstDescriptor), prepared, prefix,
    ancestry: owner.ancestry };
  const semantic = spawnSync("python3", ["-c", mutationProgram], {
    cwd: ROOT, input: JSON.stringify(semanticPayload), encoding: "utf8",
    timeout: 600_000, maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env,
      SAGEJS_NATIVE_CACHE_DIR: "/scratch/sagejs-native-cache-row19-principal-owner/cache",
      SAGEJS_NATIVE_CACHE_ROOT: "/scratch/sagejs-native-cache-row19-principal-owner/root" },
  });
  assert.equal(semantic.status, 0, semantic.stderr || String(semantic.error));
  assert.deepEqual(JSON.parse(semantic.stdout),
    ["first-transform", "terminal-transform", "raw-generator"]);

  // W0 is admitted only after the owner is complete and immutable.
  const event = raw.events.find(value => value.event === "class_group_output");
  assert(event);
  const clg2 = event.clg2.values;
  assert.deepEqual(integerMatrix(clg2[0]), owner.presentation.matrices.Ur);
  assert.deepEqual(packedLogMatrix(clg2[1]), owner.archimedean.ga);
  assert.deepEqual(packedLogMatrix(clg2[2]), owner.archimedean.GD);
  assert.deepEqual(integerMatrix(clg2[4]), owner.presentation.matrices.M1);
  assert.deepEqual(integerMatrix(clg2[5]), owner.presentation.matrices.M2);
  assert(clg2[3].values.every(famat => famat.values.every(column =>
    column.values.length === 0)));

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-class-group-principal-check-v1",
    ...first.receipt,
    terminalOwnerSha256: api.TERMINAL_SHA256,
    firstHnfOwnerSha256: api.FIRST_SHA256,
    preparedAuthoritySha256: preparedAuthority.sha256,
    relationTransformSha256: owner.principalRelationTransform.sha256,
    fullValuationReplayExact:
      owner.principalRelationTransform.terminalFullValuationReplayExact,
    generatorPowerFactorBaseEqualitiesExact: owner.generators.every(generator =>
      generator.principalWitness.generatorPowerFactorBaseEqualityExact),
    generatorIdealsSha256: sha(Buffer.from(JSON.stringify(owner.generators.map(
      generator => generator.reducedRepresentative.idealHnf)))),
    principalFactorCounts: owner.generators.map(
      generator => generator.principalWitness.factorCount),
    postcomputeClg2Oracle: true,
    outputMutationsRejected: mutations.length,
    semanticInputMutationsRejected: 3,
    idempotentPublication: true,
    completion: owner.completion,
    remainingBoundary: owner.remainingBoundary.name,
    elapsedNs: String(process.hrtime.bigint() - started),
  })}\n`);
}

try { main(); } catch (error) {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
}
