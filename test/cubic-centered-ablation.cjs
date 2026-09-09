// sagejs-test-tier: unit
"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {centeredSource,mapping}=require('../bench/class-unit-groups/diagnose-cubic-centered-build.cjs');
test('centered source preserves cursor advancement and all acceptance checks',()=>{
  const source=require('./fixtures/cubic-source-baseline.cjs').cubicSourceBaseline();
  const candidate=centeredSource(source);
  assert.equal(candidate.replace(mapping,'').replace('                centered_zero,\n                centered_one,\n                centered_two,\n',
    '                coefficient_zero,\n                coefficient_one,\n                coefficient_two,\n'),source);
  assert.throws(()=>centeredSource(candidate));
});
test('ordinary Python centered mapping is a bijection of every admitted coordinate range',()=>{
  const body=mapping.split('\n').map(line=>line.slice(4)).join('\n');
  const program=`def mapped(coefficient_zero,coefficient_one,coefficient_two,limit_zero,limit_one,limit_two):
${body}    return centered_zero,centered_one,centered_two
for limit in range(65):
    rows=[mapped(i,i,i,limit,limit,limit) for i in range(-limit,limit+1)]
    assert rows[0]==(0,0,0)
    for k in range(3):
        values=[row[k] for row in rows]
        assert sorted(values)==list(range(-limit,limit+1))
        assert values==[0]+[x for j in range(1,limit+1) for x in (j,-j)]
print(65)
`;
  const r=spawnSync('python3',['-c',program],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'65');
});
