#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");
const api = require("./row23_class_group_witness_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-23-c3077e07c31ac758.json";
const W0_SHA256 = "6c4a0b2f5e74d5f156714fad24b0bbf41c8d4998de5bbd046d74c6d8a3930c89";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const canonical = value => JSON.stringify(value);

function integer(value) { assert.equal(value.kind, "integer"); return String(value.value); }
function flattenMatrixRowMajor(matrix) {
  assert.equal(matrix.kind, "matrix");
  const columns = matrix.values.map(column => column.values.map(integer));
  return columns[0].flatMap((unused, row) => columns.map(column => column[row]));
}

async function main() {
  const started = process.hrtime.bigint();
  assert.equal(sha(fs.readFileSync(W0)), W0_SHA256, "row-23 W0 authority changed");
  const raw = JSON.parse(fs.readFileSync(W0));
  const auth = require("./prepared_nf_authentication.cjs");
  const prepared = auth.normalizePreparedBundle(raw.prepared);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "row23-class-witness-check-"));
  try {
    const receipt = await api.run({ prepared, preparedAuthoritySha256: api.PREPARED_SHA256,
      outputDirectory: output });
    assert.equal(fs.statSync(receipt.path).mode & 0o777, 0o444);
    const plain = zlib.gunzipSync(fs.readFileSync(receipt.path));
    assert.equal(sha(plain), receipt.ownerSha256);
    const owner = JSON.parse(plain);
    assert.deepEqual(owner, receipt.owner);
    assert.equal(api.verifyOwner(owner, receipt.ancestry), true);
    const repeated = api.publish(owner, output);
    assert.deepEqual(repeated, { schema: receipt.schema, path: receipt.path,
      ownerSha256: receipt.ownerSha256, compressedSha256: receipt.compressedSha256,
      bytes: receipt.bytes, compressedBytes: receipt.compressedBytes });

    const mutations = [
      value => { value.ancestry.relationMatrixSha256 = "0".repeat(64); },
      value => { value.presentation.matrices.Uir[0] = "0"; },
      value => { value.presentation.matrices.M2[0] = "1"; },
      value => { value.generator.selectedIdealHnf[0] = "8"; },
      value => { value.genback.reducedRepresentativePublished = true; },
      value => { value.compactPrincipalWitness.rawRelationCoefficients[1] = "2"; },
      value => { value.compactPrincipalWitness.factorBaseExponents[0] = "5"; },
      value => { value.compactPrincipalWitness.principalGenerators[0][0] = "0"; },
      value => { value.completion.reducedGeneratorIdealComplete = true; },
      value => { value.provenance.postcomputeOracleConsumed = true; },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(owner); mutate(changed);
      assert.throws(() => api.verifyOwner(changed, owner.ancestry), api.Row23ClassWitnessFailure);
    }

    const semanticProgram = String.raw`import copy,importlib,json,sys
sys.path.extend(['src/lib','src/baselib','.'])
m=importlib.import_module('bench.pari-class-group-port.row23_class_group_witness')
p=json.load(sys.stdin); rejected=[]
tests=[
 ('relation',lambda x:x['projection']['relations']['matrix'].__setitem__(0,str(int(x['projection']['relations']['matrix'][0])+1))),
 ('principal-generator',lambda x:x['projection']['relations']['principalGenerators'].__setitem__(0,'0')),
 ('cleanup-transform',lambda x:x['projection']['hnf']['cleanupTransform'].__setitem__(0,str(int(x['projection']['hnf']['cleanupTransform'][0])+1))),
 ('hnf-transform',lambda x:x['projection']['hnf']['hnfTransform'].__setitem__(9*13,str(int(x['projection']['hnf']['hnfTransform'][9*13])+1))),
 ('terminal-W',lambda x:x['projection']['hnf']['W'].__setitem__(0,'7')),
 ('permutation',lambda x:x['projection']['hnf']['terminalPermutation'].__setitem__(0,'2')),
 ('factor-ideal',lambda x:x['projection']['factor']['selectedIdealHnf'].__setitem__(0,'8')),
 ('ancestry',lambda x:x['ancestry'].__setitem__('selectedIdealSha256','0'*64))]
for label,mutate in tests:
 changed=copy.deepcopy(p);mutate(changed)
 try:m.compose_row23_class_group_witness(changed['projection'],changed['ancestry'])
 except m.Row23ClassWitnessFailure:rejected.append(label)
 else:raise AssertionError(label+' mutation was accepted')
print(json.dumps(rejected,separators=(',',':'))) `;
    const semantic = spawnSync("python3", ["-c", semanticProgram], { cwd: ROOT,
      input: JSON.stringify({ projection: receipt.projection, ancestry: receipt.ancestry }),
      encoding: "utf8", timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
    assert.equal(semantic.status, 0, semantic.stderr || String(semantic.error));
    assert.deepEqual(JSON.parse(semantic.stdout), ["relation", "principal-generator",
      "cleanup-transform", "hnf-transform", "terminal-W", "permutation",
      "factor-ideal", "ancestry"]);

    // Only now admit W0 answer-bearing events as differential oracles.
    const classOutput = raw.events.find(event => event.event === "class_group_output");
    const hnfEvent = raw.events.find(event => event.event === "hnf");
    const resultEvent = raw.events.find(event => event.event === "result");
    assert(classOutput && hnfEvent && resultEvent);
    assert.equal(integer(classOutput.clg1.values[0]), owner.presentation.classNumber);
    assert.deepEqual(classOutput.clg1.values[1].values.map(integer), owner.presentation.invariants);
    const oracleIdeal = flattenMatrixRowMajor(classOutput.clg1.values[2].values[0]);
    assert.deepEqual(oracleIdeal, owner.generator.selectedIdealHnf);
    assert.deepEqual(hnfEvent.exactW.values[0].values.map(integer), owner.presentation.W);
    assert.deepEqual(resultEvent.invariants, owner.presentation.invariants);

    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.pari-class-group/row23-cyclic-class-witness-check-v1",
      owner: path.basename(receipt.path), ownerSha256: receipt.ownerSha256,
      bytes: receipt.bytes, compressedBytes: receipt.compressedBytes,
      classNumber: owner.presentation.classNumber, invariants: owner.presentation.invariants,
      smithMatrices: owner.presentation.matrices,
      generatorIdealHnf: owner.generator.selectedIdealHnf,
      compactFactors: owner.compactPrincipalWitness.factorCount,
      relationCertificateSha256: owner.compactPrincipalWitness.rawRelationCoefficientsSha256,
      outputMutationsRejected: mutations.length, semanticInputMutationsRejected: 8,
      idempotentPublication: true, postcomputeW0Oracle: true,
      reducedIdealOracleMatchesSelected: true,
      exactMissingOwner: owner.nextMissingOwner.name,
      completion: owner.completion, qualifiedTiming: false,
      elapsedNanoseconds: String(process.hrtime.bigint() - started),
    })}\n`);
  } finally { fs.rmSync(output, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
