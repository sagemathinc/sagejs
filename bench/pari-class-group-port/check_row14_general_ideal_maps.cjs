#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const proofApi = require("./row14_full_raw_smith_ancestry.cjs");
const v2 = require("./class_unit_output_evidence_v2.cjs");

const RESULT = "/scratch/sagejs-row14-fresh-registry-7wM3U3/" +
  "row14-prepared-complete-edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2.json";
const ANCESTRY = "/scratch/row14-full-ancestry-20260918-v2.json";
const METADATA = "/tmp/row14-factor-metadata-transposed-tau.json";
const PYTHON = String.raw`
import copy, importlib, json, sys
root, source_root = sys.argv[1:3]
sys.path.insert(0, root)
sys.path.append(source_root)
m = importlib.import_module('bench.pari-class-group-port.row14_general_ideal_maps')
value = json.load(sys.stdin)
receipt = m.replay_general_maps(value['payload'], value['proof'], value['metadata'])
mutations = []
bad = copy.deepcopy(value['proof'])
offset = (m.TAIL + 1) * m.COLUMNS + (m.TAIL + 1)
bad['material']['v'][offset] = str(int(bad['material']['v'][offset]) + 1)
try: m.replay_general_maps(value['payload'], bad, value['metadata'])
except m.Row14GeneralMapFailure: mutations.append('raw-smith-v')
bad = copy.deepcopy(value['metadata'])
bad['metadata']['factor']['groupTau'][0] = str(
    int(bad['metadata']['factor']['groupTau'][0]) + 1)
try: m.replay_general_maps(value['payload'], value['proof'], bad)
except m.Row14GeneralMapFailure: mutations.append('factor-metadata-tau')
print(json.dumps({'receipt': receipt, 'mutationsRejected': mutations}, separators=(',', ':')))
`;

function main(resultPath = RESULT, ancestryPath = ANCESTRY,
    metadataPath = METADATA) {
  const raw = fs.readFileSync(resultPath);
  const payload = JSON.parse(raw.toString("ascii")).payload;
  const proof = proofApi.buildRow14FullRawSmithAncestry(raw,
    fs.readFileSync(ancestryPath));
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const run = spawnSync("python3", ["-c", PYTHON,
    path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")], {
    input: JSON.stringify({ payload, proof, metadata }), encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024, timeout: 120_000,
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const checked = JSON.parse(run.stdout);
  const receipt = checked.receipt;
  assert.equal(receipt.schema,
    "sagejs.pari-class-group/row14-general-ideal-maps-v1");
  assert.equal(receipt.domain,
    "arbitrary-fractional-quartic-ideal-hnf-supported-on-retained-factor-base");
  assert.deepEqual(receipt.maps, { combine: true, factor: true, reduce: true });
  assert.equal(receipt.factorBasePrimeRoundTrips, 799);
  assert.equal(receipt.fractionalPrincipalDenominatorRoundTrips, 1);
  assert.equal(receipt.outOfSupportRejections, 2);
  assert.equal(receipt.exactRelationWitnessesReplayed, 4);
  const body = { ...receipt };
  delete body.contentSha256;
  assert.equal(receipt.contentSha256, v2.sha256Canonical(body));
  assert.deepEqual(checked.mutationsRejected.sort(),
    ["factor-metadata-tau", "raw-smith-v"]);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row14-general-ideal-maps-check-v1",
    contentSha256: receipt.contentSha256,
    factorBasePrimeRoundTrips: receipt.factorBasePrimeRoundTrips,
    arbitraryIntegralAndFractionalSupportedIdeals: true,
    exactSmithReductionWitnesses: true,
    combineLawReplayed: true,
    sourceMutationsRejected: checked.mutationsRejected,
    qualifiedTiming: false,
  })}\n`);
}

try { main(process.argv[2], process.argv[3], process.argv[4]); }
catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; }
