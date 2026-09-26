"use strict";

// Cold verifier: only the two named detached JSON artifacts cross the process
// boundary.  No publisher, fresh transaction, or frozen PARI result is loaded.

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const [row19, row23] = process.argv.slice(2);
assert.equal(typeof row19, "string",
  "usage: node check_independent_ideal_replay_rows19_23.cjs ROW19.json ROW23_SOURCE.json[.gz]");
assert.equal(typeof row23, "string");

const program = String.raw`
import copy,gzip,importlib,json,sys
sys.path.extend(['src/lib','src/baselib','.'])
m=importlib.import_module('bench.pari-class-group-port.independent_ideal_replay_rows19_23')
def load(name):
    opener=gzip.open if name.endswith('.gz') else open
    with opener(name,'rt',encoding='ascii') as stream: return json.load(stream)
r19=load(sys.argv[1])['payload']
r23=load(sys.argv[2])
s19=m.replay_row19_retained_witnesses(r19)
s23=m.replay_row23_source_envelope(r23)
rejected=[]

changed=copy.deepcopy(r19)
owner=next(x for x in changed['storage'] if x['name']=='relation-records')
owner['entries'][0]=str(int(owner['entries'][0])+1)
try: m.replay_row19_retained_witnesses(changed)
except m.DetachedIdealReplayFailure: rejected.append('row19-relation-record')
else: raise AssertionError('row-19 relation mutation was accepted')

changed=copy.deepcopy(r19)
owner=next(x for x in changed['storage'] if x['name']=='class-order-witnesses')
decoded=json.loads(bytes(map(int,owner['entries'])))
decoded[0]['principal']['rawRelationCoefficients'][0]=str(
    int(decoded[0]['principal']['rawRelationCoefficients'][0])+1)
owner['entries']=list(map(str,json.dumps(decoded,sort_keys=True,separators=(',',':')).encode()))
owner['logicalLength']=str(len(owner['entries']))
try: m.replay_row19_retained_witnesses(changed)
except m.DetachedIdealReplayFailure: rejected.append('row19-coefficient')
else: raise AssertionError('row-19 coefficient mutation was accepted')

changed=copy.deepcopy(r23)
changed['payload']['classGroup']['compactPrincipalOrderWitnesses'][0][
    'rawRelationCoefficients'][0]='1'
changed['payloadSha256']=m._sha256_canonical(changed['payload'])
try: m.replay_row23_source_envelope(changed)
except m.DetachedIdealReplayFailure: rejected.append('row23-coefficient')
else: raise AssertionError('row-23 coefficient mutation was accepted')

changed=copy.deepcopy(r23)
changed['payload']['classGroup']['generatorIdeals'][0][0]='8'
changed['payloadSha256']=m._sha256_canonical(changed['payload'])
try: m.replay_row23_source_envelope(changed)
except m.DetachedIdealReplayFailure: rejected.append('row23-generator-ideal')
else: raise AssertionError('row-23 generator mutation was accepted')

print(json.dumps({'row19':s19,'row23':s23,'rejectedMutations':rejected},sort_keys=True))
`;
const run = spawnSync("python3", ["-c", program, path.resolve(row19), path.resolve(row23)], {
  cwd: ROOT, encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
});
assert.equal(run.status, 0, run.stderr || String(run.error));
const report = JSON.parse(run.stdout);
assert.equal(report.row19.status, "blocked-by-retained-semantics");
assert.equal(report.row19.orderRelationsReplayed, 9);
assert.equal(report.row19.fullExactIdealReplay, false);
assert.equal(report.row23.status, "complete");
assert.equal(report.row23.fullExactIdealReplay, true);
assert.deepEqual(report.rejectedMutations, ["row19-relation-record",
  "row19-coefficient", "row23-coefficient", "row23-generator-ideal"]);
console.log(JSON.stringify(report));
