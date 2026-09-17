#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const child = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const fixtures = require("./unit-bridge-cubic-fixtures.json");

function run(command, args, options = {}) {
  const answer = child.spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  assert.equal(answer.status, 0, answer.stderr || answer.stdout);
  return answer.stdout.trim();
}

const oracle = JSON.parse(
  run("node", [path.join(__dirname, "check_unit_bridge_cubic.cjs")], {
    env: { ...process.env, SAGEJS_DUMP_UNIT_ORACLE: "1" },
  }),
);
const item = fixtures.cases[0];
const result = JSON.parse(
  run(
    "python3",
    [
      "-c",
      String.raw`
import importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path.insert(0,sys.argv[1]);d=json.load(sys.stdin);q=d['item'];E=d['oracle']
c=importlib.import_module('bench.pari-class-group-port.unit_component_cubic')
f=importlib.import_module('bench.pari-class-group-port.class_group_final_state')
sys.path.insert(1,sys.argv[2]);b=importlib.import_module('bench.pari-class-group-port.unit_bridge_cubic')
I=lambda n:[0]*n;F=lambda n:[0.0]*n;n=q['columns'];sq=n*n
a=[[int(x) for x in q['accepted_arch']],[int(x) for x in q['relation_lattice']],n,[int(x) for x in q['regulator']],I(2*n),I(4),I(2*n),I(42),I(18),I(42),I(18),I(6),I(5),F(5),I(5),I(2*n),I(sq),I(sq),F(sq),I(sq),F(sq),I(sq),F(n),I(n),F(2*n),F(sq),I(n),I(n),I(n),F(n),F(n),F(n),I(n),I(6),I(3),I(6),I(4),I(4),F(4),I(4),F(4),I(4),F(2),I(2),F(6),F(4),I(2),I(3),I(3),F(3),F(3),F(3),I(3),I(2)]
assert b.pari_cubic_unit_bridge_prepare(*a)==0
retry=[int(v) for t in E['input'] for v in t];link=I(3);assert b.pari_cubic_unit_retry_link(a[10],retry,link)==0
provenance=I(2*n);factor=[int(v) for v in E['factor']];assert b.pari_cubic_unit_compose_provenance(a[6],n,factor,provenance)==0
candidate={'field_id':'pari-2.17.4:'+q['polynomial'],'class_number':'1','invariant_factors':[],'relation_shape':['2',str(n)],'relation_matrix':[str(v) for v in q['relation_lattice']],'hnf_shape':['2',str(n)],'hnf_matrix':[str(v) for v in q['relation_lattice']],'transformed_logs':[str(v) for v in q['accepted_arch']],'regulator_triplet':[str(v) for v in q['regulator']],'driver_state':{},'relation_state':{},'owner_lengths':{},'expected_unit_rank':'2'}
ranges=[[0,7],[7,7],[21,7],[28,7]]
units=[int(v) for row in E['units'] for v in row];logs=[int(v) for t in E['logs'] for v in t];tensor=[int(v) for row in E['tensor'] for v in row]
out=c.make_real_cubic_unit_component('real-cubic-retry',1,candidate,'a'*64,units,logs,tensor,provenance,n,link,ranges)
validated=f._validate_linked_units(out.evidence,candidate)
assert out.candidate_sha256==f.canonical_component_sha256(candidate)
assert validated==json.loads(json.dumps(out.evidence,sort_keys=True))
failures=0
for mutation in ('unit','provenance','link'):
    try:
        uu=units[:];pp=provenance[:];ll=link[:]
        if mutation=='unit': uu[0]+=1
        if mutation=='provenance': pp[:n]=[0]*n
        if mutation=='link': ll[2]=0
        c.make_real_cubic_unit_component('real-cubic-retry',1,candidate,'a'*64,uu,logs,tensor,pp,n,ll,ranges)
    except f.AssemblyFailure: failures+=1
assert failures==3
detnum=int(out.evidence['regulator_determinant_numerator']);detden=int(out.evidence['regulator_determinant_denominator'])
print(json.dumps({'terminal':out.terminal_status,'rank':validated['rank'],'norms':validated['claimed_norms'],'provenanceEntries':len(provenance),'retryLinkState':link,'regulatorBits':[detnum.bit_length(),detden.bit_length()],'atomicFailures':failures,'candidateSha256':out.candidate_sha256}))
`,
      root,
      path.join(root, "src/lib"),
    ],
    { input: JSON.stringify({ item, oracle }) },
  ),
);
assert.equal(result.terminal, "getfu-and-cleanarch-complete");
assert.deepEqual(result.norms.map(String), ["-1", "-1"]);
assert.equal(result.atomicFailures, 3);
console.log(JSON.stringify({ cases: 1, source: "PARI-2.17.4", ...result }));
