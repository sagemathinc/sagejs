// sagejs-test-tier: specialized
// Independent CPython/SymPy oracle for the source-transparent research helper.
"use strict";
const assert=require("node:assert/strict");
const cp=require("node:child_process");
const path=require("node:path");
const test=require("node:test");
const root=path.resolve(__dirname,"..");

test("incremental row insertion preserves canonical HNF on every prefix",()=>{
 const run=cp.spawnSync("python3",["-c",String.raw`
import ast
import random
from pathlib import Path
from sympy import Matrix
from sympy.matrices.normalforms import hermite_normal_form

tree = ast.parse(Path("bench/class-unit-groups/cubic-incremental-hnf.py").read_text())
fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef))
scope = {"FmpzMatrix": object, "uint64": int}
functions = [n for n in tree.body if isinstance(n, ast.FunctionDef)]
exec(compile(ast.Module(body=functions, type_ignores=[]), "incremental-hnf.py", "exec"), scope)
insert = scope[fn.name]
inplace = scope["_cubic_insert_row_hnf_inplace"]
class Storage:
    def __init__(self, rows): self.rows = [r[:] for r in rows]
    def __getitem__(self, key): return self.rows[key[0]][key[1]]
    def __setitem__(self, key, value): self.rows[key[0]][key[1]] = value

def oracle(rows,n):
    # Reverse both axes to convert SymPy's right-pivot convention to FLINT's.
    h = hermite_normal_form(Matrix([r[::-1] for r in rows]).T).T.tolist()
    h = [r[::-1] for r in h[::-1]]
    return h + [[0]*n for _ in range(n+1-len(h))]

count = 0
def replay(rows,n):
    global count
    basis = [[0]*n for _ in range(n)]
    prefix = []
    for row in rows:
        incoming = Storage(basis+[row])
        before = [r[:] for r in incoming.rows]
        result = Storage([[999]*n for _ in range(n+1)])
        assert insert(result,incoming,n)
        assert incoming.rows == before
        live_basis = Storage(basis)
        residual = Storage([row])
        assert inplace(live_basis,residual,n)
        assert live_basis.rows == result.rows[:n]
        assert residual.rows == [[0]*n]
        prefix.append(row)
        assert result.rows == oracle(prefix,n), (prefix,result.rows)
        basis = result.rows[:n]
        count += 1

rng = random.Random(20260910)
for n in range(1,13):
    for trial in range(25):
        replay([[rng.randrange(-8,9) if rng.randrange(4)==0 else 0
                 for _ in range(n)] for _ in range(2*n+3)],n)
for n in range(1,7):
    replay([[rng.choice([-1,1])*rng.getrandbits(300) for _ in range(n)]
            for _ in range(n+3)],n)
replay([[0,0,0],[0,0,6],[0,-4,2],[2,1,3],[2,1,3],[-1,0,0]],3)
assert count == 4845
print(count,"exact prefixes; skipped pivots, rank deficiency, duplicates and wide signs")
`],{cwd:root,encoding:"utf8",timeout:30000,maxBuffer:2e6});
 assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/4845 exact prefixes/);
});

test("online HNF ablation changes only one call site and adds its helper",()=>{
 const run=cp.spawnSync("python3",["-c",String.raw`
import ast
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location("ablation","bench/class-unit-groups/cubic-incremental-hnf-ablation.py")
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
source=Path("src/lib/sagejs/number_fields/cubic_class_number_native.py").read_text()
result=m.transform(source)
before=ast.parse(source)
after=ast.parse(result)
added=[n for n in after.body if isinstance(n,ast.FunctionDef) and n.name=="_cubic_insert_row_hnf"]
assert len(added)==1
after.body.remove(added[0])
changed=0
for n in ast.walk(after):
    if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=="_cubic_insert_row_hnf":
        assert ast.unparse(n)=="_cubic_insert_row_hnf(reduced, source, dimension)"
        n.func.id="fmpz_matrix_hnf_into"
        n.args.pop()
        changed+=1
assert changed==1
assert ast.dump(before)==ast.dump(after)
try:
    m.transform(result)
    raise AssertionError("accepted duplicate helper")
except ValueError as e:
    assert "already present" in str(e)
print("one call site; all other statements and allocation/certification rules unchanged")
`],{cwd:root,encoding:"utf8",timeout:10000,maxBuffer:2e6});
 assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/all other statements/);
});
