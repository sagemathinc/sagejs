// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { volumeBatchSource } = require("../bench/class-unit-groups/diagnose-cubic-volume-batch-build.cjs");
const { analyticResumeSource, permutedAnalyticResumeSource } = require("../bench/class-unit-groups/diagnose-cubic-analytic-resume-build.cjs");
const root = path.resolve(__dirname,"..");
const original = fs.readFileSync(path.join(root,"src/lib/sagejs/number_fields/cubic_class_number_native.py"),"utf8");

test("permutation ablation changes only the structural eligibility limit", ()=>{
  const before=analyticResumeSource(original), after=permutedAnalyticResumeSource(original);
  const old=`        use_pari_permutation = (\n            (relation_effort >= 3 and relation_effort <= 5)\n            and factor_count <= _CUBIC_NARROW_ADJACENT_MAX_FACTORS`;
  const replacement=`        use_pari_permutation = (\n            (relation_effort >= 3 and relation_effort <= 5)\n            and factor_count <= 12`;
  assert.equal(before.split(old).length,2);
  assert.equal(after,before.replace(old,replacement));
});

test("analytic resumption changes only the insufficiency guard and preserves root failure ordering", t=>{
  const run = spawnSync(pythonExecutable(),["-c",String.raw`
import ast,json,sys
early,candidate=json.load(sys.stdin)
old={n.name:n for n in ast.parse(early).body if isinstance(n,ast.FunctionDef)}
new={n.name:n for n in ast.parse(candidate).body if isinstance(n,ast.FunctionDef)}
assert set(new)-set(old)=={'_cubic_can_resume_bounded_search'}
changed=[name for name in old if ast.dump(old[name])!=ast.dump(new[name])]
assert changed==['certified_complex_cubic_class_group_v1']
normalized=ast.parse(candidate.replace('if not _cubic_can_resume_bounded_search(staged_status, output):',
    'if output[63] != 43 or output[59] != 434:'))
normalized.body=[n for n in normalized.body if not (isinstance(n,ast.FunctionDef) and n.name=='_cubic_can_resume_bounded_search')]
assert ast.dump(normalized)==ast.dump(ast.parse(early))
ns={}
exec('from __future__ import annotations\n'+'\n'.join(ast.unparse(new[n]) for n in
    ('_cubic_classify_analytic_index','_cubic_can_resume_bounded_search')),ns)
authorize=ns['_cubic_can_resume_bounded_search']
cases=0
for scale in (1,2**300+17):
    for lower,upper,two_lo,two_hi,ok in [(-1,100,70,71,True),(1,100,70,71,True),(0,70,70,71,True),
        (-1,0,70,71,False),(1,2,70,71,False),(100,0,70,71,False),(-2,-1,70,71,False),
        (0,100,0,71,False),(0,100,71,70,False)]:
        for reason in (0,434,435,436,437):
            for status in (-2,-1,0,1,2):
                output=[0]*64;output[47]=scale;output[63]=8;output[59]=reason
                output[44]=lower*scale;output[45]=upper*scale;output[48]=two_lo*scale;output[49]=two_hi*scale
                before=list(output)
                assert authorize(status,output)==(status==0 and ok)
                assert output==before
                cases+=1
output=[0]*64
for phase in (6,7,41,42,43,44,45):
    for reason in (0,431,434,435,436):
        output[63]=phase;output[59]=reason
        assert authorize(0,output)==(phase==43 and reason==434)
output[63]=8;output[44]=0;output[45]=100;output[48]=70;output[49]=71
for scale in (0,-1):output[47]=scale;assert not authorize(0,output)

# Reuse the production-driver adversarial fixture's *definitions*, executing
# its AST-extracted root loop from this candidate, not a rewritten scheduler.
fixture=open(sys.argv[1]).read().split('\nassert scenario([1])')[0]
fixture=fixture.replace('source = ast.parse(open(sys.argv[1]).read())','source = ast.parse(candidate)')
fixture=fixture.replace('    storage=38,','    storage=38,\n    bounds=(0,100,70,71),\n    scale=100,')
fixture=fixture.replace('        status = next(pending)',
    '        namespace["output"][44], namespace["output"][45], namespace["output"][48], namespace["output"][49] = bounds\n        namespace["output"][47] = scale\n        status = next(pending)')
fixture=fixture.replace('assert args["expanded"].rows == args["state"].rows == 1',
    'assert args["expanded"].rows == factors and args["state"].rows == factors+1')
fixture=fixture.replace('        _cubic_try_bounded_exact_closure=proof,',
    '        _cubic_can_resume_bounded_search=authorize,\n        _cubic_try_bounded_exact_closure=proof,')
env={'candidate':candidate,'authorize':authorize};exec(fixture,env);scenario=env['scenario']
options=dict(factors=12,phase=8,reason=435)
assert scenario([0,1],**options)[:2]==(True,['proof','expand','prepare','smith','proof'])
assert scenario([0,0,0,1],**options)[:2]==(True,['proof']+['expand','prepare','smith','proof']*3)
assert scenario([0,0,0,0],**options)[:2]==(False,['proof']+['expand','prepare','smith','proof']*3)
for status in (-2,-1,2,17):
    assert scenario([status],**options)==(False,['proof'],44)
    assert scenario([0,status],**options)==(False,['proof','expand','prepare','smith','proof'],44)
for bounds in ((1,2,70,71),(100,0,70,71),(0,100,0,71),(0,100,71,70)):
    assert scenario([0],**options,bounds=bounds)[:2]==(False,['proof'])
assert scenario([0],**options,scale=0)[:2]==(False,['proof'])
assert scenario([0],**options,expanded_growth=0)==(False,['proof','expand'],43)
assert scenario([0],**options,online_failure=True)==(False,['proof','expand'],44)
for delta in (-1,30):assert scenario([0],**options,expanded_growth=delta)==(False,['proof','expand'],44)
for bad_rank in (-1,0,2):assert scenario([0],**options,rank_status=bad_rank)==(False,['proof','expand','prepare'],44)
assert scenario([0],**options,quotient=1)[:2]==(True,['proof','expand','prepare','smith','trivial'])
print(cases,'guard cases; actual-root failure, ownership, exhaustion and fresh Smith checks passed')
`,path.join(__dirname,"fixtures/cubic-staged-driver.py")],{input:JSON.stringify([volumeBatchSource(original,true),analyticResumeSource(original)]),encoding:"utf8",timeout:30_000});
  assert.equal(run.status,0,`${run.error||""}\n${run.stdout}\n${run.stderr}`);
  t.diagnostic(run.stdout.trim());
});

test("analytic resume guard agrees in CPython, JavaScript, GMP and fmpz", {timeout:120_000}, async t=>{
  const directory=fs.mkdtempSync(path.join(require("node:os").tmpdir(),"cubic-resume-guard-"));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const start=original.indexOf("def _cubic_classify_analytic_index(");
  const end=original.indexOf("\ndef _cubic_saturate_analytic_unit(",start);
  assert.ok(start>0 && end>start);
  const template=fs.readFileSync(path.join(root,"bench/class-unit-groups/cubic-analytic-resume-template.py"),"utf8");
  const source=`from sagejs.native import native, IntegerBuffer, NativeExactArena\n\n${original.slice(start,end)}\n${template.slice(template.indexOf("def _cubic_can_resume_bounded_search("))}\n@native\ndef guard_witness(values: IntegerBuffer) -> bool:\n    if len(values) != 64:\n        return False\n    with NativeExactArena(1048576, 1048576) as arena:\n        status = arena.integer_vector(1, 0)\n        status[0] = values[0]\n        return _cubic_can_resume_bounded_search(status[0], values)\n`;
  const cases=[];
  for(const scale of [1n,2n**300n+17n]) for(const status of [-1n,0n,1n,2n])
    for(const phase of [8n,43n,44n]) for(const reason of [434n,435n,436n])
      for(const bounds of [[0n,100n,70n,71n],[0n,70n,70n,71n],[1n,2n,70n,71n],[100n,0n,70n,71n],[-2n,-1n,70n,71n],[0n,100n,71n,70n]]) {
        const values=Array(64).fill(0n);values[0]=status;values[63]=phase;values[59]=reason;values[47]=scale;
        for(const [i,v] of bounds.entries())values[[44,45,48,49][i]]=v*scale;
        cases.push(values.map(String));
      }
  const oracle=spawnSync(pythonExecutable(),["-c",String.raw`
import ast,json,sys
data=json.load(sys.stdin);tree=ast.parse(data['source']);tree.body=[n for n in tree.body if not isinstance(n,ast.ImportFrom)]
class Arena:
    def __init__(self,*args):pass
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def integer_vector(self,n,value):return [value]*n
ns={'native':lambda f:f,'NativeExactArena':Arena};exec('from __future__ import annotations\n'+ast.unparse(tree),ns)
print(json.dumps([ns['guard_witness'](list(map(int,c))) for c in data['cases']]))
`],{input:JSON.stringify({source,cases}),encoding:"utf8",timeout:30_000});
  assert.equal(oracle.status,0,oracle.stderr);
  const expected=JSON.parse(oracle.stdout);
  const filename=path.join(directory,"guard.py");fs.writeFileSync(filename,source);
  const {compileKernel}=require("../tools/native-kernel/compiler.cjs");
  const compiled=await compileKernel({sourcePath:filename,cacheRoot:path.join(directory,"cache")});
  const fn=require(compiled.modulePath).guard_witness;
  for(const [i,c] of cases.entries())for(const implementation of [fn.javascript,fn.gmp,fn.fmpz])
    assert.equal(implementation(fn.packIntegerBuffer(c.map(BigInt))),expected[i]);
  t.diagnostic(`${cases.length} cases agree across three emitted backends and CPython`);
});
