// sagejs-test-tier: unit
"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),test=require('node:test');
const {spawnSync}=require('node:child_process');
const {pythonExecutable}=require('../tools/python-executable.cjs');
const {torsionProbeSource}=require('../bench/class-unit-groups/diagnose-cubic-torsion-probe-build.cjs');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/lib/sagejs/number_fields/cubic_class_number_native.py'),'utf8');
test('torsion probe retains the complete original conditioning and certification tail',()=>{
  const next=torsionProbeSource(source);
  const start=source.indexOf('def _cubic_relation_prefix_has_archimedean_unit(');
  const lll=source.indexOf('    if not fmpz_matrix_lll_transform_prefix(',start);
  const nextLll=next.indexOf('    if not fmpz_matrix_lll_transform_prefix(',next.indexOf('def _cubic_relation_prefix_has_archimedean_unit('));
  assert.equal(source.slice(lll),next.slice(nextLll));
  assert(next.includes('    if _cubic_fill_dependency_logs('));
  assert.throws(()=>torsionProbeSource(next));
});
test('actual torsion predicate matches an exact interval oracle, including signed and large coefficients',()=>{
  const result=spawnSync(pythonExecutable(),['-c',String.raw`
import ast,json,random,sys
from fractions import Fraction
d=json.load(sys.stdin)
ns={}
exec(d['helper'],ns)
check=ns['_cubic_dependency_logs_certify_torsion']
rng=random.Random(193817)
for trial in range(1200):
    rows=rng.randrange(1,6);cols=rng.randrange(1,8);scale=1<<rng.randrange(1,257)
    logs={(i,0):rng.randrange(-100,101) for i in range(cols)}
    for i in range(cols):logs[i,1]=logs[i,0]+rng.randrange(0,4)
    deps={(i,j):rng.randrange(-20,21)*(1<<rng.randrange(0,131)) for i in range(rows) for j in range(cols)}
    oracle=True
    for i in range(rows):
        lo=sum(min(deps[i,j]*logs[j,0],deps[i,j]*logs[j,1]) for j in range(cols))
        hi=sum(max(deps[i,j]*logs[j,0],deps[i,j]*logs[j,1]) for j in range(cols))
        oracle &= Fraction(lo,scale)>=-Fraction(1,5) and Fraction(hi,scale)<=Fraction(1,5)
    assert check(deps,logs,rows,cols,scale)==oracle
assert check({(0,0):1},{(0,0):-1,(0,1):1},1,1,5)
assert not check({(0,0):1},{(0,0):-2,(0,1):1},1,1,5)
assert not check({(0,0):1},{(0,0):-1,(0,1):2},1,1,5)
assert not check({(0,0):0},{(0,0):1,(0,1):0},1,1,5)
assert not check({}, {},0,1,5)
assert not check({}, {},1,0,5)
assert not check({}, {},1,1,0)
assert not check({}, {},1,1,-1)
# Extract the actual inserted probe block. An invalid low-precision enclosure
# is inconclusive and falls through; no result owner is touched by the probe.
tree=ast.parse(d['source']);fn=next(x for x in tree.body if isinstance(x,ast.FunctionDef) and x.name=='_cubic_relation_prefix_has_archimedean_unit')
probe=next(x for x in fn.body if isinstance(x,ast.If) and isinstance(x.test,ast.Call) and getattr(x.test.func,'id',None)=='_cubic_fill_dependency_logs')
parameters=fn.args
testfn=ast.FunctionDef(name='probe',args=parameters,body=[probe,ast.Return(ast.Constant(73))],decorator_list=[])
module=ast.Module(body=[ast.ImportFrom(module='__future__',names=[ast.alias(name='annotations')],level=0),testfn],type_ignores=[])
exec(compile(ast.fix_missing_locations(module),'<probe>','exec'),ns)
import inspect
args={name:0 for name in inspect.signature(ns['probe']).parameters}
ns['dependency_count']=1
calls=[]
for fill_ok,cert_ok,expected in [(False,True,73),(True,False,73),(True,True,0)]:
    calls.clear()
    ns['_cubic_fill_dependency_logs']=lambda *a: calls.append('fill') or fill_ok
    ns['_cubic_dependency_logs_certify_torsion']=lambda *a: calls.append('certify') or cert_ok
    assert ns['probe'](**args)==expected
    assert calls==(['fill','certify'] if fill_ok else ['fill'])
print('1200 exact interval cases, boundaries, malformed enclosures, and probe fallback passed')
import runpy
fixture=runpy.run_path(d['fixture'])
original_compile=fixture['helper_cases'].__globals__['compile_function']
def compile_with_probe(node):
    function,environment=original_compile(node)
    environment['_cubic_dependency_logs_certify_torsion']=check
    return function,environment
fixture['helper_cases'].__globals__['compile_function']=compile_with_probe
fixture['helper_cases'](tree)
print('actual full recovery helper preserves fatal statuses and transactional publication')
`],{input:JSON.stringify({helper:fs.readFileSync(path.join(root,'bench/class-unit-groups/cubic-torsion-prefix.py'),'utf8'),source:torsionProbeSource(source),fixture:path.join(root,'test/fixtures/cubic-recovery-status-faults.py')}),encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
