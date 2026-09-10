// sagejs-test-tier: specialized
"use strict";
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('zero-coefficient HNF updates preserve every canonical prefix', () => {
  const result = cp.spawnSync('python3', ['-c', String.raw`
import ast, importlib.util, random
from pathlib import Path
from sympy import Matrix
from sympy.matrices.normalforms import hermite_normal_form
def module(name):
    spec=importlib.util.spec_from_file_location(name,'bench/class-unit-groups/'+name+'.py')
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
clean=module('cubic-hnf-clean-prefix');zero=module('cubic-hnf-zero-updates')
source=clean.transform(Path('bench/class-unit-groups/cubic-incremental-hnf.py').read_text())
changed=zero.transform(source)
def load(text):
    scope={'FmpzMatrix':object,'uint64':int}
    functions=[n for n in ast.parse(text).body if isinstance(n,ast.FunctionDef)]
    exec(compile(ast.Module(body=functions,type_ignores=[]),'hnf.py','exec'),scope)
    return scope['_cubic_insert_row_hnf_inplace']
old,new=load(source),load(changed)
class Storage:
    def __init__(self,rows): self.rows=[r[:] for r in rows];self.writes=0
    def __getitem__(self,k): return self.rows[k[0]][k[1]]
    def __setitem__(self,k,v): self.writes+=1;self.rows[k[0]][k[1]]=v
def oracle(rows,n):
    h=hermite_normal_form(Matrix([r[::-1] for r in rows]).T).T.tolist()
    h=[r[::-1] for r in h[::-1]]
    return h+[[0]*n for _ in range(n-len(h))]
count=0
def replay(rows,n):
    global count
    basis=[[0]*n for _ in range(n)];prefix=[]
    for row in rows:
        a,b=Storage(basis),Storage(basis);ra,rb=Storage([row]),Storage([row])
        assert old(a,ra,n)==new(b,rb,n)==True
        assert a.rows==b.rows and ra.rows==rb.rows==[[0]*n]
        prefix.append(row);assert b.rows==oracle(prefix,n)
        basis=b.rows;count+=1
rng=random.Random(20260911)
for n in range(1,13):
    for trial in range(25):
        replay([[rng.randrange(-8,9) if rng.randrange(4)==0 else 0 for _ in range(n)] for _ in range(2*n+3)],n)
for n in range(1,7):
    replay([[rng.choice([-1,1])*rng.getrandbits(300) for _ in range(n)] for _ in range(n+3)],n)
replay([[0,0,0],[0,0,6],[0,-4,2],[2,1,3],[2,1,3],[-1,0,0]],3)
assert count==4845
n=64;basis=[[int(i==j) for j in range(n)] for i in range(n)]
a,b=Storage(basis),Storage(basis);ra,rb=Storage([[1]*n]),Storage([[1]*n])
assert old(a,ra,n) and new(b,rb,n)
assert a.rows==b.rows==basis and ra.rows==rb.rows==[[0]*n]
assert ra.writes-rb.writes==2016 and rb.writes==64
for bad in (changed,source+source,source.replace('basis[row, j] - quotient','basis[row, j] + quotient')):
    try:zero.transform(bad)
    except ValueError:pass
    else:raise AssertionError('bad or repeated source accepted')
assert zero.transform('# Unicode é\n'+source)=='# Unicode é\n'+changed
print('4845 exact prefixes; 2016 identity stores removed')
`], {cwd:path.resolve(__dirname, '..'),encoding:'utf8',timeout:60000,maxBuffer:2e6});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /4845 exact prefixes; 2016 identity stores removed/);
});
