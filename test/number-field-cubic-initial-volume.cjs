// sagejs-test-tier: specialized
"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),{spawnSync}=require("node:child_process"),test=require("node:test");
const {pythonExecutable}=require("../tools/python-executable.cjs");
const {initialVolumeSource}=require("../bench/class-unit-groups/diagnose-cubic-initial-volume-build.cjs");
const {permutedAnalyticResumeSource}=require("../bench/class-unit-groups/diagnose-cubic-analytic-resume-build.cjs");
const original=fs.readFileSync(path.resolve(__dirname,"../src/lib/sagejs/number_fields/cubic_class_number_native.py"),"utf8");
test("lean initial plan removes only unused direction scoring",()=>{
  const {functionSource}=require("../bench/class-unit-groups/diagnose-cubic-initial-volume-build.cjs");
  const before=initialVolumeSource(original),after=initialVolumeSource(original,true);
  const old=functionSource(before,"_cubic_plan_adjacent_ideal");
  const expected=(old.slice(0,old.indexOf("    best_score = -1"))+"    return 4\n").replace("def _cubic_plan_adjacent_ideal(","def _cubic_plan_initial_volume_ideal(");
  assert.equal(functionSource(after,"_cubic_plan_initial_volume_ideal").trim(),expected.trim());
  assert.equal(after.replace(expected, "").replace("plan = _cubic_plan_initial_volume_ideal(","plan = _cubic_plan_adjacent_ideal("),before);
});
test("initial volume visits preserve admission and certification and resume before full rank",t=>{
const result=spawnSync(pythonExecutable(),["-c",String.raw`
import ast,collections,inspect,json,math,sys
from types import SimpleNamespace
before,after=json.load(sys.stdin)
maps=[{n.name:n for n in ast.parse(s).body if isinstance(n,ast.FunctionDef)} for s in (before,after)]
changed={k for k in maps[0] if ast.dump(maps[0][k])!=ast.dump(maps[1][k])}
assert changed=={'_cubic_collect_adjacent_relation_prefix','certified_complex_cubic_class_group_v1'},changed
old=maps[0]['_cubic_append_volume_ideal_ellipsoid'];new=maps[1]['_cubic_append_initial_volume_ellipsoid']
# The new local limit changes only the loop predicate and signature/name.
normalized=ast.parse(ast.unparse(new)).body[0];normalized.name=old.name;normalized.args.args.pop()
loop=next(n for n in normalized.body if isinstance(n,ast.While))
loop.test.values=[n for n in loop.test.values if 'visit_limit' not in ast.unparse(n)]
assert ast.dump(normalized)==ast.dump(old)
names={'_cubic_collect_initial_volume_prefix','_cubic_initial_volume_parameters','_cubic_append_initial_volume_ellipsoid','_cubic_conditional_centered_value'}
ns={'checked_uint64':int,'_FACTOR_OFFSET':0,'_FACTOR_STRIDE':10,'_POWER_OFFSET':0,'_CUBIC_MAX_POWERS':1,
 '_CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES':500,'_CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE':64,
 '_cubic_floor_sqrt':math.isqrt,'_cubic_ceil_sqrt':lambda n:math.isqrt(n)+(math.isqrt(n)**2<n),
 '_cubic_dyadic_ceiling_quotient':lambda a,b:-(-a//b)}
def cube(n):
 lo,hi=0,1
 while hi**3<=n:hi*=2
 while hi-lo>1:
  mid=(lo+hi)//2
  if mid**3<=n:lo=mid
  else:hi=mid
 return lo
ns['_cubic_floor_cube_root']=cube
exec('from __future__ import annotations\n'+'\n'.join(ast.unparse(maps[1][n]) for n in names),ns)
prepare=ns['_cubic_initial_volume_parameters'];collector=ns['_cubic_collect_initial_volume_prefix'];iterator=ns['_cubic_append_initial_volume_ellipsoid']
# In-place preparation equals detached preparation, including large exact data.
for scale in (1,2**300+17):
 for old_bound in (1,1000):
  p={(0,i):v*scale for i,v in enumerate((2,1,0,3,1,4,old_bound,0,0,0,0))};q=dict(p);out={}
  assert prepare(p,0,out)==prepare(q,0,q)==1
  assert q==out and p[0,6]==old_bound*scale

class Scenario:
 def __init__(self,order=(0,1,2),empty=(),fatal=False,closed=False,rank_at=9,stalled=False):
  self.trace=[];self.rows=[];self.prepares=[];self.empty=empty;self.fatal=fatal;self.closed=closed;self.stalled=stalled;self.rank_at=rank_at
  self.search=SimpleNamespace(visits=collections.defaultdict(int),order={(2-i,0):v+1 for i,v in enumerate(order)},integers=collections.defaultdict(int),parameters={},transforms=None)
  for i in range(3):self.search.integers[10*i+9]=0 if i in empty else 1
  self.result=(0,0,0,0,0,0,0,0,0,0,0,0);self.target=999
 def plan(self,*args):
  index=args[6];self.prepares.append(index)
  for j in (7,8,9):self.search.parameters[index,j]=1
  return 5
 def complete(self,w,c,target,n):return c>=self.rank_at and c>=target
 def append(self,*args):
  index=args[5];count=args[6];online=args[13];status=args[14];x,y,z,candidates,budget=args[15:20];target=args[10];limit=args[21]
  if self.fatal:return count,candidates,online,-1,x,y,z
  if self.stalled:return count,candidates,online,status,x,y,z
  p=((z+1)*3+y+1)*3+x+1;end=min(27,p+budget)
  while p<end and count<limit and not self.complete(None,count,target,3):
   self.trace.append((index,p));candidates+=1
   if (p+index)%3:self.rows.append((index,p));count+=1
   p+=1
   if self.closed and count==2:status=2;break
  return count,candidates,count,status,p%3-1,(p%9)//3-1,p//9-1
 def advance(self,budget):
  ns.update(_cubic_plan_adjacent_ideal=self.plan,_cubic_initial_volume_parameters=lambda *args:1,
   _cubic_append_initial_volume_ellipsoid=self.append,_cubic_modular_relation_collection_complete=self.complete)
  args=dict.fromkeys(inspect.signature(collector).parameters,0)
  args.update(search=self.search,modular_workspace=[],output=[0]*64,factor_count=3,group_count=1,relation_effort=5,
   bounded_relation_collection=True,use_pari_permutation=True,streaming_relation_collection=True,online_relation_quotient_enabled=True,
   relation_capacity=999,relation_collection_target=self.target,proposal_budget=budget)
  keys=('relation_count','online_relation_count','online_relation_status','adjacent_planned_count','adjacent_enumerated_count','adjacent_factor_cursor','adjacent_phase','adjacent_direction','ellipsoid_zero','ellipsoid_one','ellipsoid_two','ellipsoid_count')
  args.update(zip(keys,self.result));self.result=collector(**args)
 def snapshot(self):return self.result,dict(self.search.visits),list(self.trace),list(self.rows),list(self.prepares)
splits=0
for options in ({},{'order':(2,0,1)},{'empty':(0,)},{'empty':(0,1,2)},{'fatal':True},{'closed':True},{'rank_at':1000},{'stalled':True}):
 whole=Scenario(**options);whole.advance(100)
 for split in range(101):
  paused=Scenario(**options);paused.advance(split);paused.advance(100-split)
  assert paused.snapshot()==whole.snapshot(),(options,split,paused.snapshot(),whole.snapshot())
  splits+=1
 zero=Scenario(**options);saved=zero.snapshot();zero.advance(0);assert zero.snapshot()==saved
 assert len(whole.prepares)==len(set(whole.prepares))
whole=Scenario();whole.advance(100)
streams=[[p for p in range(27) if (p+i)%3] for i in range(3)];expected=[]
while any(streams):
 for i in range(3):expected.extend((i,p) for p in streams[i][:4]);streams[i]=streams[i][4:]
assert whole.rows==expected and len(set(whole.trace))==81 and whole.result[:3]==(54,54,0)
staged=Scenario();staged.target=1;staged.advance(100)
assert staged.result[0]==9 # target alone cannot terminate below full rank
for target in range(10,55):
 staged.target=target;staged.advance(100)
staged.target=999;staged.advance(100);assert staged.snapshot()==whole.snapshot()
for invalid in ('phase','quota','order','cursor'):
 s=Scenario()
 if invalid=='phase':s.search.visits[1,1]=3
 if invalid=='quota':s.search.visits[1,0]=4
 if invalid=='order':s.search.order[2,0]=4
 if invalid=='cursor':s.search.visits[0,0]=3
 s.advance(100);assert s.result[2]==-1 and not s.rows

# Execute the actual pruned iterator: local row limit works even when the
# global checkpoint reports deficient rank; no admission/cursor code is mocked.
def run_iterator(limit,budget,state):
 parameters={(0,i):v for i,v in enumerate((1,0,0,1,0,1,5,3,3,3,0))}
 search=SimpleNamespace(**dict.fromkeys(('integers','transforms','relations','elements','hnf_source','hnf_result','online_basis','online_source','online_hnf','support','membership')))
 ns.update(_cubic_modular_relation_collection_complete=lambda *a:False,
  _cubic_reduced_ellipsoid_candidate=lambda *a:(1,*a[-4:-1]),
  _cubic_append_smooth_principal_relation=lambda *a:a[4]+1,
  _cubic_online_relation_lattice_update=lambda *a:1)
 c,k,o,status,x,y,z=state
 return iterator(search,[],0,0,parameters,0,c,999,3,1,1,True,True,o,status,x,y,z,k,budget,0,limit)
initial=(0,0,0,0,-3,-3,-3)
full=run_iterator(999,343,initial)
for limit in range(1,full[0]+1):
 paused=run_iterator(limit,343,initial);assert paused[0]==limit
 resumed=run_iterator(999,343,paused);assert resumed==full
print(splits,'scheduler pause splits; pre-rank quotas, staged targets, in-place plans, admission identity and actual iterator pauses passed')
`],{input:JSON.stringify([permutedAnalyticResumeSource(original),initialVolumeSource(original)]),encoding:"utf8",timeout:60000});
assert.equal(result.status,0,`${result.error||''}\n${result.stdout}\n${result.stderr}`);t.diagnostic(result.stdout.trim());
});
