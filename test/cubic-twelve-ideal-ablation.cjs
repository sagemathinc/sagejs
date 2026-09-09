// sagejs-test-tier: unit
"use strict";
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const {variants}=require('../bench/class-unit-groups/diagnose-cubic-twelve-ideal-build.cjs');
test('twelve-ideal ablation varies scheduling guards independently and nothing else',()=>{
  const source=require('./fixtures/cubic-source-baseline.cjs').cubicSourceBaseline();
  const candidates=variants(source);
  assert.deepEqual(candidates.map(c=>[c.staging_limit,c.ordering_limit]),[[11,11],[12,11],[11,12],[12,12]]);
  assert.equal(candidates[0].source,source);
  for(const c of candidates)assert.equal(c.source
    .replace('and factor_count <= 12\n','and factor_count <= 11\n')
    .replace('_CUBIC_NARROW_ADJACENT_MAX_FACTORS = 12\n','_CUBIC_NARROW_ADJACENT_MAX_FACTORS = 11\n'),source);
  assert.throws(()=>variants(source.replace('and factor_count <= 11\n','and factor_count <= 10\n')));
  assert.throws(()=>variants(source.replace('_CUBIC_NARROW_ADJACENT_MAX_FACTORS = 11\n','')));
});
