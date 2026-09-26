#!/usr/bin/env node
// sagejs-test-tier: specialized
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const program = String.raw`
import copy,importlib.util,json,sys
module_path,compact_path,bridge_path=sys.argv[1:]
spec=importlib.util.spec_from_file_location('unit_relation_authority_cubic',module_path);m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
compact=json.load(open(compact_path,encoding='utf-8'));bridge=json.load(open(bridge_path,encoding='utf-8'))['cases'][0]
pool=compact['replay_factor_pool'];columns=int(compact['compact_units']['exponent_shape'][1]);relations=int(bridge['resident_state']['relation_count'])
missing=m.required_relation_map(relations,columns,None)
assert missing is not None and missing.required_entries==511 and missing.layout=='column-major-raw-relations-by-accepted-columns'
# The existing compact fixture openly labels this pool answer-derived.  Its
# identity map exercises the exact verifier without pretending it is the
# absent genuine 73-by-7 relation map.
identity=[int(row==column) for column in range(columns) for row in range(columns)]
generators=[int(v) for row in pool['coordinates'] for v in row]
exponents=[int(v) for v in compact['compact_units']['exponents']]
targets=[int(v) for row in compact['expected_materialized_units'] for v in row]
tensor=[int(v) for v in compact['multiplication_basis']]
verified=m.verify_cubic_relation_units(generators,columns,identity,columns,exponents,targets,tensor)
assert verified['units']==[tuple(targets[:3]),tuple(targets[3:])]
# Signed raw powers genuinely need rational arithmetic: neither copy of 2 is
# a unit, but their quotient is the accepted unit 1.
cancellation=m.verify_cubic_relation_units([2,0,0,2,0,0],2,[-1,1],1,[1],[1,0,0],tensor)
assert cancellation['units']==[(1,0,0)]
rejected=0
for kind in ('map-shape','map-value','target','tensor'):
    transform=identity[:];wanted=targets[:];multiplication=tensor[:]
    if kind=='map-shape': transform.pop()
    elif kind=='map-value': transform[-1]=0
    elif kind=='target': wanted[0]+=1
    else: multiplication[0]+=1
    try:m.verify_cubic_relation_units(generators,columns,transform,columns,exponents,wanted,multiplication)
    except m.RelationUnitAuthorityFailure:rejected+=1
assert rejected==4
print(json.dumps({'rawRelations':relations,'acceptedColumns':columns,'missingEntries':missing.required_entries,'retainedRawMap':False,'exactVerifierReplay':verified['correspondence'],'nonunitCancellation':True,'answerDerivedReplayOnly':True,'mutationsRejected':rejected},sort_keys=True))
`;
const result = spawnSync(
  "/usr/bin/python3",
  [
    "-c",
    program,
    path.join(__dirname, "unit_relation_authority_cubic.py"),
    path.join(__dirname, "compact_unit_result_fixture.json"),
    path.join(__dirname, "unit-bridge-cubic-fixtures.json"),
  ],
  { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);
