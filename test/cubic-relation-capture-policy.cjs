// sagejs-test-tier: unit
"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {captureSource}=require('../bench/class-unit-groups/diagnose-cubic-relation-capture-build.cjs');
const {radiusSource}=require('../bench/class-unit-groups/diagnose-cubic-radius-build.cjs');
test('raw relation capture preserves the search and can only decline',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/lib/sagejs/number_fields/cubic_class_number_native.py'),'utf8');
  const marker='        uncompacted_relation_count: uint64 = relation_count\n';
  const [before,after]=source.split(marker);
  const captured=captureSource(source);
  assert.ok(captured.startsWith(before));
  assert.ok(captured.endsWith(marker+after));
  const injection=captured.slice(before.length,captured.length-marker.length-after.length);
  assert.ok(injection.endsWith('        return False\n'));
  assert.ok(injection.includes('output[63] = 900'));
  assert.ok(!injection.includes('return True'));
  assert.throws(()=>captureSource(source.replace(marker,'')));
  assert.throws(()=>captureSource(source+marker));
});
test('radius ablation changes only the nonscalar bound comparison',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/lib/sagejs/number_fields/cubic_class_number_native.py'),'utf8');
  assert.equal(radiusSource(source).replace('    elif bound_two > bound:\n','    elif bound_two < bound:\n'),source);
  assert.throws(()=>radiusSource(radiusSource(source)));
});
