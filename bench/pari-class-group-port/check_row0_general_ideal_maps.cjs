#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const adapter = require("./row0_class_unit_output_evidence_v2.cjs");
const proofApi = require("./row0_raw_relation_smith_proof.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");

const RESULT = "/scratch/sagejs-row0-v2-current/" +
  "row0-class-unit-result-dbf645dd5bdf4eb2f27dbaa769d1c08d454c551318a32611b47a1a232754da58.json";
const PYTHON = String.raw`
import copy, hashlib, importlib, json, sys
root, source_root = sys.argv[1:3]
import hashlib
sys.path[:0] = [root, source_root]
m = importlib.import_module('bench.pari-class-group-port.row0_general_ideal_maps')
value = json.load(sys.stdin)
receipt = m.replay_general_maps(value['payload'], value['proof'])
source = m._source(value['payload'], value['proof'])
native_product = m._multiply(source, source['ideals'][0], source['ideals'][5])
mutations = []
bad = copy.deepcopy(value['proof'])
bad['material']['v'][0] = str(int(bad['material']['v'][0]) + 1)
try:
    m.replay_general_maps(value['payload'], bad)
except m.Row0GeneralMapFailure:
    mutations.append('raw-smith-v')
bad = copy.deepcopy(value['payload'])
owner = next(x for x in bad['storage'] if x['name'] == 'replay-packet_ideals')
owner['entries'][0] = str(int(owner['entries'][0]) + 1)
try:
    m.replay_general_maps(bad, value['proof'])
except m.Row0GeneralMapFailure:
    mutations.append('factor-base-ideal')
print(json.dumps({'receipt': receipt, 'mutationsRejected': mutations,
  'polynomial': source['polynomial'], 'basis': source['basis'],
  'table': source['table'], 'left': source['ideals'][0],
  'right': source['ideals'][5], 'nativeProduct': native_product},
  separators=(',', ':')))
`;

function replayOwners(payload) {
  return Object.fromEntries(payload.storage
    .filter(owner => owner.name.startsWith("replay-"))
    .map(owner => [owner.name.slice(7), owner.entries]));
}
function buffer(fn, values, bits = 4096) {
  return fn.createIntegerBuffer(values.length, bits, values.map(BigInt));
}

async function main(filename = RESULT) {
  const raw = fs.readFileSync(path.resolve(filename));
  const payload = adapter.authenticateRow0Correspondence(raw);
  const proof = proofApi.buildRow0RawRelationSmithProof(replayOwners(payload));
  const run = spawnSync("python3", ["-c", PYTHON,
    path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")], {
    input: JSON.stringify({ payload, proof }), encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024, timeout: 120_000,
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const checked = JSON.parse(run.stdout);
  const receipt = checked.receipt;
  assert.equal(receipt.schema,
    "sagejs.pari-class-group/row0-general-ideal-maps-v1");
  assert.equal(receipt.domain,
    "arbitrary-fractional-cubic-ideal-hnf-supported-on-retained-factor-base-with-word-hnf-modulus");
  assert.deepEqual(receipt.maps, { combine: true, factor: true, reduce: true });
  assert.equal(receipt.factorBasePrimeRoundTrips, 66);
  assert.equal(receipt.arbitraryIntegralProductsReplayed, 2);
  assert.equal(receipt.fractionalPrincipalDenominatorRoundTrips, 1);
  assert.equal(receipt.outOfSupportRejections, 2);
  assert.deepEqual(receipt.nativeArithmetic, [
    "pari_monic_cubic_basis_tensor", "pari_cubic_ideal_hnf_multiply",
  ]);
  const body = { ...receipt };
  delete body.contentSha256;
  assert.equal(receipt.contentSha256, v2.sha256Canonical(body));
  assert.deepEqual(checked.mutationsRejected.sort(),
    ["factor-base-ideal", "raw-smith-v"]);

  // Exercise the exact arithmetic through generated native code, not merely
  // through the ordinary-CPython fallback used by the orchestration replay.
  const [tensorBuild, productBuild] = await Promise.all([
    compileKernel({ sourcePath: path.join(__dirname,
      "real_cubic_getfu_honesty.py") }),
    compileKernel({ sourcePath: path.join(__dirname,
      "signed_prime_ideal_reduction.py") }),
  ]);
  const tensor = require(tensorBuild.modulePath).pari_monic_cubic_basis_tensor;
  const multiply = require(productBuild.modulePath).pari_cubic_ideal_hnf_multiply;
  assert(tensor.nativeAvailable && multiply.nativeAvailable);
  const table = buffer(tensor, Array(27).fill(0));
  assert.equal(tensor.gmp(checked.polynomial.map(BigInt), checked.basis.map(BigInt),
    buffer(tensor, Array(32).fill(0)), table), 0n);
  assert.deepEqual(table.toArray(), checked.table.map(BigInt));
  const output = buffer(multiply, Array(9).fill(0));
  assert.equal(multiply.gmp(
    buffer(multiply, checked.left), buffer(multiply, checked.right),
    buffer(multiply, checked.table), buffer(multiply, Array(27).fill(0)),
    buffer(multiply, Array(18).fill(0)), buffer(multiply, Array(30).fill(0)),
    buffer(multiply, Array(12).fill(0)), buffer(multiply, Array(3).fill(0)),
    buffer(multiply, Array(9).fill(0)), output), 0n);
  assert.deepEqual(output.toArray(), checked.nativeProduct.map(BigInt));

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row0-general-ideal-maps-check-v1",
    correspondenceResultSha256: adapter.CORRESPONDENCE_SHA256,
    receiptSha256: v2.sha256Canonical(receipt),
    contentSha256: receipt.contentSha256,
    factorBasePrimeRoundTrips: 66,
    arbitraryIntegralAndFractionalSupportedIdeals: true,
    exactSmithReductionWitnesses: true,
    combineLawReplayed: true,
    nativeTensorAndIdealProductReplayed: true,
    sourceMutationsRejected: checked.mutationsRejected,
    qualifiedTiming: false,
  })}\n`);
}

main(process.argv[2]).catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
