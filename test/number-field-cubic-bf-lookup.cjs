// sagejs-test-tier: specialized
"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),test=require('node:test');
const {pythonExecutable}=require('../tools/python-executable.cjs');
const {initialVolumeSource}=require('../bench/class-unit-groups/diagnose-cubic-initial-volume-build.cjs');
const {bfLookupSource}=require('../bench/class-unit-groups/diagnose-cubic-bf-lookup-build.cjs');
test('BF lookup preserves first-match indices, complete plan order and capacity failures',t=>{
const original=fs.readFileSync(path.resolve(__dirname,'../src/lib/sagejs/number_fields/cubic_class_number_native.py'),'utf8');
const result=spawnSync(pythonExecutable(),['-c',String.raw`
import ast,collections,json,random,sys
old,new=json.load(sys.stdin)
maps=[{n.name:n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef)} for s in (old,new)]
assert {n for n in maps[0] if ast.dump(maps[0][n])!=ast.dump(maps[1][n])}=={'_cubic_prepare_bf_plan'}
ns={'_CUBIC_ANALYTIC_VALUE_OFFSET':100}
exec('from __future__ import annotations\n'+ast.unparse(maps[1]['_cubic_bf_value_index']),ns)
lookup=ns['_cubic_bf_value_index'];rng=random.Random(92331);cases=0
for _ in range(500):
 header=[rng.randrange(1,100) for _ in range(5)];tail=sorted(set(rng.randrange(2,200) for _ in range(50))-set(header));values=header+tail
 if _%3==0:values[3]=2**300+17
 w={100+i:v for i,v in enumerate(values)};saved=dict(w)
 for norm in range(1,201):
  assert lookup(w,len(values),norm)==(values.index(norm) if norm in values else len(values))
  cases+=1
 assert w==saved
# Execute each actual planner's term-building suffix. All coefficient layouts
# are permitted here, a stronger set than cubic splitting can produce.
def run(which,coefficients,header,max_terms,max_values):
 body=maps[which]['_cubic_prepare_bf_plan'].body
 start=next(i for i,n in enumerate(body) if isinstance(n,ast.AnnAssign) and getattr(n.target,'id',None)=='analytic_value_count')
 fn=ast.FunctionDef(name='suffix',args=ast.arguments(posonlyargs=[],args=[],kwonlyargs=[],kw_defaults=[],defaults=[]),body=body[start:],decorator_list=[])
 w=collections.defaultdict(int,{2000+i:v for i,v in enumerate(coefficients)})
 env={'analytic_workspace':w,'_CUBIC_ANALYTIC_COEFFICIENT_OFFSET':2000,'_CUBIC_ANALYTIC_VALUE_OFFSET':100,
  '_CUBIC_ANALYTIC_TERM_OFFSET':4000,'_CUBIC_ANALYTIC_TERM_STRIDE':5,'_CUBIC_ANALYTIC_MAX_TERMS':max_terms,
  '_CUBIC_ANALYTIC_MAX_VALUES':max_values,'analytic_threshold':header[0],'absolute_discriminant':header[3],
  'class_number_upper':header[4],'zero':0,'_cubic_bf_value_index':lookup}
 exec('from __future__ import annotations\n'+ast.unparse(ast.fix_missing_locations(fn)),env)
 result=env['suffix']()
 return result,dict(w)
plans=0
for _ in range(150):
 threshold=rng.randrange(10,150);coeff=[rng.randrange(-1,3) for _ in range(threshold)]
 header=[threshold,threshold//9,3*threshold,rng.randrange(2,200),rng.randrange(1,40)]
 for mt,mv in [(1000,1000),(0,1000),(3,1000),(1000,5),(1000,8)]:
  assert run(0,coeff,header,mt,mv)==run(1,coeff,header,mt,mv)
  plans+=1
print(cases,'first-match lookups;',plans,'actual planner suffixes including exact partial state on failures')
`],{input:JSON.stringify([initialVolumeSource(original,true),bfLookupSource(original)]),encoding:'utf8',timeout:60000});
assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);t.diagnostic(result.stdout.trim());
});
