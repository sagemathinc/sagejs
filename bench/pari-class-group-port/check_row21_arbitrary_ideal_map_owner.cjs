#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const sourcePath = process.argv[2] ??
  "/scratch/sagejs-row21-final-owner-v2/row21-final-92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03.json.gz";
const gp = process.argv[3] ??
  "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4/Olinux-x86_64/gp-dyn";
const owner = require("./row21_arbitrary_ideal_map_owner.cjs");

const requestProgram = String.raw`
import gzip,json,sys
from fractions import Fraction
from importlib import import_module
m=import_module('bench.pari-class-group-port.row21_supported_factor_base_maps')
p=json.load(gzip.open(sys.argv[1],'rt'))['payload'];s=m._source(p)
prime=s['ideals'][0]
principal=m._principal_scaled_hnf(s['table'],list(map(Fraction,[2,1,0,1,0])),1)
opaque=m._flat(m._arithmetic()._ideal_product(s['table'],m._columns(prime),m._columns(principal)))
q={'schema':sys.argv[2],'ideals':[{'numeratorHnf':list(map(str,prime)),'denominator':'1'},{'numeratorHnf':list(map(str,opaque)),'denominator':'3'}],'combinePairs':[[0,1]]}
json.dump(q,sys.stdout,separators=(',',':'))
`;
const generated = spawnSync("python3", ["-c", requestProgram, sourcePath,
  owner.REQUEST_SCHEMA], { cwd: ROOT, encoding: "utf8", timeout: 30_000 });
assert.equal(generated.status, 0, generated.stderr || String(generated.error));
const request = JSON.parse(generated.stdout);

const first = owner.run({ sourcePath, request, gp });
const second = owner.run({ sourcePath, request, gp });
assert.deepEqual(first, second, "row-21 arbitrary map owner changed");
assert.equal(first.arbitraryIdealMap, true);
assert.equal(first.nativeMap, false);
assert.deepEqual(first.maps, { factor: true, reduce: true, combine: true });
assert.equal(first.evidence.length, 3);
assert.equal(first.owner.splitExecutedTransitively, true);
assert.equal(first.owner.splitTapeRetained, false);
assert.equal(first.owner.idealredMultiplierRetained, true);
assert.equal(first.owner.denominatorEvidenceRetained, true);

const mutationProgram = String.raw`
import copy,gzip,json,sys
from importlib import import_module
m=import_module('bench.pari-class-group-port.row21_arbitrary_ideal_maps')
x=json.load(sys.stdin);p=json.load(gzip.open(x['source'],'rt'))['payload']
for label in ('generator','idealred','combine'):
 e=copy.deepcopy(x['evidence'])
 if label=='generator':e[0]['principalGeneratorNumerator'][0]=str(int(e[0]['principalGeneratorNumerator'][0])+1)
 elif label=='idealred':e[1]['reductionMultiplierNumerator'][0]=str(int(e[1]['reductionMultiplierNumerator'][0])+1)
 else:e[2]['normalizedNumeratorHnf'][0]=str(int(e[2]['normalizedNumeratorHnf'][0])+1)
 try:
  if label=='combine':m.verify_combine(p,e[0],e[1],e[2])
  else:m.verify_owner_candidate(p,x['request']['ideals'][0 if label=='generator' else 1],e[0 if label=='generator' else 1])
 except m.Row21ArbitraryMapFailure:continue
 raise AssertionError(label+' evidence mutation was accepted')
print('3')
`;
const mutationRun = spawnSync("python3", ["-c", mutationProgram], {
  cwd: ROOT, encoding: "utf8",
  input: JSON.stringify({ source: sourcePath, request, evidence: first.evidence }),
  timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
});
assert.equal(mutationRun.status, 0, mutationRun.stderr || String(mutationRun.error));
assert.equal(mutationRun.stdout.trim(), "3");

for (const mutate of [
  changed => { changed.ideals[0].denominator = "0"; },
  changed => { changed.ideals[0].numeratorHnf[0] = (1n << 300n).toString(); },
  changed => { changed.combinePairs[0] = [0, 9]; },
  changed => { changed.unreviewed = true; },
]) {
  const changed = structuredClone(request);
  mutate(changed);
  assert.throws(() => owner.run({ sourcePath, request: changed, gp }));
}

process.stdout.write(`${JSON.stringify({ schema:
  "sagejs.pari-class-group/row21-arbitrary-ideal-map-owner-check-v1",
sourceSha256: first.sourceSha256, requestSha256: first.requestSha256,
evidenceCount: first.evidence.length, rejectedRequestMutations: 4,
rejectedEvidenceMutations: 3,
arbitraryIdealMap: true, nativeMap: false,
splitTapeRetained: false, bounds: first.bounds }, null, 2)}\n`);
