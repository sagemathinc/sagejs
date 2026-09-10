// sagejs-test-tier: specialized
"use strict";
const assert=require('node:assert/strict'),cp=require('node:child_process'),path=require('node:path'),test=require('node:test');
test('untouched canonical HNF prefixes require no repeated above-pivot reductions',()=>{
 const r=cp.spawnSync('python3',['-c',String.raw`
import ast, importlib.util, random
from pathlib import Path
from sympy import Matrix
from sympy.matrices.normalforms import hermite_normal_form
s=importlib.util.spec_from_file_location('clean','bench/class-unit-groups/cubic-hnf-clean-prefix.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
source=Path('bench/class-unit-groups/cubic-incremental-hnf.py').read_text()
changed=m.transform(source)
def load(text):
    scope={'FmpzMatrix':object,'uint64':int}
    tree=ast.parse(text)
    functions=[n for n in tree.body if isinstance(n,ast.FunctionDef)]
    exec(compile(ast.Module(body=functions,type_ignores=[]),'hnf.py','exec'),scope)
    return scope['_cubic_insert_row_hnf_inplace']
old,new=load(source),load(changed)
class Storage:
    def __init__(self,rows): self.rows=[r[:] for r in rows];self.reads=0
    def __getitem__(self,k): self.reads+=1;return self.rows[k[0]][k[1]]
    def __setitem__(self,k,v): self.rows[k[0]][k[1]]=v
def oracle(rows,n):
    h=hermite_normal_form(Matrix([r[::-1] for r in rows]).T).T.tolist()
    h=[r[::-1] for r in h[::-1]]
    return h+[[0]*n for _ in range(n-len(h))]
count=0
def replay(rows,n):
    global count
    basis=[[0]*n for _ in range(n)];prefix=[]
    for row in rows:
        a,b=Storage(basis),Storage(basis)
        ra,rb=Storage([row]),Storage([row])
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
# No changed basis: precisely the triangular number of reads disappears.
n=64
basis=[[int(i==j) for j in range(n)] for i in range(n)]
a,b=Storage(basis),Storage(basis)
assert old(a,Storage([[1]*n]),n) and new(b,Storage([[1]*n]),n)
assert a.rows==b.rows==basis
assert a.reads-b.reads==n*(n-1)//2
for bad in (changed,source+source,source.replace('if a == 0:','if a <= 0:')):
    try:m.transform(bad)
    except ValueError:pass
    else:raise AssertionError('bad or repeated source accepted')
assert m.transform('# Unicode é\n'+source)=='# Unicode é\n'+changed
print(count,'exact prefixes; 2016 redundant reads removed')
`],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:60000,maxBuffer:2e6});
 assert.equal(r.status,0,r.stderr||r.stdout);assert.match(r.stdout,/4845 exact prefixes; 2016 redundant reads removed/);
});
