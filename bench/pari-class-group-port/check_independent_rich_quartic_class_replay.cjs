"use strict";

// Detached replay of rows 13 and 14.  The Python child receives only the two
// neutral result envelopes named on the command line.

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const filenames = process.argv.slice(2);
assert.equal(filenames.length, 2,
  "usage: node check_independent_rich_quartic_class_replay.cjs ROW13.json ROW14.json");

const program = String.raw`
import copy,importlib,json,sys
sys.path[:0]=['src/lib','src/baselib','.']
m=importlib.import_module('bench.pari-class-group-port.independent_rich_quartic_class_replay')
reports=[]
for filename in sys.argv[1:]:
    with open(filename,encoding='ascii') as stream:
        payload=json.load(stream)['payload']
    summary=m.replay_rich_quartic_class(payload)
    rejected=[]
    for owner_name in ('class-order-principal-coefficients','raw-relation-records','class-presentation','class-generator-ideals'):
        changed=copy.deepcopy(payload)
        owner=next(item for item in changed['storage'] if item['name']==owner_name)
        if owner_name=='raw-relation-records':
            coefficients=next(item for item in changed['storage'] if item['name']=='class-order-principal-coefficients')['entries']
            rows=len(next(item for item in changed['storage'] if item['name']=='factor-base-ideals')['entries'])//16
            relation=next(index for index,value in enumerate(coefficients) if int(value))
            owner['entries'][relation*rows]=str(int(owner['entries'][relation*rows])+1)
        else:
            owner['entries'][0]=str(int(owner['entries'][0])+1)
        try:
            m.replay_rich_quartic_class(changed)
        except m.RichQuarticClassReplayFailure:
            rejected.append(owner_name)
        else:
            raise AssertionError('detached mathematical mutation was accepted: '+owner_name)
    reports.append({'summary':summary,'rejectedMutations':rejected})
print(json.dumps({'reports':reports},sort_keys=True))
`;
const run = spawnSync("python3", ["-c", program, ...filenames.map((name) =>
  path.resolve(name))], {
  cwd: ROOT,
  encoding: "utf8",
  timeout: 180_000,
  maxBuffer: 8 * 1024 * 1024,
});
assert.equal(run.status, 0, run.stderr || String(run.error));
const report = JSON.parse(run.stdout);
assert.equal(report.reports.length, 2);
const [row13, row14] = report.reports;
assert.deepEqual(row13.summary.invariantFactors, [2]);
assert.equal(row13.summary.orderRelationsReplayed, 1);
assert.equal(row13.summary.classGeneratorIdealsDirectlyReplayed, 1);
assert.equal(row13.summary.principalRelationsReplayed, 0);
assert.deepEqual(row13.summary.missingOwners, [{
  affectedCheck: "raw-principal-ideal-equations",
  missingOwner: "field-multiplication-table",
}]);
assert.deepEqual(row14.summary.invariantFactors, [8, 24]);
assert.equal(row14.summary.orderRelationsReplayed, 2);
assert.equal(row14.summary.classGeneratorIdealsDirectlyReplayed, 1);
assert.equal(row14.summary.classGeneratorIdealReplayGaps.length, 1);
assert.equal(row14.summary.principalRelationsReplayed, 806);
assert.deepEqual(row14.summary.missingOwners, []);
for (const item of report.reports) {
  assert.equal(item.summary.qualifiedTiming, false);
  assert.deepEqual(item.rejectedMutations, [
    "class-order-principal-coefficients",
    "raw-relation-records",
    "class-presentation",
    "class-generator-ideals",
  ]);
}
console.log(JSON.stringify(report));
