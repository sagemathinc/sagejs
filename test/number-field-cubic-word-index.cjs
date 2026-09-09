// sagejs-test-tier: specialized
"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),test=require("node:test");
const {spawnSync}=require("node:child_process");
const {pythonExecutable}=require("../tools/python-executable.cjs");
const {bfLookupSource}=require("../bench/class-unit-groups/diagnose-cubic-bf-lookup-build.cjs");
const {wordIndexSource,aliases,functions}=require("../bench/class-unit-groups/diagnose-cubic-word-index-build.cjs");
test("bounded BF word indices preserve source operations, index traces, and failure state",t=>{
  const original=fs.readFileSync(path.resolve(__dirname,"../src/lib/sagejs/number_fields/cubic_class_number_native.py"),"utf8");
  const result=spawnSync(pythonExecutable(),["-c",String.raw`
import ast,copy,json,random,sys
old,new,aliases,names=json.load(sys.stdin)
trees=[ast.parse(s) for s in (old,new)]
maps=[{n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)} for tree in trees]
assert set(maps[0])==set(maps[1])
reverse={v:k for k,v in aliases.items()}
class Restore(ast.NodeTransformer):
 def visit_AnnAssign(self,n):
  if isinstance(n.target,ast.Name) and n.target.id in reverse:
   assert isinstance(n.annotation,ast.Name) and n.annotation.id=='uint64'
   assert isinstance(n.value,ast.Name) and n.value.id==reverse[n.target.id]
   return None
  return self.generic_visit(n)
 def visit_Name(self,n):
  return ast.copy_location(ast.Name(id=reverse.get(n.id,n.id),ctx=n.ctx),n)
for name in maps[0]:
 restored=Restore().visit(copy.deepcopy(maps[1][name]))
 assert ast.dump(maps[0][name])==ast.dump(restored),name
assert {n for n in maps[0] if ast.dump(maps[0][n])!=ast.dump(maps[1][n])}==set(names)
# Fixed native layout and a store that rejects any out-of-range intermediate.
class Workspace:
 def __init__(self,coeff):self.values=coeff+[0]*(3670-len(coeff));self.trace=[]
 def __getitem__(self,k):
  assert 0<=k<3670,k
  self.trace.append(('get',k));return self.values[k]
 def __setitem__(self,k,v):
  assert 0<=k<3670,k
  self.trace.append(('set',k,v));self.values[k]=v
constants={'_CUBIC_ANALYTIC_COEFFICIENT_OFFSET':0,'_CUBIC_ANALYTIC_TERM_OFFSET':1494,
 '_CUBIC_ANALYTIC_TERM_STRIDE':5,'_CUBIC_ANALYTIC_VALUE_OFFSET':3414}
def run(which,coeff,threshold,discriminant,h,max_terms,max_values):
 body=maps[which]['_cubic_prepare_bf_plan'].body
 start=next(i for i,n in enumerate(body) if isinstance(n,ast.AnnAssign) and getattr(n.target,'id',None)=='analytic_value_count')
 declarations=[n for n in body if isinstance(n,ast.AnnAssign) and getattr(n.target,'id',None) in reverse]
 fn=ast.FunctionDef(name='suffix',args=ast.arguments(posonlyargs=[],args=[],kwonlyargs=[],kw_defaults=[],defaults=[]),body=declarations+body[start:],decorator_list=[])
 w=Workspace(coeff)
 env={**constants,'analytic_workspace':w,'_CUBIC_ANALYTIC_MAX_TERMS':max_terms,
  '_CUBIC_ANALYTIC_MAX_VALUES':max_values,'analytic_threshold':threshold,
  'absolute_discriminant':discriminant,'class_number_upper':h,'zero':0}
 exec('from __future__ import annotations\n'+ast.unparse(maps[which]['_cubic_bf_value_index']),env)
 exec('from __future__ import annotations\n'+ast.unparse(ast.fix_missing_locations(fn)),env)
 result=env['suffix']()
 return result,w.values,w.trace
rng=random.Random(202609091);count=0;successes={};failures={}
for threshold in [10,149,997,1494]:
 for iteration in range(20):
  # Sparse and dense coefficient layouts exercise success and capacity returns.
  coeff=[rng.choice([0]*19+[-1,1,2]) if iteration%2 else rng.choice([-1,1,2]) for _ in range(threshold)]
  d=2**300+17 if iteration%3==0 else rng.randrange(2,threshold+1)
  h=rng.randrange(1,100)
  for mt,mv in [(384,256),(0,256),(3,256),(384,5),(384,8)]:
   before=run(0,coeff,threshold,d,h,mt,mv)
   assert before==run(1,coeff,threshold,d,h,mt,mv)
   counts=successes if before[0][0] else failures
   counts[threshold]=counts.get(threshold,0)+1
   count+=1
assert all(successes.get(n,0)>0 and failures.get(n,0)>0 for n in [997,1494])
# Machine-word arithmetic is justified by the actual closed caller envelope.
assert 0+1493<1494
assert 1494+5*383+4==3413
assert 3414+255==3669
assert 4*255+3==1023
assert 3669<2**64
print(count,'actual planner suffixes: identical reads, writes, result and partial state; AST restoration exact')
`],{input:JSON.stringify([bfLookupSource(original),wordIndexSource(original),aliases,functions]),encoding:"utf8",timeout:60000});
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);t.diagnostic(result.stdout.trim());
});
test("the compiler selects word indexing only with the explicit local typing",async()=>{
  const {lowerSource}=require("../tools/native-kernel/ir.cjs");
  const source=`from sagejs.native import NativeIntegerVector, native, uint64
OFFSET = 3414
@native
def exact_index(values: NativeIntegerVector, index: uint64) -> int:
    return values[OFFSET + index]
@native
def word_index(values: NativeIntegerVector, index: uint64) -> int:
    offset: uint64 = OFFSET
    return values[offset + index]
`;
  const ir=await lowerSource(source,"cubic-word-index-witness.py");
  function collect(v,out){if(!v||typeof v!=="object")return;if(v.kind==="integer.vector.get")out.push(v.indexType);for(const x of Object.values(v))if(typeof x==="object")collect(x,out);}
  const types=ir.functions.map(f=>{const out=[];collect(f.body,out);return out;});
  assert.deepEqual(types,[["Integer"],["uint64"]]);
});
