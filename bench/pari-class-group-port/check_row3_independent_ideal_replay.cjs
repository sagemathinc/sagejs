#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const filename = process.argv[2];
assert.equal(typeof filename, "string",
  "usage: check_row3_independent_ideal_replay.cjs RESULT.json");

const program = String.raw`
import copy,importlib,json,sys
sys.path[:0]=['src/lib','src/baselib','.']
m=importlib.import_module('bench.pari-class-group-port.row3_independent_ideal_replay')
with open(sys.argv[1],encoding='ascii') as stream: payload=json.load(stream)['payload']
summary=m.replay_row3_retained_ideal_evidence(payload)
rejected=[]
for owner_name,offset in [('class-presentation',0),('class-generator-ideal',0),('class-order-relation-indices',0)]:
 changed=copy.deepcopy(payload)
 owner=next(value for value in changed['storage'] if value['name']==owner_name)
 if owner_name=='class-generator-ideal': owner['entries']=['0']*len(owner['entries'])
 elif owner_name=='class-order-relation-indices': owner['entries'][offset]='-1'
 else: owner['entries'][offset]=str(int(owner['entries'][offset])+1)
 try: m.replay_row3_retained_ideal_evidence(changed)
 except m.Row3IndependentIdealReplayFailure: rejected.append(owner_name)
 else: raise AssertionError('mathematical mutation accepted: '+owner_name)
print(json.dumps({'summary':summary,'rejectedMutations':rejected},sort_keys=True))
`;
const run = spawnSync("python3", ["-c", program, path.resolve(filename)], {
  cwd: ROOT, encoding: "utf8", timeout: 30_000,
  maxBuffer: 8 * 1024 * 1024,
});
assert.equal(run.status, 0, run.stderr || String(run.error));
const report = JSON.parse(run.stdout);
assert.equal(report.summary.classNumber, 6);
assert.deepEqual(report.summary.invariantFactors, [6]);
assert.equal(report.summary.presentationDeterminant, 6);
assert.equal(report.summary.presentationContent, 1);
assert.equal(report.summary.compactRelationTermCount, 443);
assert.equal(report.summary.idealGeneratorReplayComplete, false);
assert.deepEqual(report.rejectedMutations, ["class-presentation",
  "class-generator-ideal", "class-order-relation-indices"]);
console.log(JSON.stringify(report));
