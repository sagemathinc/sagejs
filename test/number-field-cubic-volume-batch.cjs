// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { volumeBatchSource } = require("../bench/class-unit-groups/diagnose-cubic-volume-batch-build.cjs");

test("volume recovery preserves cheap search and certification; early policy changes only the first target", t => {
  const source = readFileSync(resolve(__dirname, "../src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
  const result = spawnSync(pythonExecutable(), ["-c", String.raw`
import ast, collections, importlib.util, json, math, random, sys
from types import SimpleNamespace
original, recovery, early = json.load(sys.stdin)
trees = [ast.parse(s) for s in (original,recovery,early)]
maps = [{n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)} for tree in trees]
changed = {name for name in maps[0] if ast.dump(maps[0][name]) != ast.dump(maps[1][name])}
assert changed == {'_cubic_expansion_parameters','_cubic_collect_expanded_shell_prefix','certified_complex_cubic_class_group_v1'},changed
# Only allocation dimensions change in the public entry, not its proof/guards.
class ResetDimensions(ast.NodeTransformer):
    def visit_Assign(self,node):
        if isinstance(node.targets[0],ast.Name):
            if node.targets[0].id in {'expanded_parameters','expanded_state'}:
                node.value.args[1] = ast.Constant(1)
        return self.generic_visit(node)
assert ast.dump(ResetDimensions().visit(maps[1]['certified_complex_cubic_class_group_v1'])) == ast.dump(maps[0]['certified_complex_cubic_class_group_v1'])
old_guard='elif relation_effort == 5 and (not staged_certification or factor_count == 12):'
assert early == recovery.replace(old_guard,'elif relation_effort == 5 and not staged_certification:')
spec=importlib.util.spec_from_file_location('fp',sys.argv[1]);fp=importlib.util.module_from_spec(spec);spec.loader.exec_module(fp)
names={'_cubic_expansion_parameters','_cubic_collect_expanded_shell_prefix'}
ns={'checked_uint64':int,'_CUBIC_MODULAR_RANK_OFFSET':0,'_POWER_OFFSET':0,'_CUBIC_MAX_POWERS':1,
    '_CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE':64,
    '_cubic_ceil_sqrt':lambda n:math.isqrt(n)+(math.isqrt(n)**2<n),
    '_cubic_floor_cube_root':lambda n:fp.ceil_root(n,3)-(fp.ceil_root(n,3)**3>n),
    '_cubic_dyadic_ceiling_quotient':lambda a,b:-(-a//b)}
exec('from __future__ import annotations\n'+'\n'.join(ast.unparse(n) for n in maps[1].values() if n.name in names),ns)
prepare=ns['_cubic_expansion_parameters']
rng=random.Random(478)
cases=0
for _ in range(100):
    m=[[rng.randint(-5,5) for j in range(3)] for i in range(3)]
    gmat=[[sum(m[k][i]*m[k][j] for k in range(3))+(i==j) for j in range(3)] for i in range(3)]
    g=(gmat[0][0],gmat[0][1],gmat[0][2],gmat[1][1],gmat[1][2],gmat[2][2])
    for scale in (1,2**300+17):
        gram=tuple(x*scale for x in g)
        expected=fp.volume_bound(gram)
        parameters={(2,i):v for i,v in enumerate((*gram,1))};saved=dict(parameters)
        expanded={};ready=prepare(parameters,2,expanded)
        assert parameters==saved
        a,b,c,d,e,f=gram;det=a*(d*f-e*e)-b*(b*f-c*e)+c*(b*e-c*d)
        limits=[fp.ceil_root(fp.Q(expected*v,det),2) for v in (d*f-e*e,a*f-c*c,a*d-b*b)]
        if max(limits)>64:assert ready==-1 and not expanded
        else:
            assert ready==1 and expanded[2,6]==expected
            assert [expanded[2,i] for i in (7,8,9)]==limits
            assert all(row==2 for row,column in expanded)
        cases+=1
for g in [(0,0,0,1,0,1),(1,0,0,-1,0,1),(1,0,0,1,0,-1)]:
    assert prepare({(0,i):v for i,v in enumerate((*g,1))},0,{})==-1
for height in (477,478,479,1000000):
    g=(1,0,0,1,0,height);expanded={}
    assert prepare({(0,i):v for i,v in enumerate((*g,1))},0,expanded)==1
    assert expanded[0,6]==fp.volume_bound(g)
    for old_bound in (0,expanded[0,6],expanded[0,6]+1):
        untouched={}
        assert prepare({(0,i):v for i,v in enumerate((*g,old_bound))},0,untouched)==0
        assert not untouched

class Scenario:
    def __init__(self,order=(0,1,2),empty=(),fatal=False,closed=False,rank=3,stalled=False):
        self.state=collections.defaultdict(int);self.expanded={};self.trace=[];self.rows=[];self.prepares=[]
        self.order=order;self.empty=empty;self.fatal=fatal;self.closed=closed;self.rank=rank
        self.stalled=stalled
        self.result=(0,0,0);self.target=999
        self.search=SimpleNamespace(order={(2-i,0):v+1 for i,v in enumerate(order)},parameters={(i,6):1 for i in range(3)})
    def prepare(self,parameters,index,expanded):
        self.prepares.append(index)
        if index in self.empty:return 0
        for j in (7,8,9):expanded[index,j]=1
        return 1
    def append(self,*args):
        index=args[5];count=args[6];capacity=args[7];target=args[10];online=args[13];status=args[14]
        x,y,z,candidates,budget=args[15:20]
        p=((z+1)*3+y+1)*3+x+1
        if self.fatal:return count,candidates,online,-1,x,y,z
        if self.stalled:return count,candidates,online,status,x,y,z
        end=min(27,p+budget)
        while p<end and count<target:
            self.trace.append((index,p));candidates+=1
            if (p+index)%3!=0:self.rows.append((index,p));count+=1
            p+=1
            if self.closed and count==2:status=2;break
        z,y,x=p//9-1,(p%9)//3-1,p%3-1
        return count,candidates,count,status,x,y,z
    def advance(self,budget):
        ns['_cubic_expansion_parameters']=self.prepare
        ns['_cubic_append_volume_ideal_ellipsoid']=self.append
        self.result=ns['_cubic_collect_expanded_shell_prefix'](self.search,[self.rank],self.expanded,
            3,1,True,*self.result,999,self.target,self.state,budget)
    def snapshot(self):return (self.result,dict(self.state),self.trace,self.rows,self.prepares)

splits=0
for options in ({},{'order':(2,0,1)},{'empty':(0,)},{'empty':(0,1,2)},{'fatal':True},{'closed':True},{'rank':2},{'stalled':True}):
    whole=Scenario(**options);whole.advance(100)
    for split in range(101):
        paused=Scenario(**options);paused.advance(split);paused.advance(100-split)
        assert paused.snapshot()==whole.snapshot(),(options,split,paused.snapshot(),whole.snapshot())
        splits+=1
    zero=Scenario(**options);before=zero.snapshot();zero.advance(0);assert zero.snapshot()==before
    # Terminal/fatal inputs must never touch discovery again.
    if whole.result[2] in (-1,2):
        before=whole.snapshot();whole.advance(100);assert whole.snapshot()==before
    assert len(whole.prepares)==len(set(whole.prepares))
whole=Scenario();whole.advance(100)
staged=Scenario()
for target in range(1,55):
    staged.target=target
    while staged.result[0]<target:staged.advance(1)
staged.target=999;staged.advance(100)
assert staged.snapshot()==whole.snapshot()
# Independent round-robin relation schedule: four admitted rows per visit.
streams=[[p for p in range(27) if (p+i)%3] for i in range(3)]
expected=[]
while any(streams):
    for i in range(3):
        expected.extend((i,p) for p in streams[i][:4]);streams[i]=streams[i][4:]
assert whole.rows==expected
assert len(whole.trace)==81 and len(set(whole.trace))==81
assert whole.result==(54,54,0)
print(cases,'exact volume plans;',splits,'scheduler pause splits; quota, wraparound, empty, fatal, closure and staged targets passed')
`, resolve(__dirname, "../bench/class-unit-groups/diagnose-cubic-exact-fp.py")], {
    input: JSON.stringify([source,volumeBatchSource(source),volumeBatchSource(source,true)]),
    encoding:"utf8",timeout:60_000,
  });
  assert.equal(result.status,0,`${result.error || ""}\n${result.stdout}\n${result.stderr}`);
  t.diagnostic(result.stdout.trim());
});
