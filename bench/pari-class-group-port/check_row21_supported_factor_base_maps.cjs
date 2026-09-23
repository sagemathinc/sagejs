"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const expected = "92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03";
const sourcePath = process.argv[2] ?? "/scratch/sagejs-row21-final-owner-v2/row21-final-92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03.json.gz";
const raw = zlib.gunzipSync(fs.readFileSync(sourcePath));
assert.equal(crypto.createHash("sha256").update(raw).digest("hex"), expected);
const envelope = JSON.parse(raw);

const program = String.raw`
import copy,json,sys
from importlib import import_module
m=import_module('bench.pari-class-group-port.row21_supported_factor_base_maps')
p=json.load(sys.stdin)['payload']
mutation=sys.argv[1]
if mutation=='relation': p['relations']['recordsColumnMajor'][0]='2'
elif mutation=='generator': p['relations']['generators'][0]='3'
elif mutation=='ideal': p['factorBase']['value']['factorBase']['ideals'][0][0]='3'
elif mutation=='inverse': p['classGroup']['presentation']['rightInverse'][0]=str(int(p['classGroup']['presentation']['rightInverse'][0])+1)
try:
 r=m.replay_supported_maps(p)
 if mutation=='factor-claim':
  q=r['probes'][0]; bad=list(q['factorBaseExponents']);bad[1]=1
  m.factor_supported(p,q['idealHnf'],bad)
 print(json.dumps(r,sort_keys=True,separators=(',',':')))
except Exception as e:
 print(type(e).__name__+': '+str(e),file=sys.stderr);sys.exit(2)
`;

function run(mutation = "none") {
  return spawnSync("python", ["-c", program, mutation], {
    cwd: path.resolve(__dirname, "../.."),
    encoding: "utf8",
    input: JSON.stringify(envelope),
    maxBuffer: 64 * 1024 * 1024,
  });
}

const first = run();
assert.equal(first.status, 0, first.stderr);
const second = run();
assert.equal(second.status, 0, second.stderr);
assert.equal(first.stdout, second.stdout, "canonical replay changed");
const report = JSON.parse(first.stdout);
assert.equal(report.arbitraryIdealMap, false);
assert.deepEqual(report.maps, { combine: true, factor: true, reduce: true });
assert.equal(report.relationIdentitiesReplayed, 32);
assert.equal(report.probeCount, 5);
assert.equal(report.combineChecked, true);
for (const mutation of ["relation", "generator", "ideal", "inverse", "factor-claim"]) {
  const rejected = run(mutation);
  assert.notEqual(rejected.status, 0, `${mutation} mutation was accepted`);
}
console.log(JSON.stringify({
  schema: report.schema,
  sourceSha256: expected,
  reportSha256: crypto.createHash("sha256").update(first.stdout).digest("hex"),
  relationIdentitiesReplayed: report.relationIdentitiesReplayed,
  probeCount: report.probeCount,
  rejectedMutations: 5,
  arbitraryIdealMap: report.arbitraryIdealMap,
}));
