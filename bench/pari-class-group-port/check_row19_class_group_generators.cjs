#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-19-0aab4dadcd4bc7c7.json";
const W0_SHA256 = "0be835c418ce9b2055cf79051db7220248299c6d53e56a84ae47b0d1ec747ad9";
const TERMINAL = "/scratch/sagejs-row19-terminal-continuation/row19-terminal-continuation-f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76.json.gz";
const TERMINAL_SHA256 = "f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76";
const TERMINAL_COMPRESSED_SHA256 = "bfa7c4a68a2571e5c2663fb43b672d7dcaae36905262b0256a318e44221123dd";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => sha(Buffer.from(JSON.stringify(value)));

function pythonModule(module, payload, extra = []) {
  const run = spawnSync("python3", ["-c", `
import runpy,sys
sys.path.extend(['src/lib','src/baselib','.'])
runpy.run_module(${JSON.stringify(module)},run_name='__main__')`, ...extra], {
    cwd: ROOT,
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      SAGEJS_NATIVE_CACHE_DIR: "/scratch/sagejs-native-cache-row19-classgen/cache",
      SAGEJS_NATIVE_CACHE_ROOT: "/scratch/sagejs-native-cache-row19-classgen/root",
    },
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function integer(value) {
  assert.equal(value.kind, "integer");
  return String(value.value);
}

function flattenMatrixRowMajor(matrix) {
  assert.equal(matrix.kind, "matrix");
  const columns = matrix.values.map(column => column.values.map(integer));
  return columns[0].flatMap((unused, row) => columns.map(column => column[row]));
}

function main() {
  const started = process.hrtime.bigint();
  assert.equal(sha(fs.readFileSync(W0)), W0_SHA256, "W0 authority changed");
  const compressed = fs.readFileSync(TERMINAL);
  assert.equal(sha(compressed), TERMINAL_COMPRESSED_SHA256, "terminal gzip changed");
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha(plain), TERMINAL_SHA256, "terminal owner changed");
  const terminal = JSON.parse(plain);

  const raw = JSON.parse(fs.readFileSync(W0));
  const auth = require("./prepared_nf_authentication.cjs");
  const prepared = auth.normalizePreparedBundle(raw);
  const authority = auth.authenticatePreparedBundle(raw);
  const prefix = pythonModule(
    "bench.pari-class-group-port.row19_prepared_prefix_probe", prepared);
  const ancestry = {
    terminalOwnerSha256: TERMINAL_SHA256,
    terminalCompressedSha256: TERMINAL_COMPRESSED_SHA256,
    preparedAuthoritySha256: authority.sha256,
    preparedProjectionSha256: hash(prepared),
    prefixSha256: hash(prefix),
  };
  assert.equal(terminal.authority.prefixSha256, ancestry.prefixSha256,
    "fresh prefix disagrees with terminal ancestry");
  const payload = { terminal, prepared, prefix, ancestry };
  const answer = pythonModule(
    "bench.pari-class-group-port.row19_class_group_generators", payload);

  assert.equal(answer.schema,
    "sagejs.pari-class-group/row19-class-group-generators-v1");
  assert.deepEqual(answer.presentation.invariants,
    ["6", "3", "3", "3", "3", "3", "3", "3", "3"]);
  assert.equal(answer.presentation.classNumber, "39366");
  assert.equal(answer.generators.length, 9);
  assert(answer.generators.every(entry => entry.orderWitness.exact));
  assert(answer.generators.every(entry =>
    entry.reducedRepresentative.factorKinds.length === 0));
  assert.equal(answer.completion.reducedClassGeneratorIdealsComplete, true);
  assert.equal(answer.completion.presentationOrderWitnessesComplete, true);
  assert.equal(answer.completion.principalIdealOrderWitnessesComplete, false);
  assert.equal(answer.completion.oracleDataConsumed, false);

  // Reject mutations by recomputing from the changed source owners.  The
  // subprocess receives no answer-bearing W0 event.
  const mutationProgram = String.raw`
import copy,importlib,json,sys
sys.path.extend(['src/lib','src/baselib','.'])
m=importlib.import_module('bench.pari-class-group-port.row19_class_group_generators')
p=json.load(sys.stdin); rejected=[]
tests=[
 ('W',lambda x:x['terminal']['result']['W'].__setitem__(0,'7')),
 ('permutation',lambda x:x['terminal']['result']['perm'].__setitem__(0,'1')),
 ('factor-ideal',lambda x:x['prefix']['factor']['packetIdeals'].__setitem__(0,999)),
 ('embedding',lambda x:x['prepared']['preparation_embedding'].__setitem__(3,'0')),
 ('ancestry',lambda x:x['ancestry'].__setitem__('terminalOwnerSha256','0'*64))]
for label,mutate in tests:
 changed=copy.deepcopy(p);mutate(changed)
 try:m.compose_row19_class_group_generators(changed['terminal'],changed['prepared'],changed['prefix'],changed['ancestry'])
 except (m.Row19ClassGroupFailure,ValueError):rejected.append(label)
 else:raise AssertionError(label+' mutation was accepted')
print(json.dumps(rejected,separators=(',',':')))`;
  const mutations = spawnSync("python3", ["-c", mutationProgram], {
    cwd: ROOT,
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      SAGEJS_NATIVE_CACHE_DIR: "/scratch/sagejs-native-cache-row19-classgen/cache",
      SAGEJS_NATIVE_CACHE_ROOT: "/scratch/sagejs-native-cache-row19-classgen/root",
    },
  });
  assert.equal(mutations.status, 0, mutations.stderr || String(mutations.error));
  assert.deepEqual(JSON.parse(mutations.stdout),
    ["W", "permutation", "factor-ideal", "embedding", "ancestry"]);

  // Only after the answer-independent worker exits do we admit PARI's final
  // class object as a differential oracle.
  const classOutput = raw.events.find(event => event.event === "class_group_output");
  const result = raw.events.find(event => event.event === "result");
  assert(classOutput && result);
  const clg = classOutput.clg1.values;
  assert.equal(integer(clg[0]), answer.presentation.classNumber);
  assert.deepEqual(clg[1].values.map(integer), answer.presentation.invariants);
  const oracleGenerators = clg[2].values.map(flattenMatrixRowMajor);
  const computedGenerators = answer.generators.map(
    entry => entry.reducedRepresentative.idealHnf);
  assert.deepEqual(computedGenerators, oracleGenerators);
  assert.deepEqual(result.invariants, answer.presentation.invariants);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-class-group-generators-check-v1",
    terminalOwnerSha256: TERMINAL_SHA256,
    preparedAuthoritySha256: authority.sha256,
    prefixSha256: ancestry.prefixSha256,
    classNumber: answer.presentation.classNumber,
    invariants: answer.presentation.invariants,
    requests: answer.generators.map(entry => entry.request),
    sourceIndices: answer.generators.map(entry => entry.sourceIndices),
    reducedGeneratorIdeals: computedGenerators,
    generatorSha256: hash(computedGenerators),
    smithState: answer.presentation.state,
    inputMutationsRejected: 5,
    postcomputeW0Oracle: true,
    exactMissingOwner: answer.nextMissingOwner.name,
    completion: answer.completion,
    elapsedNs: String(process.hrtime.bigint() - started),
  })}\n`);
}

try { main(); } catch (error) {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
}
