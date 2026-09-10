// sagejs-test-tier: specialized
// Requires CPython and SymPy for independent exact ideal products.
"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),cp=require("node:child_process");
test("bounded ideal-power cache preserves exact powers across eviction and failures",()=>{
 const script=String.raw`"""Independent exact-ideal and fault checks for the emitted cache helper."""
import ast
import importlib.util
import json
import random
from pathlib import Path
from types import SimpleNamespace

root=Path.cwd()
spec=importlib.util.spec_from_file_location('compact',root/'bench/class-unit-groups/cubic-compact-unit.py')
compact=importlib.util.module_from_spec(spec)
spec.loader.exec_module(compact)
oracle=compact.CubicIdealReplay([-1,-1,0,1])
M=oracle.matrix
ideals=[]
from sympy import primerange
for p in primerange(2,300):
    for a in range(p):
        if (a**3-a-1)%p==0:
            ideals.append(oracle.hnf(M.hstack(p*oracle.one,oracle.multiplication_matrix([-a,1,0]))))
assert len(ideals)>32
expected={(i,e):oracle.power(P,e) for i,P in enumerate(ideals) for e in range(1,13)}
cache_spec=importlib.util.spec_from_file_location('cache_transform',root/'bench/class-unit-groups/cubic-bounded-power-cache.py')
cache_module=importlib.util.module_from_spec(cache_spec)
cache_spec.loader.exec_module(cache_module)
tree=ast.parse(cache_module.HELPER)
layout_spec=importlib.util.spec_from_file_location('dimensioned',root/'bench/class-unit-groups/cubic-dimensioned-workspace.py')
layout_module=importlib.util.module_from_spec(layout_spec)
layout_spec.loader.exec_module(layout_module)
original=(root/'src/lib/sagejs/number_fields/cubic_class_number_native.py').read_text()
dimensioned,_layout_report=layout_module.transform(original)
candidate=cache_module.transform(dimensioned)
ast.parse(candidate)
for changed in [candidate,dimensioned.replace('108 * factor_capacity','109 * factor_capacity')]:
    try:
        cache_module.transform(changed)
        raise AssertionError('invalid source accepted')
    except ValueError:
        pass

fn=tree.body[0]
for a in fn.args.args:a.annotation=None
fn.returns=None

class Vector(list):
    def __getitem__(self,i):
        assert isinstance(i,int) and 0<=i<len(self)
        return super().__getitem__(i)
    def __setitem__(self,i,v):
        assert isinstance(i,int) and 0<=i<len(self)
        super().__setitem__(i,int(v))

def read(v,offset):
    return M(3,3,[v[offset+i] for i in range(9)]).T

def write(v,offset,value):
    for i,x in enumerate(list(value.T)):v[offset+i]=x

stats={'lookups':0,'products':0,'faults':0}
def product(layout,v,left,right,dest,_a,_b):
    stats['products']+=1
    write(v,dest,oracle.product(read(v,left),read(v,right)))
    return True

ns={'checked_uint64':int,'_cubic_ideal_product':product}
exec(compile(tree,'cache-helper','exec'),ns)
cache=ns[fn.name]

def setup(slots):
    n=len(ideals)
    layout=SimpleNamespace(factors=n,power=30,power_cache=30+9*n,power_cache_slots=slots)
    v=Vector([0]*(layout.power_cache+101*slots+20))
    for i,P in enumerate(ideals):write(v,layout.power+9*i,P)
    return layout,v

for slots in [1,2,4,16,32]:
    layout,v=setup(slots)
    bases=list(v)[:layout.power_cache]
    requests=[(i,e) for i in range(len(ideals)) for e in range(1,13)]
    requests+=list(reversed(requests))
    rng=random.Random(671+slots)
    requests += [(rng.randrange(len(ideals)),rng.randrange(1,13)) for _ in range(400)]
    for i,e in requests:
        offset=cache(layout,v,i,e,None,None)
        assert offset and read(v,offset)==expected[i,e],(slots,i,e)
        before=stats['products']
        assert cache(layout,v,i,e,None,None)==offset
        assert stats['products']==before
        assert list(v)[:layout.power_cache]==bases
        stats['lookups']+=2
    for i,e in [(len(ideals),1),(0,0),(0,13)]:
        before=list(v)
        assert cache(layout,v,i,e,None,None)==0 and list(v)==before
        stats['faults']+=1

for key,depth in [(-1,1),(len(ideals)+1,1),(0,1),(1,0),(1,13)]:
    layout,v=setup(1);v[layout.power_cache]=key;v[layout.power_cache+1]=depth
    before=list(v)
    assert cache(layout,v,0,2,None,None)==0 and list(v)==before
    stats['faults']+=1

# A failed multiplication can dirty its destination but must not publish it.
layout,v=setup(1)
assert cache(layout,v,0,2,None,None)
old_depth=v[layout.power_cache+1]
def broken(layout,v,left,right,dest,_a,_b):
    v[dest]=1234567
    return False
ns['_cubic_ideal_product']=broken
assert cache(layout,v,0,4,None,None)==0
assert v[layout.power_cache+1]==old_depth==2
ns['_cubic_ideal_product']=product
assert read(v,cache(layout,v,0,4,None,None))==expected[0,4]
# Force an eviction; the new identity starts from its own permanent P.
assert read(v,cache(layout,v,1,4,None,None))==expected[1,4]
assert read(v,cache(layout,v,0,4,None,None))==expected[0,4]
stats['faults']+=1
for slots in [0]:
    layout,v=setup(slots)
    assert cache(layout,v,0,2,None,None)==0
    stats['faults']+=1
print(json.dumps({'status':'pass','ideals':len(ideals),**stats}))
`;
 const run=cp.spawnSync("python3",["-c",script],{encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024});
 assert.equal(run.status,0,run.error?.message||run.stderr);
 const result=JSON.parse(run.stdout);
 assert.equal(result.status,"pass");assert(result.ideals>32);
 assert(result.lookups>=17000);assert(result.faults>=22);
});
