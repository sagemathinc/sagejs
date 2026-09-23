"use strict";

// Focused cold replay for a data-only neutral result.  The Python child reads
// only the canonical envelope named on the command line; no row publisher or
// frozen PARI answer is imported.

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const filename = process.argv[2];
assert.equal(typeof filename, "string",
  "usage: node check_independent_class_generator_replay.cjs RESULT.json");

const program = String.raw`
import copy,importlib,json,sys
sys.path.extend(['src/lib','src/baselib','.'])
m=importlib.import_module('bench.pari-class-group-port.independent_class_generator_replay')
with open(sys.argv[1],encoding='ascii') as stream:
    payload=json.load(stream)['payload']
summary=m.replay_published_class_generators(payload)
owners={owner['name']:owner for owner in payload['storage']}
mutations=[]
for owner_name in ('class-order-principal-coefficients','class-generator-ideals'):
    changed=copy.deepcopy(payload)
    selected=next(owner for owner in changed['storage'] if owner['name']==owner_name)
    selected['entries'][0]=str(int(selected['entries'][0])+1)
    try:
        m.replay_published_class_generators(changed)
    except m.IndependentClassGeneratorReplayFailure:
        mutations.append(owner_name)
    else:
        raise AssertionError('coordinated mathematical mutation was accepted: '+owner_name)
print(json.dumps({'summary':summary,'rejectedMutations':mutations},sort_keys=True))
`;
const run = spawnSync("python3", ["-c", program, path.resolve(filename)], {
  cwd: ROOT,
  encoding: "utf8",
  timeout: 120_000,
  maxBuffer: 8 * 1024 * 1024,
});
assert.equal(run.status, 0, run.stderr || String(run.error));
const report = JSON.parse(run.stdout);
assert.equal(report.summary.factoredPrincipalWitnessesExact, true);
assert.equal(report.summary.orderRelationsReplayed,
  report.summary.generatorCount);
assert.deepEqual(report.rejectedMutations,
  ["class-order-principal-coefficients", "class-generator-ideals"]);
console.log(JSON.stringify(report));
