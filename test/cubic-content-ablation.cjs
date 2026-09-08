// sagejs-test-tier: unit
"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {contentSource,normalization}=require('../bench/class-unit-groups/diagnose-cubic-content-build.cjs');
test('content ablation changes only candidate coordinates before exact authentication',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/lib/sagejs/number_fields/cubic_class_number_native.py'),'utf8');
  const candidate=contentSource(source);
  assert.equal(candidate.replace(normalization,''),source);
  assert.throws(()=>contentSource(candidate));
  assert.throws(()=>contentSource(''));
});
test('ordinary Python content reduction preserves scalars and produces primitive nonscalars',()=>{
  const program=`import math, itertools
def _cubic_coordinates_are_scalar(workspace,a,b,c):
    return b == 0 and c == 0
def _cubic_extended_gcd(a,b):
    assert a >= 0 and b >= 0
    return math.gcd(a,b),0,0
def normalize(coordinate_zero,coordinate_one,coordinate_two):
    workspace = None
${normalization}    return coordinate_zero,coordinate_one,coordinate_two
count=0
for a in itertools.chain(itertools.product(range(-5,6),repeat=3), [(2**300, 2**250, 0), (-2**300,0,2**250)]):
    b=normalize(*a)
    assert normalize(*b)==b
    if a[1] == 0 and a[2] == 0:
        assert a==b
    else:
        g=math.gcd(*a)
        assert g>0 and tuple(g*x for x in b)==a
        assert math.gcd(*b)==1
    count+=1
assert count==1333
print(count)
`;
  const result=spawnSync('python3',['-c',program],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout.trim(),'1333');
});
