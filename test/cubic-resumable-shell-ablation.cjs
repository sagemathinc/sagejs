// sagejs-test-tier: unit
"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),test=require("node:test");
const {spawnSync}=require("node:child_process");
const {pythonExecutable}=require("../tools/python-executable.cjs");
const {shellAdmissionSource,resumableSource}=require("../bench/class-unit-groups/diagnose-cubic-resumable-expansion-build.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const source=require('./fixtures/cubic-source-baseline.cjs').cubicSourceBaseline();
const geometry=read("bench/class-unit-groups/cubic-expanded-shell-experiment.py");
const prefix=read("bench/class-unit-groups/cubic-expanded-prefix-experiment.py");
test("resumable shell retains certification and shares the original admission loop",()=>{
  const candidate=resumableSource(source,geometry,prefix);
  assert.equal((candidate.match(/def _cubic_append_reduced_ideal_ellipsoid\(/g)||[]).length,1);
  assert(!candidate.includes("def _cubic_collect_expanded_shell("));
  const extract=s=>s.slice(s.indexOf("def _cubic_try_bounded_exact_closure("),s.indexOf("\ndef ",s.indexOf("def _cubic_try_bounded_exact_closure(")+1));
  assert.equal(extract(candidate),extract(source));
  assert.throws(()=>shellAdmissionSource(shellAdmissionSource(source)));
  const p=spawnSync(pythonExecutable(),["-c","import ast,sys; ast.parse(sys.stdin.read())"],{input:candidate,encoding:"utf8"});
  assert.equal(p.status,0,p.stderr);
});
test("split shell prefixes equal one-shot proposals and preserve cumulative limits",()=>{
  const p=spawnSync(pythonExecutable(),["-c",String.raw`
import ast,collections,copy,json,math,sys
from types import SimpleNamespace
data=json.load(sys.stdin)
names={'_cubic_reduced_ellipsoid_candidate','_cubic_append_reduced_ideal_ellipsoid'}
def functions(text,selected):
    tree=ast.parse(text);tree.body=[f for f in tree.body if isinstance(f,ast.FunctionDef) and f.name in selected]
    assert len(tree.body)==len(selected)
    return compile(tree,'actual-typed-source','exec')
def create(cap=500,original=False,production=False):
    proposed=[];admitted=[]
    def admission(workspace,modular,rows,elements,count,capacity,n,groups,a,b,c,*rest):
        v=(a,b,c)
        if sum(v)%3==0 or v in admitted:return count
        if count>=capacity:return capacity+1
        admitted.append(v);return count+1
    def checked(x):
        assert 0<=x<2**64
        return x
    ns=dict(FmpzMatrix=dict,NativeIntegerVector=list,UInt64Buffer=list,uint64=int,
       checked_uint64=checked,_CUBIC_MAX_POWERS=24,_POWER_OFFSET=0,
       _CUBIC_REDUCED_ENUMERATION_MAX_COORDINATE=64,_CUBIC_REDUCED_ENUMERATION_MAX_CANDIDATES=cap,
       _cubic_ceil_sqrt=lambda n:math.isqrt(n)+(math.isqrt(n)**2<n),
       _cubic_dyadic_ceiling_quotient=lambda a,b:-(-a//b),
       _cubic_extended_gcd=lambda a,b:(math.gcd(a,b),0,0),
       _cubic_transformed_ideal_coordinates=lambda w,b,t,r,x,y,z:(x,y,z),
       _cubic_coordinates_are_scalar=lambda w,x,y,z:y==0 and z==0,
       _cubic_modular_relation_collection_complete=lambda w,c,t,n:c>=t,
       _cubic_append_smooth_principal_relation=admission,
       _cubic_online_relation_lattice_update=lambda *args:1)
    ns['CubicSearchWorkspace']=SimpleNamespace
    exec(functions(data['production' if production else 'original' if original else 'admission'],names),ns)
    exact=ns['_cubic_reduced_ellipsoid_candidate']
    def candidate(*args):
        # Base and all coordinates distinguish repeated calls from repeated ideals.
        proposed.append((args[1],*args[6:9]));return exact(*args)
    ns['_cubic_reduced_ellipsoid_candidate']=candidate
    exec(functions(data['production' if production else 'geometry'],{'_cubic_expansion_parameters'}),ns)
    exec(functions(data['production' if production else 'prefix'],{'_cubic_collect_expanded_shell_prefix'}),ns)
    if production:
        # Adapt the witness call boundary only. The production functions call
        # each other through their actual bundled signatures and unchanged bodies.
        owners=('integers','order','transforms','parameters','relations','elements',
                'hnf_source','hnf_result','online_basis','online_source','online_hnf','support','membership')
        actual_outer=ns['_cubic_collect_expanded_shell_prefix']
        actual_inner=ns['_cubic_append_reduced_ideal_ellipsoid']
        def outer(*a):
            search=SimpleNamespace(**dict(zip(owners,[a[i] for i in (0,2,3,4,6,7,8,9,10,11,12,13,14)])))
            return actual_outer(search,a[1],a[5],*a[15:])
        def inner(*a):
            search=SimpleNamespace(**dict(zip(owners,(a[0],None,a[3],None,a[7],a[8],a[14],a[15],*a[18:23]))))
            return actual_inner(search,a[1],a[2],a[4],a[5],a[6],*a[9:14],*a[16:18],*a[23:])
        ns=dict(ns,_cubic_collect_expanded_shell_prefix=outer,
                _cubic_append_reduced_ideal_ellipsoid=inner)
    return ns,proposed,admitted
def matrix():return collections.defaultdict(int)
def setup(permuted=False):
    plans=matrix()
    for r in range(2):
        for c,v in enumerate((1,0,0,1,0,1,2,2,2,2,0)):plans[r,c]=v
    state=matrix()
    for c in range(6):state[0,c]=0
    expanded=matrix()
    order=matrix();order[0,0]=1;order[1,0]=2
    args=([1,0,0],[],order,matrix(),plans,expanded,matrix(),matrix(),matrix(),matrix(),matrix(),matrix(),matrix(),matrix(),matrix(),2,1,permuted)
    return args,state
def run(budget,cap=500,permuted=False,production=False):
    ns,proposed,admitted=create(cap,production=production);args,state=setup(permuted);before=dict(args[4])
    result=(0,0,1);target=1;calls=0
    while state[0,0]<2 and result[2]>=0:
        snapshot=(copy.deepcopy(state),copy.deepcopy(args[5]),list(proposed),list(admitted))
        assert ns['_cubic_collect_expanded_shell_prefix'](*args,*result,500,target,state,0)==result
        assert snapshot==(state,args[5],proposed,admitted)
        result=ns['_cubic_collect_expanded_shell_prefix'](*args,*result,500,target,state,budget)
        if result[0]>=target:target=4 if target==1 else 8 if target==4 else 500
        calls+=1;assert calls<2000
    assert dict(args[4])==before
    if result[2]<0:
        before=(copy.deepcopy(state),list(proposed),list(admitted))
        assert ns['_cubic_collect_expanded_shell_prefix'](*args,*result,500,500,state,10)==result
        assert before==(state,proposed,admitted)
    return result,proposed,admitted,state
baseline=run(100000)
for budget in (1,2,7,31,100):assert run(budget)==baseline
assert len(baseline[1])==len(set(baseline[1]))
for budget in (1,2,7):
    split=run(budget,3);whole=run(100000,3)
    assert split[:3]==whole[:3] and split[0][2]==-1
reverse=run(100000,permuted=True)
assert reverse[1][0][0]!=baseline[1][0][0]
for budget in (1,2,7,31,100):assert run(budget,permuted=True)==reverse
for permuted in (False,True):
    for cap in (3,500):
        for budget in (1,2,7,31,100,100000):
            assert run(budget,cap,permuted,True)==run(budget,cap,permuted,False)

# With lower_bound zero the modified inner loop is exactly the old traversal.
results=[]
for original in (True,False):
    ns,proposed,admitted=create(original=original);args,state=setup();q=matrix()
    for c,v in enumerate((1,0,0,1,0,1,8,3,3,3,0)):q[0,c]=v
    inner=([1,0,0],[],0,matrix(),0,q,0,matrix(),matrix(),0,500,2,1,500,matrix(),matrix(),True,True,matrix(),matrix(),matrix(),matrix(),matrix(),0,1,-3,-3,-3,0,100000)
    result=ns['_cubic_append_reduced_ideal_ellipsoid'](*inner,*(() if original else (0,)))
    results.append((result,proposed,admitted))
assert results[0]==results[1]
print('split/one-shot, zero budget, rejection, duplicates, fatal status, candidate cap and zero-bound parity passed')
`],{input:JSON.stringify({original:source,admission:shellAdmissionSource(source),geometry,prefix,production:read('src/lib/sagejs/number_fields/cubic_class_number_native.py')}),encoding:"utf8",timeout:30000});
  assert.equal(p.status,0,`${p.stdout}\n${p.stderr}`);
  assert.match(p.stdout,/zero-bound parity passed/);
});
