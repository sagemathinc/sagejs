#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const adapter = require("./row19_class_unit_output_evidence_v2.cjs");
const proofApi = require("./row19_raw_relation_smith_proof.cjs");

const RESULT = "/scratch/sagejs-row19-fresh-transaction-check/" +
  "row19-class-unit-result-a9642e255d536cde1c13740b0452bbdedf917cc851b753c2ec6152df2622eb66.json";
const PYTHON = String.raw`
import copy, hashlib, importlib, json, sys
root, source_root = sys.argv[1:3]
sys.path[:0] = [root, source_root]
m = importlib.import_module('bench.pari-class-group-port.row19_general_ideal_maps')
value = json.load(sys.stdin)
receipt = m.replay_general_maps(value['payload'], value['proof'])
mutations = []
bad = copy.deepcopy(value['proof'])
offset = m.TAIL * m.COLUMNS + m.TAIL
bad['material']['v'][offset] = str(int(bad['material']['v'][offset]) + 1)
try:
    m.replay_general_maps(value['payload'], bad)
except m.Row19GeneralMapFailure:
    mutations.append('raw-smith-v')
bad = copy.deepcopy(value['payload'])
owner = next(x for x in bad['storage'] if x['name'] == 'factor-base')
factor = json.loads(bytes(map(int, owner['entries'])))
factor['tau'][15][0] = str(int(factor['tau'][15][0]) + 1)
raw = json.dumps(factor, separators=(',', ':')).encode('ascii')
owner['entries'] = list(raw)
owner['logicalLength'] = str(len(raw))
try:
    m.replay_general_maps(bad, value['proof'])
except m.Row19GeneralMapFailure:
    mutations.append('factor-base-tau')
print(json.dumps({'receipt': receipt, 'mutationsRejected': mutations}, separators=(',', ':')))
`;

function main(filename = RESULT) {
  const raw = fs.readFileSync(filename);
  const payload = adapter.authenticateRow19Correspondence(raw);
  const proof = proofApi.buildRow19RawRelationSmithProof(raw);
  const run = spawnSync("python3", ["-c", PYTHON,
    path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")], {
    input: JSON.stringify({ payload, proof }), encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024, timeout: 120_000,
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const checked = JSON.parse(run.stdout);
  const receipt = checked.receipt;
  assert.equal(receipt.schema,
    "sagejs.pari-class-group/row19-general-ideal-maps-v1");
  assert.equal(receipt.domain,
    "arbitrary-fractional-cubic-ideal-hnf-supported-on-retained-factor-base");
  assert.deepEqual(receipt.maps, { combine: true, factor: true, reduce: true });
  assert.equal(receipt.factorBasePrimeRoundTrips, 424);
  assert.equal(receipt.integralGeneratorRoundTrips, 9);
  assert.equal(receipt.fractionalPrincipalDenominatorRoundTrips, 1);
  assert.equal(receipt.outOfSupportRejections, 2);
  assert.equal(receipt.exactRelationWitnessesReplayed, 12);
  const body = { ...receipt };
  delete body.contentSha256;
  // The Python canonicalizer recursively sorts keys; independently compare
  // through the shared output-evidence canonicalizer.
  const v2 = require("./class_unit_output_evidence_v2.cjs");
  assert.equal(receipt.contentSha256, v2.sha256Canonical(body));
  assert.deepEqual(checked.mutationsRejected.sort(),
    ["factor-base-tau", "raw-smith-v"]);
  const materials = adapter.row19MapMaterials(proof);
  assert.deepEqual(Object.keys(materials).sort(), ["combine", "factor", "reduce"]);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row19-general-ideal-maps-check-v1",
    correspondenceResultSha256: adapter.CORRESPONDENCE_SHA256,
    receiptSha256: v2.sha256Canonical(receipt),
    contentSha256: receipt.contentSha256,
    mapMaterialSha256: Object.fromEntries(Object.entries(materials)
      .map(([name, value]) => [name, v2.sha256Canonical(value)])),
    factorBasePrimeRoundTrips: 424,
    arbitraryIntegralAndFractionalSupportedIdeals: true,
    exactSmithReductionWitnesses: true,
    combineLawReplayed: true,
    sourceMutationsRejected: checked.mutationsRejected,
    qualifiedTiming: false,
  })}\n`);
}

try { main(process.argv[2]); }
catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
