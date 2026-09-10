// sagejs-test-tier: specialized
"use strict";
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const path=require('node:path');
const test=require('node:test');

test('rank recovery visits beyond the admission quota without changing quotas or capacities',()=>{
  const run=cp.spawnSync('python3',['-c',String.raw`
import ast, importlib.util, json
from pathlib import Path
from types import SimpleNamespace

p=Path('bench/class-unit-groups/cubic-rank-search-budget.py')
spec=importlib.util.spec_from_file_location('budget',p)
budget=importlib.util.module_from_spec(spec);spec.loader.exec_module(budget)
source=Path('test/fixtures/cubic-powered-rank-search.py').read_text()
changed=budget.transform(source)
malformed=ast.parse(source)
call=next(n for n in ast.walk(malformed) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='_cubic_append_initial_volume_ellipsoid')
call.args[11]=ast.Name(id='relation_capacity',ctx=ast.Load())
for bad in (changed, source+source, ast.unparse(malformed)):
    try: budget.transform(bad)
    except ValueError: pass
    else: raise AssertionError('malformed or repeated transformation accepted')
assert budget.transform('# Unicode é\n'+source)=='# Unicode é\n'+changed

class Owner:
    def __init__(self,values=None): self.values=dict(values or {})
    def __getitem__(self,key): return self.values.get(key,0)
    def __setitem__(self,key,value): self.values[key]=value

def invoke(text,n,rows,capacity,quotient=False,remaining=50):
    layout=SimpleNamespace(factors=n,modular_rank=999,compound=100)
    visits=Owner({(0,0):2,(0,7):remaining})
    search=SimpleNamespace(visits=visits,parameters=Owner())
    modular=Owner({999:n if quotient else n-1})
    calls=[]
    def append(*args):
        calls.append(args)
        r,cap,target,visit=args[7],args[8],args[11],args[22]
        assert cap==capacity
        assert target==min(r+4 if quotient else n+6,capacity)
        # Model the actual enumerator's while guard and one newly independent
        # exact row; the mathematical ideal arithmetic is not mocked as proof.
        if r>=visit: return r,0,r,1,0,0,0,0
        assert r<cap and visit<=cap
        modular[999]=n
        return r+1,1,r+1,1,0,0,0,1
    scope={name:object for name in ['CubicStorageLayout','CubicSearchWorkspace','UInt64Buffer','FmpzMatrix']}
    scope.update(uint64=int,checked_uint64=int,_CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES=4096,
                 _cubic_append_initial_volume_ellipsoid=append)
    tree=ast.parse(text)
    fn=next(node for node in tree.body if isinstance(node,ast.FunctionDef))
    exec(compile(ast.Module(body=[fn],type_ignores=[]),'rank-search-fixture.py','exec'),scope)
    result=scope[fn.name](layout,search,modular,None,None,None,n,0,rows,capacity,rows,1,
                          remaining,1,0,0,1,0,1,0,0,1,1,quotient)
    return result, visits.values, calls

overflow=ordinary=quotient_cases=0
for n in range(2,34):
    cap=n+30
    for extra in range(6,16):
        old=invoke(source,n,n+extra,cap)
        new=invoke(changed,n,n+extra,cap)
        assert old[0]==(n+extra,n+extra,-1)
        assert new[0]==(n+extra+1,n+extra+1,1)
        assert len(old[2])==len(new[2])==1
        assert old[2][0][11]==new[2][0][11]==n+6
        assert new[2][0][22]==cap
        assert new[1][0,7]==49
        overflow+=1
    for extra in range(6):
        old,new=invoke(source,n,n+extra,cap),invoke(changed,n,n+extra,cap)
        assert old[:2]==new[:2]
        ordinary+=1
    for extra in range(16):
        old,new=invoke(source,n,n+extra,cap,True),invoke(changed,n,n+extra,cap,True)
        assert old[:2]==new[:2]
        assert old[2][0][11:]==new[2][0][11:]
        quotient_cases+=1
    for text in (source,changed):
        full=invoke(text,n,cap,cap)
        assert full[0]==(cap,cap,-1) and not full[2]
        exhausted=invoke(text,n,n+8,cap,remaining=0)
        assert exhausted[0]==(n+8,n+8,1) and not exhausted[2]
print(json.dumps(dict(overflow=overflow,ordinary=ordinary,quotient=quotient_cases)))
`],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:30000,maxBuffer:2e6});
  assert.equal(run.status,0,run.stderr||run.stdout);
  assert.deepEqual(JSON.parse(run.stdout),{overflow:320,ordinary:192,quotient:512});
});
