// sagejs-test-tier: specialized
"use strict";
const assert=require('node:assert/strict');
const cp=require('node:child_process');
const path=require('node:path');
const test=require('node:test');

test('exact prime-support stripping agrees with trial division, including prime powers',()=>{
 const run=cp.spawnSync('python3',['-c',String.raw`
import ast, importlib.util, math, random
from pathlib import Path
p=Path('bench/class-unit-groups/cubic-prime-support-ablation.py')
s=importlib.util.spec_from_file_location('support',p)
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
scope={'_cubic_gcd':math.gcd}
exec(m.FILTER,scope)
check=scope['_cubic_norm_has_prime_support']
primes=[2,3,5,7,11,13,17,19,23,29,31]
rng=random.Random(281017)
count=0
for mask in range(1<<len(primes)):
    support=[p for i,p in enumerate(primes) if mask>>i&1]
    product=math.prod(support)
    # Include multiplicities in P: the criterion is prime support, not radical.
    repeated_product=math.prod(p**rng.randrange(1,5) for p in support)
    for _ in range(4):
        n=rng.randrange(1,10**12)
        residue=n
        for p in support:
            while residue%p==0: residue//=p
        assert check(n,product)==check(n,repeated_product)==(residue==1)
        count+=1
    n=math.prod(p**rng.randrange(1,50) for p in support)
    assert check(n,product) and check(n,repeated_product)
    assert not check(n*37,product)
    count+=2
assert check(1,1) and not check(2,1)
assert check(2**4096*3**300,6)
assert not check(2**4096*3**300*37,6)
for n,p in [(0,2),(-1,2),(1,0),(1,-1)]: assert not check(n,p)

# Exhaust the whole transformed collector up to the early-rejection boundary.
# Successful smooth norms reach an explicit sentinel: no simulated ideal
# arithmetic is passed off as a certificate.
source='''def _cubic_append_smooth_principal_relation(
    norm, workspace, layout, relation_count
):
    remaining_norm = norm
    raise RuntimeError("detailed ideal check")

def certified_complex_cubic_class_group_v1():
    layout_compound: uint64 = layout_norm + 10
    if True:
        output[63] = 3
'''
changed=m.transform(source)
assert 'layout_norm + 11' in changed
assert m.transform('# Unicode é\n'+source)=='# Unicode é\n'+changed
for bad in (changed,source+source,source.replace('layout_norm + 10','layout_norm + 9')):
    try:m.transform(bad)
    except ValueError:pass
    else:raise AssertionError('invalid source accepted')
from types import SimpleNamespace
scope={'_cubic_gcd':math.gcd,'uint64':int}
exec(changed,scope)
workspace=[999]*10+[30]+[777]*5
before=list(workspace)
collector=scope['_cubic_append_smooth_principal_relation']
assert collector(7,workspace,SimpleNamespace(norm=0),42)==42
assert workspace==before
try:collector(2**25*3**11*5,workspace,SimpleNamespace(norm=0),42)
except RuntimeError as e:assert str(e)=='detailed ideal check'
else:raise AssertionError('smooth candidate skipped ideal check')
assert workspace==before
flint_source='from sagejs.ffi.flint import (\n    FmpzMatrix,\n)\n'+source
flint_changed=m.transform(flint_source,'flint')
tree=ast.parse(flint_changed)
tree.body=[n for n in tree.body if not isinstance(n,ast.ImportFrom)]
scope={'fmpz_gcd':math.gcd,'uint64':int}
exec(compile(tree,'flint-variant.py','exec'),scope)
flint_check=scope['_cubic_norm_has_prime_support']
for norm,product in [(1,1),(1024,2),(35,6),(2**4096*3**300,6),(0,1)]:
    assert flint_check(norm,product)==check(norm,product)
for bad_source,backend in [(source,'flint'),(source,'unknown'),(flint_changed,'flint')]:
    try:m.transform(bad_source,backend)
    except ValueError:pass
    else:raise AssertionError('invalid backend or import accepted')
print(count)
`],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:30000,maxBuffer:1e6});
 assert.equal(run.status,0,run.stderr||run.stdout);
 assert.equal(Number(run.stdout.trim()),12288);
});
